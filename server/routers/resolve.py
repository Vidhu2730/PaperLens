import asyncio
import logging
import re
import unicodedata
from difflib import SequenceMatcher
from hashlib import sha256
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, HTTPException, Query, Request

from db import get_pool, normalize_email
from services.article_suggestions import (
    ArticleSuggestionError,
    get_article_suggestions,
)
from services.es_client import (
    ElasticsearchLookupError,
    ScopusArticle,
    fetch_scopus_article_by_doi,
    fetch_scopus_article_by_sgrid,
)
from services.mos_client import MosClientError, MosSdkError, lexical_search_articles
from services.project_evaluation import ProjectEvaluationError, evaluate_article_for_project
from services.redis_client import cache_get, cache_set
from services.zotero_client import (
    ZoteroArticleMetadata,
    ZoteroLookupError,
    clean_doi,
    resolve_article_metadata_from_url,
)

_RESOLVE_TTL = 30 * 24 * 3600  # 30 days
_RESOLVE_NEGATIVE_TTL = 24 * 3600
_LEXICAL_RESULTS = 5
_MIN_TITLE_SIMILARITY = 0.94
_MIN_USEFUL_TITLE_WORDS = 5
_TRACKING_PARAMS = {
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "msclkid",
}
_TITLE_TOKEN_RE = re.compile(r"[^a-z0-9]+")
_STOPWORDS = {
    "and",
    "for",
    "from",
    "into",
    "the",
    "this",
    "that",
    "with",
}

logger = logging.getLogger(__name__)
router = APIRouter()


def _normalize_url(url: str) -> str:
    try:
        parsed = urlparse(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid URL")

    if not parsed.scheme or not parsed.netloc:
        raise HTTPException(status_code=400, detail="URL must include scheme and host")

    params = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in _TRACKING_PARAMS
    ]
    query = urlencode(sorted(params), doseq=True)

    return urlunparse((
        parsed.scheme.lower(),
        parsed.netloc.lower(),
        parsed.path,
        parsed.params,
        query,
        "",
    ))


def _resolve_cache_key(normalized_url: str, doi: str | None = None) -> str:
    key_parts = [normalized_url]
    if doi:
        key_parts.append(f"doi:{doi.lower()}")
    digest = sha256("|".join(key_parts).encode("utf-8")).hexdigest()
    return f"resolve:url:v3:{digest}"


def _doi_from_url_query(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except ValueError:
        return None

    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key.lower() != "doi":
            continue
        doi = clean_doi(value)
        if doi:
            return doi
    return None


def _normalize_title(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = _TITLE_TOKEN_RE.sub(" ", normalized.lower())
    return " ".join(normalized.split())


def _useful_title_words(normalized_title: str) -> list[str]:
    return [
        word
        for word in normalized_title.split()
        if len(word) > 2 and word not in _STOPWORDS
    ]


def _title_similarity(left: str | None, right: str | None) -> float:
    normalized_left = _normalize_title(left)
    normalized_right = _normalize_title(right)
    if not normalized_left or not normalized_right:
        return 0.0
    return SequenceMatcher(None, normalized_left, normalized_right).ratio()


def _article_title(article: object) -> str | None:
    value = getattr(article, "title", None)
    return value if isinstance(value, str) else None


def _article_year(article: object) -> int | None:
    value = getattr(article, "publicationYear", None) or getattr(article, "year", None)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _article_sgrid(article: object) -> str | None:
    value = getattr(article, "sgrid", None)
    return str(value) if value else None


def _request_email(request: Request | None) -> str | None:
    if request is None:
        return None
    headers = getattr(request, "headers", {})
    raw_email = headers.get("X-User-Email") or headers.get("x-user-email")
    try:
        return normalize_email(raw_email)
    except HTTPException:
        return None


async def _current_project_for_request(request: Request | None) -> Any | None:
    email = _request_email(request)
    if not email or request is None:
        return None

    try:
        pool = await get_pool(request)
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                """
                SELECT id, current_project_id
                FROM users
                WHERE email = $1
                """,
                email,
            )
            if not user or not user["current_project_id"]:
                return None

            return await conn.fetchrow(
                """
                SELECT id, user_id, name, description, criteria, created_at, updated_at
                FROM projects
                WHERE id = $1 AND user_id = $2
                """,
                user["current_project_id"],
                user["id"],
            )
    except Exception:
        logger.exception("resolve.project_match.current_project_lookup_failed")
        return None


def _project_match_summary(evaluation: Any) -> dict[str, Any] | None:
    if not isinstance(evaluation, dict):
        logger.warning("resolve.project_match.malformed_evaluation type=%s", type(evaluation).__name__)
        return None

    overall = evaluation.get("llm_overall")
    if not isinstance(overall, dict):
        logger.warning("resolve.project_match.malformed_evaluation missing_llm_overall=true")
        return None

    try:
        rating_level = int(round(float(overall["rating_level"])))
        score_percent = int(round(float(overall["score_percent"])))
    except (KeyError, TypeError, ValueError):
        logger.warning("resolve.project_match.malformed_evaluation invalid_score=true")
        return None

    rating_label = str(overall.get("rating_label") or "").strip()
    project_id = evaluation.get("project_id")
    project_name = str(evaluation.get("project_name") or "").strip()
    if not project_id or not project_name or not rating_label or not 1 <= rating_level <= 5:
        logger.warning("resolve.project_match.malformed_evaluation invalid_summary=true")
        return None

    return {
        "project_id": str(project_id),
        "project_name": project_name,
        "rating_level": rating_level,
        "rating_label": rating_label,
        "score_percent": score_percent,
    }


async def _project_match_for_request(request: Request | None, sgrid: str | None) -> dict[str, Any] | None:
    if not sgrid:
        return None

    project = await _current_project_for_request(request)
    if not project:
        return None

    try:
        evaluation = await evaluate_article_for_project(sgrid, project)
    except ProjectEvaluationError:
        logger.info("resolve.project_match.evaluation_failed sgrid=%s", sgrid, exc_info=True)
        return None
    except Exception:
        logger.exception("resolve.project_match.unexpected_error sgrid=%s", sgrid)
        return None

    return _project_match_summary(evaluation)


def _resolve_response_from_cache(cached: dict[str, Any]) -> dict[str, Any]:
    response = dict(cached)
    response.pop("_suggestion_prompt_version", None)
    response.pop("project_match", None)
    return response


def _cacheable_resolve_response(response: dict[str, Any]) -> dict[str, Any]:
    cache_payload = dict(response)
    cache_payload.pop("project_match", None)
    return cache_payload


def _years_match(zotero_year: int | None, article_year: int | None) -> bool:
    if zotero_year is None or article_year is None:
        return True
    return abs(zotero_year - article_year) <= 1


async def _resolve_by_lexical_search(metadata: ZoteroArticleMetadata) -> ScopusArticle | None:
    normalized_title = _normalize_title(metadata.title)
    if len(_useful_title_words(normalized_title)) < _MIN_USEFUL_TITLE_WORDS:
        return None

    starting_year = max(1986, metadata.year - 1) if metadata.year else 1986
    articles = await lexical_search_articles(
        query=normalized_title,
        number_of_results=_LEXICAL_RESULTS,
        starting_year=starting_year,
    )
    if not articles:
        return None

    first = articles[0]
    similarity = _title_similarity(metadata.title, _article_title(first))
    article_year = _article_year(first)
    sgrid = _article_sgrid(first)
    if not sgrid or similarity < _MIN_TITLE_SIMILARITY or not _years_match(metadata.year, article_year):
        logger.info(
            "resolve.lexical_rejected similarity=%.3f zotero_year=%s article_year=%s sgrid=%s",
            similarity,
            metadata.year,
            article_year,
            sgrid,
        )
        return None

    try:
        return await fetch_scopus_article_by_sgrid(sgrid)
    except ElasticsearchLookupError:
        raise


@router.get("/resolve")
async def resolve(
    request: Request = None,
    url: str = Query(..., description="Full URL of the article page"),
    doi: str | None = Query(default=None, description="DOI extracted from page metadata"),
):
    normalized_url = _normalize_url(url)
    requested_doi = _doi_from_url_query(url) or clean_doi(doi)
    cache_key = _resolve_cache_key(normalized_url, requested_doi)
    cached = await cache_get(cache_key)
    if isinstance(cached, dict) and cached.get("found") is False:
        raise HTTPException(status_code=404, detail=cached.get("detail") or "DOI not found for this URL")
    if isinstance(cached, dict) and cached.get("sgrid"):
        response = _resolve_response_from_cache(cached)
        response["project_match"] = await _project_match_for_request(request, response.get("sgrid"))
        return response

    result: ScopusArticle | None = None
    resolution_path = "miss"

    if requested_doi:
        try:
            result = await fetch_scopus_article_by_doi(requested_doi)
        except ElasticsearchLookupError as exc:
            raise HTTPException(status_code=503, detail="Failed to query Scopus index") from exc
        if result:
            resolution_path = "url_doi"

    metadata: ZoteroArticleMetadata | None = None
    if not result:
        try:
            metadata = await resolve_article_metadata_from_url(url)
        except ZoteroLookupError as exc:
            raise HTTPException(status_code=503, detail="Failed to resolve article metadata with Zotero") from exc
        if not metadata and not requested_doi:
            await cache_set(
                cache_key,
                {"found": False, "detail": "Article metadata not found for this URL"},
                ttl=_RESOLVE_NEGATIVE_TTL,
            )
            raise HTTPException(status_code=404, detail="Article metadata not found for this URL")

    if not result and metadata and metadata.doi and metadata.doi.lower() != (requested_doi or "").lower():
        try:
            result = await fetch_scopus_article_by_doi(metadata.doi)
        except ElasticsearchLookupError as exc:
            raise HTTPException(status_code=503, detail="Failed to query Scopus index") from exc
        if result:
            resolution_path = "zotero_doi"

    if not result and metadata:
        try:
            result = await _resolve_by_lexical_search(metadata)
        except ElasticsearchLookupError as exc:
            raise HTTPException(status_code=503, detail="Failed to query Scopus index") from exc
        except MosClientError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except MosSdkError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if result:
            resolution_path = "lexical_title"

    if not result:
        await cache_set(
            cache_key,
            {"found": False, "detail": "Article not found in Scopus index"},
            ttl=_RESOLVE_NEGATIVE_TTL,
        )
        raise HTTPException(status_code=404, detail="Article not found in Scopus index")

    result_payload = result.model_dump(mode="json", exclude_none=True)
    try:
        suggestions, project_match = await asyncio.gather(
            get_article_suggestions(result_payload),
            _project_match_for_request(request, result.sgrid),
        )
    except ArticleSuggestionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    sgrid = result.sgrid
    pii = result.pii
    resolved_doi = result.doi or (metadata.doi if metadata else None) or requested_doi
    response = {
        "doi": resolved_doi,
        "sgrid": sgrid,
        "pii": pii,
        "scopus_url": f"https://www.scopus.com/pages/publications/{sgrid}" if sgrid else None,
        "sciencedirect_url": f"https://www.sciencedirect.com/science/article/pii/{pii}" if pii else None,
        "suggestions": suggestions,
        "project_match": project_match,
    }
    logger.info("resolve.completed path=%s doi=%s sgrid=%s", resolution_path, resolved_doi, sgrid)
    await cache_set(cache_key, _cacheable_resolve_response(response), ttl=_RESOLVE_TTL)
    return response
