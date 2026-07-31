from __future__ import annotations

from typing import Any


def normalize_authors(value: Any) -> list[dict[str, str]]:
    authors: list[dict[str, str]] = []
    if not isinstance(value, list):
        return authors

    for author in value:
        if not isinstance(author, dict):
            continue
        authors.append({
            "auid": str(author.get("auid") or ""),
            "given": str(author.get("givenName") or author.get("given") or ""),
            "family": str(author.get("familyName") or author.get("family") or ""),
            "initials": str(author.get("initials") or ""),
        })
    return authors


def normalize_keywords(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def normalize_citations(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None:
        return []
    text = str(value).strip()
    return [text] if text else []


def source_title(src: dict[str, Any]) -> str | None:
    value = src.get("sourceTitle") or src.get("journalTitle") or src.get("source_title")
    return str(value) if value else None


def publication_year(src: dict[str, Any]) -> int | None:
    value = src.get("publicationYear") or src.get("issueYear") or src.get("year")
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def scopus_url(src: dict[str, Any]) -> str | None:
    sgrid = src.get("sgrid")
    if sgrid:
        return f"https://www.scopus.com/pages/publications/{sgrid}"
    link = src.get("scopus_link")
    return str(link) if link else None


def sciencedirect_url(src: dict[str, Any]) -> str | None:
    pii = src.get("pii")
    return f"https://www.sciencedirect.com/science/article/pii/{pii}" if pii else None


def serialize_scopus_source(src: dict[str, Any]) -> dict[str, Any]:
    citations = normalize_citations(src.get("citations"))
    return {
        "sgrid": src.get("sgrid"),
        "doi": src.get("doi") or src.get("DOI"),
        "pii": src.get("pii"),
        "title": src.get("title"),
        "abstract": src.get("abstract"),
        "authors": normalize_authors(src.get("authors")),
        "sourceTitle": source_title(src),
        "keywords": normalize_keywords(src.get("keywords")),
        "publicationYear": publication_year(src),
        "citations": citations,
        "citationCount": len(citations),
        "relevance": src.get("relevance"),
        "scopus_url": scopus_url(src),
        "sciencedirect_url": sciencedirect_url(src),
    }
