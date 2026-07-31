from fastapi import APIRouter, HTTPException, Query

from services.article_suggestions import ArticleSuggestionError, get_article_suggestions
from services.es_client import ElasticsearchLookupError, fetch_scopus_article_by_sgrid
from services.mos_client import MosClientError, MosSdkError, vector_search_articles
from services.redis_client import cache_get, cache_set
from services.search_results import serialize_mos_article
from services.scopus_fields import sciencedirect_url, scopus_url

router = APIRouter()

SIMILAR_ARTICLES_CACHE_TTL = 30 * 24 * 3600
SIMILAR_ARTICLES_DEFAULT_SIZE = 10
DEFAULT_STARTING_YEAR = 2000


@router.get("/article")
async def article(
    sgrid: str | None = Query(default=None),
):
    if not sgrid:
        raise HTTPException(status_code=400, detail="Provide sgrid query param")

    try:
        article = await fetch_scopus_article_by_sgrid(sgrid)
    except ElasticsearchLookupError as exc:
        raise HTTPException(status_code=503, detail="Failed to query Scopus index") from exc

    if not article:
        raise HTTPException(status_code=404, detail="Article not found in Scopus index")

    payload = article.model_dump(mode="json")
    try:
        suggestions = await get_article_suggestions(payload)
    except ArticleSuggestionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    payload.update({
        "scopus_url": scopus_url(payload),
        "sciencedirect_url": sciencedirect_url(payload),
        "suggestions": suggestions,
    })
    return payload


@router.get("/article/{sgrid}/similar")
async def similar_articles(
    sgrid: str,
    size: int = Query(default=SIMILAR_ARTICLES_DEFAULT_SIZE, ge=1, le=25),
):
    cache_key = f"article:similar:sgrid:{sgrid}:v1:size:{size}"
    cached = await cache_get(cache_key)
    if isinstance(cached, dict):
        return cached

    try:
        article = await fetch_scopus_article_by_sgrid(sgrid)
    except ElasticsearchLookupError as exc:
        raise HTTPException(status_code=503, detail="Failed to query Scopus index") from exc

    if not article:
        raise HTTPException(status_code=404, detail="Article not found in Scopus index")

    query = (article.title or "").strip()
    if len(query) < 2:
        payload = {"sgrid": sgrid, "query": query, "count": 0, "results": []}
        await cache_set(cache_key, payload, SIMILAR_ARTICLES_CACHE_TTL)
        return payload

    try:
        candidates = await vector_search_articles(
            query=query,
            number_of_results=size + 1,
            starting_year=DEFAULT_STARTING_YEAR,
        )
    except MosClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except MosSdkError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    current_doi = (article.doi or "").strip().lower()
    results = []
    for candidate in candidates:
        candidate_sgrid = (getattr(candidate, "sgrid", None) or "").strip()
        candidate_doi = (
            getattr(candidate, "DOI", None)
            or getattr(candidate, "doi", None)
            or ""
        ).strip().lower()
        if candidate_sgrid == sgrid or (current_doi and candidate_doi == current_doi):
            continue
        results.append(serialize_mos_article(candidate))
        if len(results) >= size:
            break

    payload = {"sgrid": sgrid, "query": query, "count": len(results), "results": results}
    await cache_set(cache_key, payload, SIMILAR_ARTICLES_CACHE_TTL)
    return payload
