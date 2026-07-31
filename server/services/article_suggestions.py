from __future__ import annotations

import json
import logging
import time
from typing import Any

from services.llm_client import LLMOptions, LLMServiceError, chat
from services.redis_client import cache_get, cache_set
from services.scopus_fields import publication_year, source_title

SUGGESTION_CACHE_TTL = 30 * 24 * 3600
logger = logging.getLogger(__name__)


class ArticleSuggestionError(RuntimeError):
    """Raised when article-specific chat suggestions cannot be generated."""


def _suggestion_key(src: dict[str, Any]) -> str | None:
    sgrid = src.get("sgrid")
    if not sgrid:
        return None
    return f"article:suggestions:sgrid:{sgrid}"


def _compact_list(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value[:12] if item)
    return str(value or "")


def _article_context(src: dict[str, Any]) -> str:
    authors = src.get("authors") or []
    author_names = []
    for author in authors[:8] if isinstance(authors, list) else []:
        if not isinstance(author, dict):
            continue
        name = " ".join(
            part
            for part in (
                author.get("givenName") or author.get("given"),
                author.get("familyName") or author.get("family"),
            )
            if part
        )
        if name:
            author_names.append(name)

    return "\n".join(
        [
            f"TITLE: {src.get('title') or '(unknown)'}",
            f"ABSTRACT: {src.get('abstract') or '(no abstract available)'}",
            f"KEYWORDS: {_compact_list(src.get('keywords'))}",
            f"SOURCE: {source_title(src) or '(unknown)'}",
            f"PUBLICATION YEAR: {publication_year(src) or '(unknown)'}",
            f"AUTHORS: {_compact_list(author_names)}",
        ]
    )


def _sanitize_item(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    label = str(item.get("label") or "").strip()
    prompt = str(item.get("prompt") or "").strip()
    if not label or not prompt:
        return None
    return {
        "label": label,
        "prompt": prompt[:500],
    }


def _sanitize_suggestions(payload: Any) -> dict[str, list[dict[str, str]]]:
    if isinstance(payload, dict) and isinstance(payload.get("suggestions"), dict):
        payload = payload["suggestions"]
    if not isinstance(payload, dict):
        raise ArticleSuggestionError("MOS LLM returned non-object suggestions")

    questions = [_sanitize_item(item) for item in payload.get("questions", [])]
    actions = [_sanitize_item(item) for item in payload.get("actions", [])]
    clean_questions = [item for item in questions if item][:3]
    clean_actions = [item for item in actions if item][:3]
    if len(clean_questions) < 3 or len(clean_actions) < 3:
        raise ArticleSuggestionError("MOS LLM returned incomplete suggestions")
    return {
        "questions": clean_questions,
        "actions": clean_actions,
    }


async def get_article_suggestions(src: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    total_start = time.perf_counter()
    key = _suggestion_key(src)
    outcome = "error"
    cache_status = "miss"
    if key:
        cached = await cache_get(key)
        if isinstance(cached, dict):
            cache_status = "hit"
            try:
                suggestions = _sanitize_suggestions(cached)
                outcome = "cache_hit"
                return suggestions
            finally:
                logger.info(
                    "article_suggestions.get_article_suggestions elapsed_ms=%.1f outcome=%s cache=%s",
                    (time.perf_counter() - total_start) * 1000,
                    outcome,
                    cache_status,
                )

    try:
        mos_start = time.perf_counter()
        content = await chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You generate article-specific quick prompts for PaperLens.\n"
                        "Return only valid JSON with keys questions and actions.\n"
                        "Each key must contain exactly 3 objects with string label and prompt fields.\n"
                        "Base every item on concrete details from the title, abstract, keywords, source, or year.\n"
                        "Prefer named concepts from the article over broad research words.\n"
                        "\n"
                        "Questions:\n"
                        "- Write questions a researcher might ask after seeing this exact article.\n"
                        "- Labels must be specific, natural questions, 6-14 words.\n"
                        "- Ask about the article's population, intervention, comparison, outcome, dataset, method, finding, or limitation when present.\n"
                        "- Avoid generic labels like 'What are the key findings?' or 'What methods were used?'.\n"
                        "\n"
                        "Actions:\n"
                        "- Actions are chat prompt buttons, not external commands.\n"
                        "- Labels must be compact verb phrases, 2-4 words, under 30 characters.\n"
                        "- Count letters, spaces, and punctuation before returning JSON.\n"
                        "- Rewrite any action label longer than 30 characters before returning.\n"
                        "- Every action label must include an article-specific noun phrase or concept.\n"
                        "- Good short style: 'Compare AI searches' (19), "
                        "'Check sensitivity' (17), 'Find missed articles' (20).\n"
                        "- Do not copy example labels unless those terms appear in the article context.\n"
                        "- Bad style: 'List key findings', 'Detail methods used', 'Identify outcomes', 'Summarize article'.\n"
                        "\n"
                        "Prompts:\n"
                        "- Prompts must ask the assistant to answer only from the provided article context.\n"
                        "- Prompts must name the same article-specific concept as the label.\n"
                        "- If the context lacks enough detail, ask for what can be inferred and what is missing.\n"
                        "\n"
                        "Output shape:\n"
                        "{\"questions\":[{\"label\":\"...\",\"prompt\":\"...\"}],"
                        "\"actions\":[{\"label\":\"...\",\"prompt\":\"...\"}]}\n"
                        "Return JSON only. Do not wrap it in markdown."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Create PaperLens quick prompts for this article. Avoid reusable generic buttons.\n\n"
                        f"{_article_context(src)}"
                    ),
                },
            ],
            LLMOptions(response_format={"type": "json_object"}),
        )
        logger.info(
            "article_suggestions.mos elapsed_ms=%.1f",
            (time.perf_counter() - mos_start) * 1000,
        )
    except LLMServiceError as exc:
        logger.info(
            "article_suggestions.mos elapsed_ms=%.1f outcome=error",
            (time.perf_counter() - mos_start) * 1000 if "mos_start" in locals() else 0,
        )
        raise ArticleSuggestionError(f"MOS LLM suggestion generation failed: {exc}") from exc

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ArticleSuggestionError("MOS LLM returned invalid JSON suggestions") from exc

    suggestions = _sanitize_suggestions(parsed)
    if key:
        await cache_set(key, suggestions, SUGGESTION_CACHE_TTL)
    outcome = "generated"
    logger.info(
        "article_suggestions.get_article_suggestions elapsed_ms=%.1f outcome=%s cache=%s",
        (time.perf_counter() - total_start) * 1000,
        outcome,
        cache_status,
    )
    return suggestions
