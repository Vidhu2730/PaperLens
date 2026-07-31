import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_DOI_RE = re.compile(r'\b(10\.\d{4,9}/[^\s"<>]+)', re.IGNORECASE)
_PMID_RE = re.compile(r'\bPMID:\s*(\d+)\b', re.IGNORECASE)
_YEAR_RE = re.compile(r'\b(19|20)\d{2}\b')


class ZoteroLookupError(RuntimeError):
    """Raised when Zotero Translation Server cannot be reached."""


@dataclass
class ZoteroArticleMetadata:
    doi: str | None = None
    pmid: str | None = None
    title: str | None = None
    year: int | None = None
    publication_title: str | None = None
    issn: str | None = None
    authors: list[str] = field(default_factory=list)


def _get_zotero_translation_url() -> str:
    return os.environ.get("ZOTERO_TRANSLATION_URL", "http://localhost:1969").rstrip("/")


def clean_doi(value: str | None) -> str | None:
    if not value:
        return None
    doi = value.strip()
    doi = re.sub(r"^doi:\s*", "", doi, flags=re.IGNORECASE)
    doi = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    doi = doi.rstrip(".,;")
    match = _DOI_RE.search(doi)
    return match.group(1) if match else None


def _clean_doi(value: str | None) -> str | None:
    return clean_doi(value)


def _iter_zotero_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
        return [payload]
    return []


def _doi_from_zotero_payload(payload: Any) -> str | None:
    for item in _iter_zotero_items(payload):
        doi = _clean_doi(item.get("DOI") or item.get("doi"))
        if doi:
            return doi
    return None


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _extract_year(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    match = _YEAR_RE.search(value)
    return int(match.group(0)) if match else None


def _extract_pmid(extra: Any) -> str | None:
    if not isinstance(extra, str):
        return None
    match = _PMID_RE.search(extra)
    return match.group(1) if match else None


def _extract_authors(creators: Any) -> list[str]:
    if not isinstance(creators, list):
        return []

    authors: list[str] = []
    for creator in creators:
        if not isinstance(creator, dict):
            continue
        if creator.get("creatorType") not in (None, "author"):
            continue
        first = _clean_text(creator.get("firstName"))
        last = _clean_text(creator.get("lastName"))
        name = " ".join(part for part in (first, last) if part).strip()
        if name:
            authors.append(name)
    return authors


def _metadata_from_item(item: dict[str, Any]) -> ZoteroArticleMetadata:
    return ZoteroArticleMetadata(
        doi=_clean_doi(item.get("DOI") or item.get("doi")),
        pmid=_extract_pmid(item.get("extra")),
        title=_clean_text(item.get("title")),
        year=_extract_year(item.get("date")),
        publication_title=_clean_text(item.get("publicationTitle")),
        issn=_clean_text(item.get("ISSN") or item.get("issn")),
        authors=_extract_authors(item.get("creators")),
    )


def _metadata_from_zotero_payload(payload: Any) -> ZoteroArticleMetadata | None:
    fallback: ZoteroArticleMetadata | None = None
    for item in _iter_zotero_items(payload):
        metadata = _metadata_from_item(item)
        if metadata.doi:
            return metadata
        if not fallback and (metadata.title or metadata.pmid):
            fallback = metadata
    return fallback


async def resolve_article_metadata_from_url(url: str) -> ZoteroArticleMetadata | None:
    start = time.perf_counter()
    outcome = "error"
    endpoint = _get_zotero_translation_url()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post(
                    f"{endpoint}/web",
                    content=url,
                    headers={"Content-Type": "text/plain"},
                )
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                status = getattr(exc.response, "status_code", None)
                body = getattr(exc.response, "text", "")[:500] if getattr(exc, "response", None) else ""
                logger.warning(
                    "Zotero Translation Server request failed status=%s body=%s",
                    status,
                    body,
                )
                raise ZoteroLookupError("Failed to query Zotero Translation Server") from exc

        try:
            payload = resp.json()
        except ValueError as exc:
            raise ZoteroLookupError("Zotero Translation Server returned invalid JSON") from exc

        metadata = _metadata_from_zotero_payload(payload)
        outcome = "hit" if metadata and metadata.doi else "metadata" if metadata else "miss"
        return metadata
    finally:
        logger.info(
            "zotero_client.resolve_article_metadata_from_url elapsed_ms=%.1f outcome=%s",
            (time.perf_counter() - start) * 1000,
            outcome,
        )


async def resolve_doi_from_url(url: str) -> str | None:
    metadata = await resolve_article_metadata_from_url(url)
    return metadata.doi if metadata else None
