from typing import Any

from services.scopus_fields import normalize_citations


def serialize_mos_article(article: Any) -> dict:
    citations = normalize_citations(getattr(article, "citations", None))
    pii = getattr(article, "pii", None)
    return {
        "sgrid": getattr(article, "sgrid", None),
        "doi": getattr(article, "DOI", None) or getattr(article, "doi", None),
        "pii": pii,
        "title": getattr(article, "title", None),
        "abstract": getattr(article, "abstract", None),
        "authors": [
            {
                "auid": getattr(author, "auid", ""),
                "given": getattr(author, "givenName", ""),
                "family": getattr(author, "familyName", ""),
                "initials": getattr(author, "initials", ""),
            }
            for author in (getattr(article, "authors", None) or [])
        ],
        "sourceTitle": getattr(article, "sourceTitle", None) or getattr(article, "source_title", None),
        "keywords": getattr(article, "keywords", None) or [],
        "publicationYear": getattr(article, "publicationYear", None) or getattr(article, "year", None),
        "citations": citations,
        "citationCount": len(citations),
        "relevance": getattr(article, "relevance", None),
        "scopus_link": getattr(article, "scopus_link", None),
        "sciencedirect_url": f"https://www.sciencedirect.com/science/article/pii/{pii}" if pii else None,
    }
