import os
import logging
import time
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict

from services.redis_client import cache_get, cache_set

INDEX = "mos-scopus-vector"
FULLTEXT_INDEX = "mos-sd-fulltext"
ARTICLE_CACHE_TTL = 30 * 24 * 3600
_MISS = {"found": False}
logger = logging.getLogger(__name__)


class ElasticsearchLookupError(RuntimeError):
    """Raised when the Scopus Elasticsearch index cannot be queried."""


class ScopusAuthor(BaseModel):
    model_config = ConfigDict(extra="ignore")

    familyName: str | None = None
    givenName: str | None = None
    initials: str | None = None


class ScopusArticle(BaseModel):
    model_config = ConfigDict(extra="ignore")

    issueYear: str | int | None = None
    journalTitle: str | None = None
    publicationYear: int | None = None
    sourceTitle: str | None = None
    sgrid: str | None = None
    doi: str | None = None
    pii: str | None = None
    title: str | None = None
    abstract: str | None = None
    authors: list[ScopusAuthor] | None = None
    keywords: str | list[str] | None = None
    citations: int | list[str] | list[int] | None = None
    db: str | list[str] | None = None


SCOPUS_ARTICLE_SOURCE_FIELDS = list(ScopusArticle.model_fields)


class SDFullTextDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")

    fulltext: str | None = None


def _get_elasticsearch_url() -> str:
    url = os.environ.get("ELASTICSEARCH_URL")
    if not url:
        raise ElasticsearchLookupError("ELASTICSEARCH_URL is not configured")
    return url.rstrip("/")


async def _search(payload: dict) -> list[dict]:
    start = time.perf_counter()
    outcome = "error"
    hits: list[dict] = []
    url = _get_elasticsearch_url()
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(f"{url}/{INDEX}/_search", json=payload)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.info(
                "es_client._search elapsed_ms=%.1f index=%s outcome=%s",
                (time.perf_counter() - start) * 1000,
                INDEX,
                outcome,
            )
            raise ElasticsearchLookupError("Failed to query Elasticsearch") from exc
    hits = resp.json().get("hits", {}).get("hits", [])
    outcome = "ok"
    logger.info(
        "es_client._search elapsed_ms=%.1f index=%s outcome=%s hits=%s",
        (time.perf_counter() - start) * 1000,
        INDEX,
        outcome,
        len(hits),
    )
    return hits


async def query_by_doi(doi: str) -> dict | None:
    """Backwards-compatible: returns sgrid/pii for a DOI."""
    start = time.perf_counter()
    outcome = "error"
    try:
        article = await fetch_scopus_article_by_doi(doi)
        if not article:
            outcome = "miss"
            return None
        outcome = "hit"
        return {"sgrid": article.sgrid, "pii": article.pii}
    finally:
        logger.info(
            "es_client.query_by_doi elapsed_ms=%.1f outcome=%s doi=%s",
            (time.perf_counter() - start) * 1000,
            outcome,
            doi,
        )


def _scopus_article_from_cache(value: Any) -> ScopusArticle | None:
    if not isinstance(value, dict):
        return None
    return ScopusArticle.model_validate(value)


def _scopus_article_from_hit(hit: dict) -> ScopusArticle | None:
    src = hit.get("_source")
    if not isinstance(src, dict):
        return None
    return ScopusArticle.model_validate(src)


async def fetch_scopus_article_by_doi(doi: str) -> ScopusArticle | None:
    start = time.perf_counter()
    outcome = "error"
    cache_status = "miss"
    cache_key = f"article:scopus:doi:{doi.lower()}"
    try:
        cached = await cache_get(cache_key)
        if isinstance(cached, dict):
            cache_status = "hit"
            if cached.get("found") is False:
                outcome = "miss"
                return None
            outcome = "hit"
            return _scopus_article_from_cache(cached)

        hits = await _search({
            "query": {"term": {"doi.keyword": doi}},
            "size": 1,
            "_source": {"includes": SCOPUS_ARTICLE_SOURCE_FIELDS},
        })
        article: ScopusArticle | None = None
        if not hits:
            outcome = "miss"
        else:
            article = _scopus_article_from_hit(hits[0])
        if article is None:
            outcome = "miss"
            await cache_set(cache_key, _MISS, ARTICLE_CACHE_TTL)
            return None

        outcome = "hit"
        await cache_set(cache_key, article.model_dump(mode="json", exclude_none=True), ARTICLE_CACHE_TTL)
        return article
    finally:
        logger.info(
            "es_client.fetch_scopus_article_by_doi elapsed_ms=%.1f outcome=%s cache=%s doi=%s",
            (time.perf_counter() - start) * 1000,
            outcome,
            cache_status,
            doi,
        )


async def fetch_scopus_article_by_sgrid(sgrid: str) -> ScopusArticle | None:
    start = time.perf_counter()
    outcome = "error"
    cache_status = "miss"
    cache_key = f"article:scopus:sgrid:{sgrid}"
    try:
        cached = await cache_get(cache_key)
        if isinstance(cached, dict):
            cache_status = "hit"
            if cached.get("found") is False:
                outcome = "miss"
                return None
            outcome = "hit"
            return _scopus_article_from_cache(cached)

        hits = await _search({
            "query": {"term": {"sgrid": sgrid}},
            "size": 1,
            "_source": {"includes": SCOPUS_ARTICLE_SOURCE_FIELDS},
        })
        article: ScopusArticle | None = None
        if not hits:
            outcome = "miss"
        else:
            article = _scopus_article_from_hit(hits[0])
        if article is None:
            outcome = "miss"
            await cache_set(cache_key, _MISS, ARTICLE_CACHE_TTL)
            return None

        outcome = "hit"
        await cache_set(cache_key, article.model_dump(mode="json", exclude_none=True), ARTICLE_CACHE_TTL)
        return article
    finally:
        logger.info(
            "es_client.fetch_scopus_article_by_sgrid elapsed_ms=%.1f outcome=%s cache=%s sgrid=%s",
            (time.perf_counter() - start) * 1000,
            outcome,
            cache_status,
            sgrid,
        )


async def fetch_fulltext_by_pii(pii: str) -> str | None:
    """Fetch article full text from mos-sd-fulltext for a given PII.

    Returns the populated fulltext field, or None if unavailable.
    """
    start = time.perf_counter()
    outcome = "error"
    cache_status = "miss"
    hit_count = 0
    cache_key = f"article:fulltext:pii:{pii}"
    try:
        cached = await cache_get(cache_key)
        if isinstance(cached, str):
            cache_status = "hit"
            outcome = "hit"
            return cached
        if isinstance(cached, dict) and cached.get("found") is False:
            cache_status = "hit"
            outcome = "miss"
            return None

        payload = {
            "query": {"term": {"pii": pii}},
            "size": 1,
            "_source": {"includes": ["fulltext"]},
        }
        url = _get_elasticsearch_url()
        search_start = time.perf_counter()
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.post(f"{url}/{FULLTEXT_INDEX}/_search", json=payload)
            except httpx.HTTPError:
                logger.info(
                    "es_client.fetch_fulltext_by_pii.search elapsed_ms=%.1f index=%s outcome=error pii=%s",
                    (time.perf_counter() - search_start) * 1000,
                    FULLTEXT_INDEX,
                    pii,
                )
                outcome = "miss"
                return None
            if resp.status_code != 200:
                logger.info(
                    "es_client.fetch_fulltext_by_pii.search elapsed_ms=%.1f index=%s outcome=status_%s pii=%s",
                    (time.perf_counter() - search_start) * 1000,
                    FULLTEXT_INDEX,
                    resp.status_code,
                    pii,
                )
                outcome = "miss"
                return None
            hits = resp.json().get("hits", {}).get("hits", [])
            hit_count = len(hits)
        logger.info(
            "es_client.fetch_fulltext_by_pii.search elapsed_ms=%.1f index=%s outcome=ok hits=%s pii=%s",
            (time.perf_counter() - search_start) * 1000,
            FULLTEXT_INDEX,
            hit_count,
            pii,
        )
        if not hits:
            await cache_set(cache_key, _MISS, ARTICLE_CACHE_TTL)
            outcome = "miss"
            return None

        src = hits[0].get("_source")
        document = SDFullTextDocument.model_validate(src) if isinstance(src, dict) else None
        fulltext = document.fulltext.strip() if document and document.fulltext and document.fulltext.strip() else None
        await cache_set(cache_key, fulltext if fulltext else _MISS, ARTICLE_CACHE_TTL)
        outcome = "hit" if fulltext else "miss"
        return fulltext
    finally:
        logger.info(
            "es_client.fetch_fulltext_by_pii elapsed_ms=%.1f outcome=%s cache=%s hits=%s pii=%s",
            (time.perf_counter() - start) * 1000,
            outcome,
            cache_status,
            hit_count,
            pii,
        )
