import { matchesZoteroScholarlyTarget } from './zoteroScholarlyTargets';

export type PaperType = "pmid" | "pmc" | "doi";

export interface PaperIdentity {
  type: PaperType | null;
  id: string | null;
}

const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s"<>]+)\b/i;
const DOI_META_SELECTORS = [
  'meta[name="citation_doi"]',
  'meta[name="dc.Identifier"]',
  'meta[name="dc.identifier"]',
  'meta[name="DC.Identifier"]',
  'meta[name="prism.doi"]',
  'meta[name="doi"]',
  'meta[property="citation_doi"]',
];

const SCHOLARLY_META_SELECTORS = [
  'meta[name^="citation_"]',
  'meta[name^="dc."]',
  'meta[name^="DC."]',
  'meta[name^="prism."]',
  'meta[name="bepress_citation_title"]',
  'meta[name="eprints.title"]',
  'meta[name="wkhealth_title"]',
  'span.Z3988[title]',
];

const SCHOLARLY_HOST_PATTERNS = [
  /(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/i,
  /(^|\.)ncbi\.nlm\.nih\.gov$/i,
  /(^|\.)doi\.org$/i,
  /(^|\.)arxiv\.org$/i,
  /(^|\.)sciencedirect\.com$/i,
  /(^|\.)scopus\.com$/i,
  /(^|\.)springer\.com$/i,
  /(^|\.)link\.springer\.com$/i,
  /(^|\.)nature\.com$/i,
  /(^|\.)wiley\.com$/i,
  /(^|\.)onlinelibrary\.wiley\.com$/i,
  /(^|\.)tandfonline\.com$/i,
  /(^|\.)ieee\.org$/i,
  /(^|\.)ieeexplore\.ieee\.org$/i,
  /(^|\.)acm\.org$/i,
  /(^|\.)dl\.acm\.org$/i,
  /(^|\.)mdpi\.com$/i,
  /(^|\.)frontiersin\.org$/i,
  /(^|\.)plos\.org$/i,
  /(^|\.)biomedcentral\.com$/i,
  /(^|\.)sagepub\.com$/i,
  /(^|\.)journals\.sagepub\.com$/i,
  /(^|\.)science\.org$/i,
  /(^|\.)cell\.com$/i,
  /(^|\.)biorxiv\.org$/i,
  /(^|\.)medrxiv\.org$/i,
  /(^|\.)jstor\.org$/i,
  /(^|\.)cambridge\.org$/i,
  /(^|\.)oup\.com$/i,
];

function cleanDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  let doi = value.trim();
  doi = doi.replace(/^doi:\s*/i, "");
  doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  doi = doi.replace(/[.,;]+$/g, "");
  return DOI_PATTERN.test(doi) ? doi : null;
}

export function parsePaperUrl(url: string): { type: PaperType | null; id: string | null } {
  const pmidMatch = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
  if (pmidMatch) return { type: "pmid", id: pmidMatch[1] };

  const pmcMatch = url.match(/\/articles\/PMC(\d+)/i);
  if (pmcMatch) return { type: "pmc", id: pmcMatch[1] };

  try {
    const parsedUrl = new URL(url);
    const doi = cleanDoi(parsedUrl.searchParams.get("doi"));
    if (doi) return { type: "doi", id: doi };
  } catch {
    // Fall back to pattern checks for malformed or partial URLs.
  }

  const doiOrgMatch = url.match(/doi\.org\/(10\.\d{4,9}\/[^\s?#]+)/i);
  const doiOrgValue = cleanDoi(doiOrgMatch ? decodeURIComponent(doiOrgMatch[1]) : null);
  if (doiOrgValue) return { type: "doi", id: doiOrgValue };

  return { type: null, id: null };
}

function hasScholarlyJsonLd(doc: Document): boolean {
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
  return scripts.some((script) => {
    const text = script.textContent ?? '';
    return /ScholarlyArticle|MedicalScholarlyArticle|Article/i.test(text) && /doi|identifier|isPartOf|author/i.test(text);
  });
}

function hasScholarlyHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return SCHOLARLY_HOST_PATTERNS.some((pattern) => pattern.test(hostname)) || parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return /\.pdf(?:[?#]|$)/i.test(url);
  }
}

export function looksLikeScholarlyPage(url: string, doc: Document = document): boolean {
  const fromPage = parsePaperPage(url, doc);
  if (fromPage.type && fromPage.id) return true;

  if (matchesZoteroScholarlyTarget(url)) return true;
  if (hasScholarlyHost(url)) return true;
  if (SCHOLARLY_META_SELECTORS.some((selector) => doc.querySelector(selector))) return true;
  if (hasScholarlyJsonLd(doc)) return true;

  return false;
}

export function parsePaperPage(url: string, doc: Document = document): PaperIdentity {
  const fromUrl = parsePaperUrl(url);
  if (fromUrl.type && fromUrl.id) return fromUrl;

  for (const selector of DOI_META_SELECTORS) {
    const content = doc.querySelector<HTMLMetaElement>(selector)?.content;
    const doi = cleanDoi(content);
    if (doi) return { type: "doi", id: doi };
  }

  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  if (canonical) {
    const fromCanonical = parsePaperUrl(canonical);
    if (fromCanonical.type && fromCanonical.id) return fromCanonical;
  }

  return { type: null, id: null };
}
