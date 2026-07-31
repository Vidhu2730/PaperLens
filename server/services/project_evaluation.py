from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

from services.es_client import ElasticsearchLookupError, fetch_scopus_article_by_sgrid
from services.llm_client import LLMOptions, LLMServiceError, chat
from services.redis_client import cache_get, cache_set
from services.scopus_fields import normalize_keywords, publication_year, source_title

PROMPT_VERSION = "article-project-evaluation-v1"
EVALUATION_CACHE_TTL = 30 * 24 * 3600

RATING_TO_PERCENT = {
    1: 0,
    2: 25,
    3: 50,
    4: 75,
    5: 100,
}
RATING_LABELS = {
    1: "No match",
    2: "Weak match",
    3: "Partial match",
    4: "Strong match",
    5: "Excellent match",
}
LABEL_TO_RATING = {
    "nomatch": 1,
    "weakmatch": 2,
    "partialmatch": 3,
    "strongmatch": 4,
    "excellentmatch": 5,
}

logger = logging.getLogger(__name__)


class ProjectEvaluationError(RuntimeError):
    """Raised when article/project evaluation cannot be completed."""


class ProjectEvaluationArticleNotFound(ProjectEvaluationError):
    """Raised when the requested Scopus article cannot be found."""


class ProjectEvaluationSearchError(ProjectEvaluationError):
    """Raised when Scopus lookup fails."""


def _json_value(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return value


def _criteria_list(value: Any) -> list[str]:
    criteria = _json_value(value, [])
    if not isinstance(criteria, list):
        return []
    return [str(criterion).strip() for criterion in criteria if str(criterion).strip()]


def _compact_list(value: Any, limit: int = 12) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value[:limit] if item)
    return str(value or "")


def _clean_text(value: Any, max_chars: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def _article_dict(article: Any) -> dict[str, Any]:
    if isinstance(article, dict):
        return article
    if hasattr(article, "model_dump"):
        return article.model_dump(mode="json", exclude_none=True)
    return {}


def _project_dict(project: Any) -> dict[str, Any]:
    return {
        "id": project["id"],
        "name": project["name"],
        "description": project["description"],
        "criteria": _criteria_list(project["criteria"]),
    }


def normalize_rating_level(level: Any = None, label: Any = None, fallback: int = 1) -> int:
    try:
        parsed = int(round(float(level)))
    except (TypeError, ValueError):
        parsed = 0
    if 1 <= parsed <= 5:
        return parsed

    normalized_label = "".join(ch for ch in str(label or "").casefold() if ch.isalnum())
    return LABEL_TO_RATING.get(normalized_label, fallback)


def rating_percent(level: int) -> int:
    return RATING_TO_PERCENT[normalize_rating_level(level)]


def _round_score(value: float) -> int:
    return int(value + 0.5)


def computed_overall_score(criteria_scores: list[int], llm_overall_score: int) -> int:
    if not criteria_scores:
        return llm_overall_score
    criteria_average = sum(criteria_scores) / len(criteria_scores)
    return _round_score(criteria_average * 0.8 + llm_overall_score * 0.2)


def _project_context_hash(project: dict[str, Any]) -> str:
    encoded = json.dumps(
        {
            "name": project["name"],
            "description": project.get("description") or "",
            "criteria": project["criteria"],
        },
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _cache_key(sgrid: str, project: dict[str, Any]) -> str:
    return (
        "article:project-evaluation:"
        f"{PROMPT_VERSION}:project:{project['id']}:sgrid:{sgrid}:context:{_project_context_hash(project)}"
    )


def _article_context(article: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"Title: {article.get('title') or '(unknown)'}",
            f"Abstract: {article.get('abstract') or '(no abstract available)'}",
            f"Keywords: {_compact_list(normalize_keywords(article.get('keywords')))}",
            f"Source: {source_title(article) or '(unknown)'}",
            f"Publication year: {publication_year(article) or '(unknown)'}",
        ]
    )


def _project_context(project: dict[str, Any]) -> str:
    criteria_text = "\n".join(
        f"{index + 1}. {criterion}" for index, criterion in enumerate(project["criteria"])
    )
    return "\n".join(
        [
            f"Name: {project['name']}",
            f"Description: {project.get('description') or '(none)'}",
            "Criteria:",
            criteria_text or "(none)",
        ]
    )


def _sanitize_criteria(payload: Any, criteria: list[str]) -> list[dict[str, Any]]:
    raw_items = payload if isinstance(payload, list) else []
    by_criterion: dict[str, dict[str, Any]] = {}
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        criterion = str(item.get("criterion") or "").strip()
        if criterion:
            by_criterion[criterion.casefold()] = item

    results: list[dict[str, Any]] = []
    for criterion in criteria:
        item = by_criterion.get(criterion.casefold(), {})
        level = normalize_rating_level(item.get("rating_level"), item.get("rating_label"))
        results.append(
            {
                "criterion": criterion,
                "rating_level": level,
                "rating_label": RATING_LABELS[level],
                "score_percent": rating_percent(level),
                "evidence": _clean_text(
                    item.get("evidence") or "No evidence was returned for this criterion.",
                    500,
                ),
            }
        )
    return results


def sanitize_llm_evaluation(payload: Any, article: dict[str, Any], project: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ProjectEvaluationError("Project evaluation LLM returned a non-object response")

    raw_overall = payload.get("overall") if isinstance(payload.get("overall"), dict) else {}
    overall_level = normalize_rating_level(
        raw_overall.get("rating_level"),
        raw_overall.get("rating_label"),
    )
    llm_overall_score = rating_percent(overall_level)
    criteria = _sanitize_criteria(payload.get("criteria"), project["criteria"])
    criterion_scores = [item["score_percent"] for item in criteria]
    criterion_average = _round_score(sum(criterion_scores) / len(criterion_scores)) if criterion_scores else None
    final_score = computed_overall_score(criterion_scores, llm_overall_score)

    return {
        "prompt_version": PROMPT_VERSION,
        "project_id": str(project["id"]),
        "project_name": project["name"],
        "sgrid": article.get("sgrid"),
        "article_title": article.get("title"),
        "llm_overall": {
            "rating_level": overall_level,
            "rating_label": RATING_LABELS[overall_level],
            "score_percent": llm_overall_score,
            "reasoning_summary": _clean_text(
                raw_overall.get("reasoning_summary")
                or "The model evaluated this article against the project context.",
                700,
            ),
        },
        "criteria": criteria,
        "criterion_average_score_percent": criterion_average,
        "llm_overall_score_percent": llm_overall_score,
        "computed_overall_score_percent": final_score,
        "match_score": final_score,
    }


async def evaluate_article_for_project(sgrid: str, project_row: Any) -> dict[str, Any]:
    total_start = time.perf_counter()
    project = _project_dict(project_row)
    key = _cache_key(sgrid, project)

    cached = await cache_get(key)
    if isinstance(cached, dict):
        cached["cached"] = True
        logger.info(
            "project_evaluation.evaluate_article_for_project elapsed_ms=%.1f outcome=cache_hit sgrid=%s project_id=%s",
            (time.perf_counter() - total_start) * 1000,
            sgrid,
            project["id"],
        )
        return cached

    try:
        article = await fetch_scopus_article_by_sgrid(sgrid)
    except ElasticsearchLookupError as exc:
        raise ProjectEvaluationSearchError("Failed to query Scopus index") from exc
    if not article:
        raise ProjectEvaluationArticleNotFound("Article not found in Scopus index")

    article_payload = _article_dict(article)
    try:
        content = await chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a scientific article-to-project fit evaluator for PaperLens.\n"
                        "Evaluate how well the article matches the project and each criterion.\n"
                        "Use only the provided article and project context. Do not invent evidence.\n"
                        "Return JSON only. Do not wrap it in markdown.\n"
                        "Use exactly this rating scale: 1 = No match, 2 = Weak match, "
                        "3 = Partial match, 4 = Strong match, 5 = Excellent match."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "PROJECT\n"
                        f"{_project_context(project)}\n\n"
                        "ARTICLE\n"
                        f"{_article_context(article_payload)}\n\n"
                        "Return JSON matching this schema:\n"
                        "{\n"
                        '  "overall": {\n'
                        '    "rating_level": 1,\n'
                        '    "rating_label": "No match|Weak match|Partial match|Strong match|Excellent match",\n'
                        '    "reasoning_summary": "Short explanation grounded in the article text."\n'
                        "  },\n"
                        '  "criteria": [\n'
                        "    {\n"
                        '      "criterion": "Criterion text copied exactly from input",\n'
                        '      "rating_level": 1,\n'
                        '      "rating_label": "No match|Weak match|Partial match|Strong match|Excellent match",\n'
                        '      "evidence": "Short evidence sentence from the provided article context, or explanation of missing evidence."\n'
                        "    }\n"
                        "  ]\n"
                        "}"
                    ),
                },
            ],
            LLMOptions(response_format={"type": "json_object"}),
        )
    except LLMServiceError as exc:
        raise ProjectEvaluationError(f"Project evaluation LLM call failed: {exc}") from exc

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ProjectEvaluationError("Project evaluation LLM returned invalid JSON") from exc

    result = sanitize_llm_evaluation(parsed, article_payload, project)
    result["cached"] = False
    await cache_set(key, result, EVALUATION_CACHE_TTL)
    logger.info(
        "project_evaluation.evaluate_article_for_project elapsed_ms=%.1f outcome=generated sgrid=%s project_id=%s",
        (time.perf_counter() - total_start) * 1000,
        sgrid,
        project["id"],
    )
    return result
