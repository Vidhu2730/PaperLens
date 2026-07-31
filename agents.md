# PaperLens - Agents Architecture

## Overview

PaperLens is a browser extension built with WXT. The backend is a FastAPI service that resolves scientific article pages, retrieves Scopus article records from Elasticsearch/MOS, supports project criteria plus saved article references, evaluates articles against project criteria, and provides article-grounded chat.

Article records are not stored in Postgres. When the UI needs article details, the backend reads them from Elasticsearch and benefits from the Redis article cache in `services.es_client`.

Projects stay lightweight. Postgres stores users, project names/descriptions, ordered criteria, current-project selection, and saved article identifiers only.

---

## System Architecture

```
Browser (WXT Extension)
        |
        | HTTP (DOI / URL / page metadata / search query / project actions / chat)
        v
FastAPI Backend
        |
        |-- ArticleResolverAgent
        |       |
        |       v
        |   Scopus article lookup (Elasticsearch + Redis cache)
        |
        |-- Search API (MOS vector search)
        |
        |-- Project API (Postgres project criteria + saved article identifiers)
        |
        |-- Project Evaluation API (article context from Elasticsearch + LLM + Redis cache)
        |
        `-- Chat API (article context loaded from Elasticsearch / ScienceDirect full text)
```

---

## WXT UI Architecture

PaperLens has two user-facing extension surfaces:

1. **Floating widget on scholarly pages**
   - Injected by the content script when a page is likely to be a research article.
   - Resolves the current page through `/resolve`.
   - Shows article actions directly on the publisher page.

2. **Full-page PaperLens workspace**
   - Opened from the extension action, context menu, floating widget, or saved articles.
   - Uses a persistent sidebar with `Discover` and `Projects`.
   - Uses `/article` as the article workspace route, with query state for `tab`, `sgrid`, and search query.

---

## Agents and Services

### 1. ArticleResolverAgent

**Responsibility:** Detects and resolves paper identity from the page the researcher is currently on.

**Input:**
- Current page URL
- Page `<meta>` tags
- Page title fallback
- Optional DOI extracted by the extension
- Current user email from `X-User-Email` when available

**Output:**
- Resolved DOI where available
- SGRID/PII when resolvable through Elasticsearch
- Scopus and ScienceDirect links when identifiers are available
- Article suggestions generated from the resolved Scopus record
- Optional current-project match summary when a current project exists

**Logic:**
- The extension detects scholarly pages from DOI patterns, DOI metadata, canonical links, scholarly metadata, JSON-LD, PDF URLs, legacy PaperLens hosts, and the Zotero-derived scholarly translator target list below.
- Resolve a DOI query parameter or page metadata DOI through Elasticsearch before calling Zotero.
- The backend sends the URL to Zotero Translation Server for article metadata.
- Resolve DOI to Scopus identifiers through Elasticsearch when Zotero returns a DOI.
- Fall back to MOS lexical title search when Zotero returns useful title metadata but DOI resolution is unavailable.
- When a resolved article has an SGRID and the user has a current project, evaluate the article against that project and return a compact `project_match` summary.
- Do not store user-specific `project_match` data in the URL resolve cache.
- Return graceful fallback if the page cannot be resolved.

**Stack:** Python, WXT page detection, Zotero Translation Server, Elasticsearch lookup, MOS lexical search, Redis cache.

---

## Supported Research Article Websites

PaperLens recognizes scholarly article pages through both page metadata and a Zotero-derived translator target list.

The browser extension checks in this order:
- DOI/PMID/PMC patterns in the URL, DOI query parameters, DOI metadata, and canonical DOI links.
- Zotero scholarly web translator targets generated from `zotero/translators` commit `0c78a24a68896245248a68e4e5b9627b6f2d77fe`.
- Legacy PaperLens host patterns and direct PDF URLs.
- Scholarly metadata, JSON-LD article metadata, and COinS-style page metadata.

The generated Zotero target list includes **263 article-like web translators** whose Zotero test cases include at least one of `journalArticle`, `conferencePaper`, `preprint`, `report`, `thesis`, or `dataset`. It intentionally excludes broad non-research Zotero translators such as news sites, bookstores, and general archives, plus Zotero generic empty-target translators (`COinS`, `DOI`, `Embedded Metadata`, `unAPI`) that are already covered by metadata heuristics.

Examples of covered Zotero scholarly platforms include ACL Anthology, ACM Digital Library, ACS Publications, AIP Scitation, AMS MathSciNet, APA PsycNet, APS Journals, ASCE Library, BioMed Central, Cambridge Core, Cell Press, IEEE Xplore, JSTOR, Nature, PubMed, ScienceDirect, SpringerLink, Taylor & Francis, Wiley Online Library, arXiv, bioRxiv, and medRxiv.

Final article details still depend on the article being resolvable to a Scopus record in Elasticsearch.

---

### 2. Scopus Article Lookup

**Responsibility:** Fetches article metadata from the Scopus Elasticsearch index.

**Input:**
- SGRID or DOI

**Output:**
```json
{
  "sgrid": "...",
  "doi": "...",
  "pii": "...",
  "title": "...",
  "abstract": "...",
  "authors": ["..."],
  "publicationYear": 2023,
  "sourceTitle": "...",
  "keywords": ["..."],
  "citations": ["..."]
}
```

**Logic:**
- Query `mos-scopus-vector` by SGRID or DOI.
- Cache hits and misses in Redis.
- Return article details directly to the extension.

**Stack:** Elasticsearch, Redis cache.

---

### 3. SDFullText Lookup

**Responsibility:** Retrieves ScienceDirect full text when available for chat context.

**Input:**
- PII

**Output:**
```json
{
  "full_text": "..."
}
```

**Logic:**
- Query `mos-sd-fulltext` by PII.
- Cache hits and misses in Redis.
- Fall back to Scopus abstract when full text is unavailable.

**Stack:** Elasticsearch, Redis cache.

---

### 4. Project Store

**Responsibility:** Stores user projects, current project selection, criteria, and saved article identifiers.

**Input:**
- Project name and description
- Ordered criteria list
- Saved article identifiers (`sgrid`, `doi`, `pii`)
- Current project selection

**Output:**
```json
{
  "id": "...",
  "name": "...",
  "description": "...",
  "criteria": ["..."],
  "is_current": true,
  "articles": [
    {
      "id": "...",
      "sgrid": "...",
      "doi": "...",
      "pii": "...",
      "title": "Loaded from Elasticsearch"
    }
  ]
}
```

**Logic:**
- Store only project data and article identifiers in Postgres.
- Hydrate saved article details from Elasticsearch when a project is loaded.
- Do not persist full article metadata in Postgres.
- Current project is stored on the user and is used by `/resolve` for floating-widget project match.

**Stack:** PostgreSQL, Elasticsearch, Redis cache.

---

### 5. Project Evaluation

**Responsibility:** Evaluates one Scopus article against one project and returns overall and criterion-level match results.

**Input:**
- Project ID
- Article SGRID
- Project criteria from Postgres
- Article metadata/full context from Elasticsearch-backed services

**Output:**
```json
{
  "project_id": "...",
  "project_name": "...",
  "sgrid": "...",
  "article_title": "...",
  "llm_overall": {
    "rating_level": 4,
    "rating_label": "Strong match",
    "score_percent": 75,
    "reasoning_summary": "..."
  },
  "criteria": [
    {
      "criterion": "...",
      "rating_level": 5,
      "rating_label": "Excellent match",
      "score_percent": 100,
      "evidence": "..."
    }
  ],
  "criterion_average_score_percent": 80,
  "computed_overall_score_percent": 79,
  "match_score": 79
}
```

**Logic:**
- Fetch the article by SGRID from Elasticsearch.
- Evaluate article evidence against each project criterion with the LLM.
- Normalize ratings to a 1-5 scale.
- Cache evaluation results in Redis.
- Do not persist evaluation results in Postgres.

**Stack:** Elasticsearch, LLM client, Redis cache.

---

## Floating Extension Behavior

The floating widget is the lightweight on-page PaperLens surface.

**Resolve and article actions:**
- The widget sends page URL/metadata to `/resolve`.
- When resolution succeeds, it can show Scopus and ScienceDirect links.
- `View in Lens` opens the full-page article workspace on Overview.
- `Ask AI` opens a floating chat panel for the resolved article.

**Project match:**
- If `/resolve` returns `project_match`, the widget shows a `Project match` card using the same 1-5 visual rating system used in the full-page workspace.
- The card reflects the user's current project only.
- Clicking the project match card opens the full-page article workspace directly on the Evaluate tab.
- The project-match card includes an add/remove action for the current project when article identifiers are available.
- If no current project exists, no project-match placeholder is shown.

**Saved article behavior:**
- Saving from the floating widget stores only identifiers (`sgrid`, `doi`, `pii`) in the selected/current project.
- Saved article details are later hydrated from Elasticsearch.

---

## Full-Page Sidebar

The full-page workspace has a persistent left sidebar.

**Top-level navigation:**
- `Discover` opens Scopus search at `/article?tab=discover`.
- `Projects` opens the project workspace.

**Projects sidebar expansion:**
- When the current route is under `/projects`, the sidebar expands.
- The expanded project panel lists all projects with criteria count and saved article count.
- The current project displays a `Current` badge.
- A plus button creates a new `Untitled project` and navigates to it.

**Account controls:**
- The signed-in email is shown at the bottom of the sidebar.
- Logout clears the saved email and returns to sign-in.

---

## Discover Page

Discover is the search/home surface for the full-page workspace.

**Behavior:**
- Users search Scopus records through `/search`.
- Results show article title, source, year, authors, abstract preview, citations, keywords, and a View action.
- Clicking a result opens `/article?sgrid=...&tab=overview`.
- The search query is preserved so the article toolbar can return to Discover with the previous query.

---

## Article Workspace

The article workspace is opened from Discover, saved articles, the floating widget, or browser extension actions.

**Route behavior:**
- `/article?tab=discover` shows Discover.
- `/article?sgrid=...` defaults to Overview.
- `/article?sgrid=...&tab=overview` shows Overview.
- `/article?sgrid=...&tab=evaluate` shows Evaluate.

**Toolbar:**
- Left side has a back button to Discover.
- Right side has `Add to project`.
- `Add to project` is a dropdown that can save/remove the article across projects.

**Overview tab:**
- Shows article title, year, source, authors, Scopus/ScienceDirect links, DOI copy, publication stats, abstract, keywords, and record links.
- Shows Ask AI chat side-by-side with article details on desktop.
- Does not show evaluation/project-match cards.

**Ask AI chat:**
- Chat uses article context from SGRID/DOI.
- It streams responses from `/chat`.
- It shows suggested questions and quick actions derived from article suggestions when available.
- It can fall back to default prompts.
- Chat context uses ScienceDirect full text when available and falls back to Scopus abstract.

---

## Evaluate Page

Evaluate is a full article tab for project matching.

**Project selection:**
- Defaults to the current project.
- If no current project exists, falls back to the first available project.
- Users can switch projects in a dropdown.

**Run behavior:**
- When a user opens the Evaluate tab for an article, PaperLens runs evaluation once for the selected default/current project if no in-memory result exists.
- Changing the project dropdown does not auto-run evaluation.
- The user clicks `Evaluate` to evaluate the newly selected project.
- Existing in-memory results are shown immediately when switching back to a project already evaluated in the current page session.

**Result UI:**
- Shows the overall match card on a 1-5 rating scale.
- Shows `Final score` and `Criteria average`.
- Shows overall reasoning.
- Shows each criterion as a card with a colored 1-5 rating pill and evidence.
- Does not show the LLM-overall percentage metric.

**Persistence:**
- Evaluation results are not persisted in Postgres.
- Redis may cache generated evaluation results.

---

## Project Workspace

Projects are research spaces that define inclusion criteria and saved article references.

**Creating projects:**
- From an empty projects page, users click `Create project`.
- From the expanded Projects sidebar, users click the plus button.
- New projects are named `Untitled project` by default.

**Editing projects:**
- Users can rename a project.
- Users can edit the project description.
- Users can set a project as current.
- Users can delete a project after confirmation.

**Criteria:**
- Criteria are long-form text blocks.
- Users can add, edit, and delete criteria.
- Empty criteria are ignored.
- Duplicate criteria are prevented after trimming and whitespace normalization.
- Criteria order is preserved.

**Saved articles:**
- Saved article references store only identifiers.
- The saved articles list hydrates article title, abstract, source, year, citations, authors, keywords, and links from Elasticsearch.
- Users can open a saved article in the article workspace.
- Users can remove a saved article reference from a project.

---

## Data Store

| Entity | Storage | Notes |
|---|---|---|
| Users | PostgreSQL | `id`, `email`, `current_project_id` |
| Research Projects | PostgreSQL | `id`, `name`, `description`, `criteria[]`, `user_id` |
| Project Article References | PostgreSQL | `project_id`, `sgrid`, `doi`, `pii`, `added_at` |
| Article Cache | Redis | SGRID/DOI -> Scopus metadata, TTL 30 days |
| Full Text Cache | Redis | PII -> ScienceDirect full text, TTL 30 days |
| Evaluation Cache | Redis | Article/project evaluation payloads, TTL 30 days |

---

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/resolve` | Resolve URL/DOI to Scopus identifiers and optional current-project match |
| `GET` | `/article` | Load one Scopus article by SGRID |
| `GET` | `/search` | Search Scopus records |
| `POST` | `/chat` | Chat with article context |
| `POST` | `/projects` | Create project |
| `GET` | `/projects` | List projects |
| `GET` | `/projects/current` | Get current project selection |
| `PUT` | `/projects/current` | Set or clear current project |
| `GET` | `/projects/{project_id}` | Get project criteria and hydrated saved article references |
| `PATCH` | `/projects/{project_id}` | Update project name/description |
| `DELETE` | `/projects/{project_id}` | Delete project |
| `PUT` | `/projects/{project_id}/criteria` | Replace project criteria |
| `POST` | `/projects/{project_id}/articles` | Save article identifiers to a project |
| `POST` | `/projects/{project_id}/articles/{sgrid}/evaluation` | Evaluate one article against one project |
| `DELETE` | `/projects/{project_id}/articles/{saved_article_id}` | Remove saved article reference |

---

## WXT Extension to Backend Flow

```
1. User opens a scholarly page
2. Content script detects article-like page metadata
3. Floating widget calls GET /resolve
4. Backend resolves DOI/SGRID/PII and may compute current-project match
5. Widget shows Ask AI, links, View in Lens, and optional Project match
6. User can chat in-page, save/remove from current project, or open full workspace
```

```
1. User opens full-page PaperLens
2. Discover searches Scopus through GET /search
3. User opens an article by SGRID
4. GET /article loads metadata from Elasticsearch
5. Overview renders article details and Ask AI chat
6. Add to project saves identifiers through POST /projects/{project_id}/articles
7. Evaluate calls POST /projects/{project_id}/articles/{sgrid}/evaluation
8. Project pages hydrate saved article details from Elasticsearch
```

---

## Design Principles

- **No article metadata in Postgres** - article data comes from Elasticsearch and Redis cache.
- **Projects remain lightweight** - criteria and saved article identifiers are the only project-specific data.
- **Current project drives fast matching** - the floating widget only shows project match for the user's current project.
- **Evaluation is contextual, not persisted** - generated evaluation payloads can be cached, but Postgres does not store evaluation results.
- **Graceful degradation** - unresolved pages show a fallback; missing full text falls back to abstract; missing current project hides project match.
- **Stateless service calls** - request payloads and persistent stores define all durable context.
