import httpx

IDCONV_URL = "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/"
ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"


class PubMedLookupError(RuntimeError):
    """Raised when NCBI APIs cannot be reached successfully."""


async def _doi_from_idconv(client: httpx.AsyncClient, ncbi_id: str) -> str | None:
    """Try idconv — works only for PMC articles."""
    try:
        r = await client.get(IDCONV_URL, params={"ids": ncbi_id, "format": "json"})
        r.raise_for_status()
    except httpx.HTTPError:
        return None
    records = r.json().get("records", [])
    return (records[0].get("doi") or None) if records else None


async def _doi_from_esummary(client: httpx.AsyncClient, ncbi_id: str, db: str = "pubmed") -> str | None:
    """Fallback: esummary covers paywalled articles that idconv misses."""
    try:
        r = await client.get(
            ESUMMARY_URL,
            params={"db": db, "id": ncbi_id, "retmode": "json"},
        )
        r.raise_for_status()
    except httpx.HTTPError:
        return None
    result = r.json().get("result", {})
    article = result.get(ncbi_id, {})
    for id_entry in article.get("articleids", []):
        if id_entry.get("idtype") == "doi":
            return id_entry.get("value") or None
    return None


async def get_doi(ncbi_id: str) -> str | None:
    """Resolve PMID or PMC ID to DOI.

    ncbi_id: bare PMID (e.g. "36939979") or PMC ID with prefix (e.g. "PMC11416953")
    Tries idconv first (fast, PMC-only), then falls back to esummary (broader coverage).
    """
    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=10.0) as client:
        doi = await _doi_from_idconv(client, ncbi_id)
        if doi:
            return doi

        # idconv only covers PMC; esummary covers all PubMed including paywalled articles.
        # If we have a PMCID and idconv failed, query esummary via db=pmc (strip "PMC" prefix).
        # If we have a bare PMID, query esummary via db=pubmed.
        if ncbi_id.upper().startswith("PMC"):
            pmc_number = ncbi_id[3:]  # "PMC11416953" → "11416953"
            doi = await _doi_from_esummary(client, pmc_number, db="pmc")
        else:
            doi = await _doi_from_esummary(client, ncbi_id, db="pubmed")
        return doi
