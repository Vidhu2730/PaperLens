import { getSavedEmail } from './auth';

const API_BASE = "http://localhost:8000";

export interface ResolveResult {
  doi: string;
  sgrid: string | null;
  pii: string | null;
  scopus_url: string | null;
  sciencedirect_url: string | null;
  suggestions?: ArticleSuggestions | null;
  project_match?: ProjectMatchSummary | null;
}

export interface ProjectMatchSummary {
  project_id: string;
  project_name: string;
  rating_level: number;
  rating_label: string;
  score_percent: number;
}

export interface ArticlePromptSuggestion {
  label: string;
  prompt: string;
}

export interface ArticleSuggestions {
  questions: ArticlePromptSuggestion[];
  actions: ArticlePromptSuggestion[];
}

export interface Author {
  auid?: string | null;
  given?: string | null;
  family?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  initials?: string | null;
}

export interface ArticleDetails {
  sgrid: string | null;
  doi: string | null;
  pii: string | null;
  scopus_url?: string | null;
  sciencedirect_url?: string | null;
  suggestions?: ArticleSuggestions | null;
  title: string | null;
  abstract: string | null;
  authors: Author[] | null;
  citations: number | string[] | number[] | null;
  issueYear?: string | number | null;
  journalTitle?: string | null;
  keywords: string | string[] | null;
  publicationYear: number | string | null;
  sourceTitle: string | null;
}

export interface SearchResultItem {
  sgrid: string;
  doi: string;
  pii: string | null;
  title: string;
  abstract: string;
  authors: Author[];
  sourceTitle: string | null;
  keywords: string[];
  publicationYear: number | string | null;
  citations: string[];
  citationCount: number;
  relevance: string | null;
  scopus_link: string | null;
  sciencedirect_url: string | null;
}

export interface SearchResponse {
  query: string;
  count: number;
  results: SearchResultItem[];
}

export interface ProjectArticle {
  id: string;
  mapping_id: string;
  sgrid: string | null;
  doi: string | null;
  pii: string | null;
  title: string;
  abstract: string | null;
  sourceTitle: string | null;
  publicationYear: number | string | null;
  citations: string[];
  citationCount: number;
  authors: Author[];
  keywords: string[];
  scopus_url: string | null;
  sciencedirect_url: string | null;
  added_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  criteria: string[];
  article_count: number;
  articles: ProjectArticle[];
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurrentProjectResponse {
  project_id: string | null;
  project_name: string | null;
}

export interface ProjectArticlePayload {
  article?: ArticleDetails;
  sgrid?: string | null;
  doi?: string | null;
  pii?: string | null;
}

export interface ProjectEvaluationOverall {
  rating_level: number;
  rating_label: string;
  score_percent: number;
  reasoning_summary: string;
}

export interface ProjectEvaluationCriterion {
  criterion: string;
  rating_level: number;
  rating_label: string;
  score_percent: number;
  evidence: string;
}

export interface ProjectEvaluationResult {
  prompt_version: string;
  project_id: string;
  project_name: string;
  sgrid: string | null;
  article_title: string | null;
  llm_overall: ProjectEvaluationOverall;
  criteria: ProjectEvaluationCriterion[];
  criterion_average_score_percent: number | null;
  llm_overall_score_percent: number;
  computed_overall_score_percent: number;
  match_score: number;
}

async function jsonOrThrow<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const email = await getSavedEmail();
  if (email) headers.set('X-User-Email', email);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

export async function resolveArticleUrl(url: string, doi?: string | null): Promise<ResolveResult> {
  const params = new URLSearchParams({ url });
  if (doi) params.set('doi', doi);
  return jsonOrThrow(await apiFetch(`/resolve?${params}`));
}

export async function getArticle(sgrid: string): Promise<ArticleDetails> {
  const params = new URLSearchParams({ sgrid });
  return jsonOrThrow(await apiFetch(`/article?${params}`));
}

export async function searchArticles(q: string, size = 100): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, size: String(size) });
  return jsonOrThrow(await apiFetch(`/search?${params}`));
}

export async function getSimilarArticles(sgrid: string, size = 10): Promise<SearchResponse> {
  const params = new URLSearchParams({ size: String(size) });
  return jsonOrThrow(await apiFetch(`/article/${encodeURIComponent(sgrid)}/similar?${params}`));
}

export async function listProjects(): Promise<Project[]> {
  const resp = await apiFetch('/projects');
  const payload = await jsonOrThrow<{ projects: Project[] }>(resp);
  return payload.projects;
}

export async function createProject(
  name = 'Untitled project',
  options: { description?: string | null } = {},
): Promise<Project> {
  return jsonOrThrow(await apiFetch('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, ...options }),
  }));
}

export async function getProject(projectId: string): Promise<Project> {
  return jsonOrThrow(await apiFetch(`/projects/${encodeURIComponent(projectId)}`));
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  }));
}

export async function updateProjectDescription(projectId: string, description: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ description }),
  }));
}

export async function getCurrentProject(): Promise<CurrentProjectResponse> {
  return jsonOrThrow(await apiFetch('/projects/current'));
}

export async function setCurrentProject(projectId: string | null): Promise<void> {
  await jsonOrThrow(await apiFetch('/projects/current', {
    method: 'PUT',
    body: JSON.stringify({ project_id: projectId }),
  }));
}

export async function deleteProject(projectId: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  }));
}

export async function setProjectCriteria(projectId: string, criteria: string[]): Promise<void> {
  await jsonOrThrow(await apiFetch(`/projects/${encodeURIComponent(projectId)}/criteria`, {
    method: 'PUT',
    body: JSON.stringify({ criteria }),
  }));
}

export async function addProjectArticle(
  projectId: string,
  payload: ProjectArticlePayload,
): Promise<void> {
  await jsonOrThrow(await apiFetch(`/projects/${encodeURIComponent(projectId)}/articles`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

export async function removeProjectArticle(projectId: string, articleId: string): Promise<void> {
  await jsonOrThrow(await apiFetch(
    `/projects/${encodeURIComponent(projectId)}/articles/${encodeURIComponent(articleId)}`,
    { method: 'DELETE' },
  ));
}

export async function evaluateArticleForProject(
  projectId: string,
  sgrid: string,
): Promise<ProjectEvaluationResult> {
  return jsonOrThrow(await apiFetch(
    `/projects/${encodeURIComponent(projectId)}/articles/${encodeURIComponent(sgrid)}/evaluation`,
    { method: 'POST' },
  ));
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChat(
  args: { sgrid?: string | null; doi?: string | null; messages: ChatMessage[] },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await apiFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({
      sgrid: args.sgrid ?? null,
      doi: args.doi ?? null,
      messages: args.messages,
    }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        let parsed: { delta?: string; done?: boolean; error?: string };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.delta) onDelta(parsed.delta);
        if (parsed.done) return;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
