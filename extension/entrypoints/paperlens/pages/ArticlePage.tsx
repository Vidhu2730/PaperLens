import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileSearch,
  FileText,
  Link2,
  Play,
  Quote,
  Search,
  Tag,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArticleDetails,
  ArticleSuggestions,
  Project,
  ProjectEvaluationCriterion,
  ProjectEvaluationResult,
  SearchResultItem,
  evaluateArticleForProject,
  getArticle,
  getSimilarArticles,
} from '../../../src/api';
import AddToProjectButton from '../../../src/components/AddToProjectButton';
import ArticleDiscoverPanel from '../../../src/components/ArticleDiscoverPanel';
import ArticleResultList from '../../../src/components/ArticleResultList';
import ChatPanel from '../../../src/components/ChatPanel';
import EvaluationProgressCard from '../../../src/components/EvaluationProgressCard';
import { useProjectsContext } from '../../../src/contexts/ProjectsContext';

type ArticleTab = 'overview' | 'evaluate' | 'related';

const ARTICLE_TABS: ArticleTab[] = ['overview', 'evaluate', 'related'];
const SIMILAR_ARTICLES_LIMIT = 10;
const ARTICLE_TAB_LABELS: Record<ArticleTab, string> = {
  overview: 'Overview',
  evaluate: 'Evaluate',
  related: 'Related',
};

function authorsLabel(authors: ArticleDetails['authors']): string {
  if (!authors?.length) return '';
  const names = authors
    .slice(0, 5)
    .map((author) => `${author.givenName || author.given || author.initials || ''} ${author.familyName || author.family || ''}`.trim())
    .filter(Boolean);
  const rest = authors.length - names.length;
  return rest > 0 ? `${names.join(', ')} +${rest} more` : names.join(', ');
}

function resolveArticleTab(rawTab: string | null): ArticleTab {
  if (rawTab && ARTICLE_TABS.includes(rawTab as ArticleTab)) return rawTab as ArticleTab;
  return 'overview';
}

function sourceUrlLabel(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function sourceTitle(article: ArticleDetails): string | null {
  return article.sourceTitle ?? article.journalTitle ?? null;
}

function keywordList(keywords: ArticleDetails['keywords']): string[] {
  if (Array.isArray(keywords)) return keywords.filter(Boolean);
  if (typeof keywords === 'string' && keywords.trim()) return [keywords.trim()];
  return [];
}

function citationCount(citations: ArticleDetails['citations']): number | null {
  if (Array.isArray(citations)) return citations.length;
  if (typeof citations === 'number') return citations;
  return null;
}

function publicationYear(article: ArticleDetails): number | string | null {
  return article.publicationYear ?? article.issueYear ?? null;
}

function percentLabel(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '-';
}

function projectName(project: Project | null | undefined): string {
  return project?.name?.trim() || 'Untitled project';
}

function evaluationKey(projectId: string | null | undefined, sgrid: string | null | undefined): string | null {
  if (!projectId || !sgrid) return null;
  return `${projectId}:${sgrid}`;
}

function ArticleEmptyState({ onDiscover }: { onDiscover: () => void }) {
  return (
    <Box p="xl" maw={720} mx="auto" mt={48} style={{ textAlign: 'center' }}>
      <Box
        style={{
          width: 64,
          height: 64,
          margin: '0 auto 16px',
          borderRadius: 16,
          background: 'rgba(232, 119, 34, 0.1)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <FileSearch size={28} color="#E87722" />
      </Box>
      <Text fz="xl" fw={700} mb={6}>
        No article selected
      </Text>
      <Text c="dimmed" mb="lg">
        Search Scopus or open PaperLens from a publication page.
      </Text>
      <Button color="elsevierOrange" radius="md" leftSection={<Search size={16} />} onClick={onDiscover}>
        Discover articles
      </Button>
    </Box>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <Box
      style={{
        minWidth: 0,
        padding: '14px 16px',
        background: '#FAFAF7',
        border: '1px solid #E5E5E2',
        borderRadius: 10,
      }}
    >
      <Group gap={8} mb={6} c="dimmed" wrap="nowrap">
        {icon}
        <Text fz={11} tt="uppercase" fw={700} style={{ letterSpacing: 1 }}>
          {label}
        </Text>
      </Group>
      <Text fz={22} fw={750} lh={1.1}>
        {value}
      </Text>
    </Box>
  );
}

function ArticleOverviewCard({
  article,
  abstractOpen,
  onToggleAbstract,
  onKeyword,
}: {
  article: ArticleDetails;
  abstractOpen: boolean;
  onToggleAbstract: () => void;
  onKeyword: (keyword: string) => void;
}) {
  const abstract = article.abstract || '';
  const isLong = abstract.length > 620;
  const visibleAbstract = abstractOpen || !isLong ? abstract : `${abstract.slice(0, 620)}...`;
  const authors = authorsLabel(article.authors);
  const source = sourceTitle(article);
  const keywords = keywordList(article.keywords);
  const citations = citationCount(article.citations);
  const year = publicationYear(article);
  const scopus = article.scopus_url ?? null;
  const scienceDirect = article.sciencedirect_url ?? null;

  const copyDoi = () => {
    if (article.doi) void navigator.clipboard.writeText(article.doi);
  };

  return (
    <Box
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E2',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(20, 20, 18, 0.04), 0 8px 24px rgba(20, 20, 18, 0.04)',
      }}
    >
      <Box
        style={{
          height: 4,
          background: 'linear-gradient(90deg, #F59848 0%, #E87722 100%)',
        }}
      />

      <Stack gap="lg" p={24}>
        <Stack gap="sm">
          <Group gap={8}>
            {year && (
              <Badge variant="light" color="elsevierOrange" size="md" radius="sm">
                {year}
              </Badge>
            )}
            {source && (
              <Badge variant="default" size="md" radius="sm" style={{ fontWeight: 500 }}>
                {source}
              </Badge>
            )}
          </Group>

          <Title order={1} fz={30} lh={1.18} style={{ letterSpacing: 0 }}>
            {article.title || 'Untitled article'}
          </Title>

          {authors && (
            <Text fz="sm" c="dimmed" lh={1.5}>
              {authors}
            </Text>
          )}

          <Group gap="xs">
            {scopus && (
              <Button
                component="a"
                href={scopus}
                target="_blank"
                rel="noreferrer"
                variant="default"
                color="elsevierOrange"
                radius="md"
                leftSection={<FileSearch size={16} />}
                rightSection={<ExternalLink size={14} />}
              >
                Scopus
              </Button>
            )}
            {scienceDirect && (
              <Button
                component="a"
                href={scienceDirect}
                target="_blank"
                rel="noreferrer"
                variant="default"
                color="elsevierOrange"
                radius="md"
                leftSection={<ExternalLink size={16} />}
              >
                ScienceDirect
              </Button>
            )}
            {article.doi && (
              <Button variant="default" color="elsevierOrange" radius="md" leftSection={<Copy size={15} />} onClick={copyDoi}>
                Copy DOI
              </Button>
            )}
          </Group>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <StatCard icon={<Calendar size={14} />} label="Published" value={year ?? '-'} />
          <StatCard icon={<Quote size={14} />} label="Citations" value={citations ?? '-'} />
          <StatCard icon={<Tag size={14} />} label="Keywords" value={keywords.length} />
        </SimpleGrid>

        <Divider />

        <Stack gap={10}>
          <Text fz={11} tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: 1.2 }}>
            Abstract
          </Text>
          {abstract ? (
            <>
              <Text fz="sm" lh={1.68} c="dark.7">
                {visibleAbstract}
              </Text>
              {isLong && (
                <Button
                  variant="subtle"
                  color="elsevierOrange"
                  size="compact-sm"
                  onClick={onToggleAbstract}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {abstractOpen ? 'Show less' : 'Show more'}
                </Button>
              )}
            </>
          ) : (
            <Text fz="sm" c="dimmed">
              Abstract is not available for this record.
            </Text>
          )}
        </Stack>

        {keywords.length > 0 && (
          <>
            <Divider />
            <Stack gap={10}>
              <Text fz={11} tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: 1.2 }}>
                Keywords
              </Text>
              <Group gap={6}>
                {keywords.map((keyword) => (
                  <Badge
                    key={keyword}
                    variant="light"
                    color="gray"
                    radius="sm"
                    size="md"
                    style={{ textTransform: 'none', fontWeight: 500, cursor: 'pointer' }}
                    onClick={() => onKeyword(keyword)}
                  >
                    {keyword}
                  </Badge>
                ))}
              </Group>
            </Stack>
          </>
        )}

        {(article.doi || scopus || scienceDirect) && (
          <>
            <Divider />
            <Stack gap={8}>
              <Text fz={11} tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: 1.2 }}>
                Record links
              </Text>
              {article.doi && (
                <Text fz="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
                  DOI: {article.doi}
                </Text>
              )}
              {scopus && (
                <Text fz="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
                  Scopus: {sourceUrlLabel(scopus)}
                </Text>
              )}
              {scienceDirect && (
                <Text fz="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
                  ScienceDirect: {sourceUrlLabel(scienceDirect)}
                </Text>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Box>
  );
}

function RelatedArticlesPanel({
  article,
  onOpenArticle,
}: {
  article: ArticleDetails;
  onOpenArticle: (target: string) => void;
}) {
  const title = article.title?.trim() ?? '';
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string | null>(title || null);

  useEffect(() => {
    if (!article.sgrid) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setResults(null);

    getSimilarArticles(article.sgrid, SIMILAR_ARTICLES_LIMIT)
      .then((resp) => {
        if (cancelled) return;
        setQuery(resp.query || title || null);
        setResults(resp.results);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Similar article search failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [article.sgrid, title]);

  return (
    <Stack gap="md">
      {loading && (
        <Paper withBorder radius="lg" p="xl" style={{ borderColor: '#E5E5E2', background: '#FFFFFF' }}>
          <Group gap="sm" justify="center">
            <Loader color="elsevierOrange" size="sm" />
            <Text fz="sm" c="dimmed">
              Finding related articles
            </Text>
          </Group>
        </Paper>
      )}

      {!loading && !article.sgrid && (
        <Paper withBorder radius="lg" p="xl" style={{ borderColor: '#E5E5E2', background: '#FFFFFF', textAlign: 'center' }}>
          <Text fz="sm" c="dimmed">
            Related articles need a Scopus identifier for this record.
          </Text>
        </Paper>
      )}

      {!loading && error && (
        <Alert color="red" variant="light" radius="md" icon={<AlertCircle size={18} />} title="Related article search failed">
          {error}
        </Alert>
      )}

      {!loading && !error && article.sgrid && results && results.length === 0 && (
        <Paper withBorder radius="lg" p="xl" style={{ borderColor: '#E5E5E2', background: '#FFFFFF', textAlign: 'center' }}>
          <Text fz="sm" c="dimmed">
            No related articles found for this title.
          </Text>
        </Paper>
      )}

      {!loading && !error && results && results.length > 0 && (
        <ArticleResultList results={results} query={query} onOpen={onOpenArticle} />
      )}
    </Stack>
  );
}

function LoadingArticle() {
  return (
    <Box p="xl" style={{ display: 'grid', placeItems: 'center', minHeight: '58vh' }}>
      <Stack align="center" gap="sm">
        <Loader color="elsevierOrange" size="md" />
        <Text fz="sm" c="dimmed">
          Loading article from Scopus
        </Text>
      </Stack>
    </Box>
  );
}

function ArticleError({ error, onDiscover }: { error: string; onDiscover: () => void }) {
  return (
    <Box maw={760} mx="auto" mt="xl">
      <Alert
        color="red"
        variant="light"
        radius="md"
        icon={<AlertCircle size={18} />}
        title="Couldn't load article"
      >
        {error}
      </Alert>
      <Button mt="md" leftSection={<Search size={16} />} variant="default" radius="md" onClick={onDiscover}>
        Try searching instead
      </Button>
    </Box>
  );
}

function MetricCard({ label, value }: { label: string; value: number | null | undefined }) {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <Paper withBorder radius="md" p="md" style={{ borderColor: '#E5E5E2', background: '#FFFFFF' }}>
      <Text fz={11} fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
        {label}
      </Text>
      <Text fz={24} fw={800} mt={4}>
        {percentLabel(value)}
      </Text>
      <Progress mt="sm" value={normalized} color="elsevierOrange" radius="xl" />
    </Paper>
  );
}

function CriteriaResultCard({ item }: { item: ProjectEvaluationCriterion }) {
  return (
    <EvaluationProgressCard
      level={item.rating_level}
      heading={item.criterion}
      description={item.evidence}
      multiline
      ariaLabel={`${item.criterion}: ${item.rating_label}, ${item.rating_level} of 5`}
    />
  );
}

function EvaluationTabPanel({
  projects,
  selectedProjectId,
  onProjectChange,
  selectedProject,
  article,
  evaluation,
  loading,
  error,
  canEvaluate,
  onEvaluate,
}: {
  projects: Project[];
  selectedProjectId: string | null;
  onProjectChange: (projectId: string | null) => void;
  selectedProject: Project | null;
  article: ArticleDetails;
  evaluation: ProjectEvaluationResult | null;
  loading: boolean;
  error: string | null;
  canEvaluate: boolean;
  onEvaluate: () => void;
}) {
  return (
    <Stack gap="lg">
      <Paper withBorder radius="lg" p="lg" style={{ borderColor: '#E5E5E2', background: '#FFFFFF' }}>
        <Group justify="space-between" align="flex-end" gap="md">
          <Stack gap={6} style={{ flex: 1, minWidth: 260 }}>
            <Text fz={11} fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1.2 }}>
              Evaluate article
            </Text>
            <Title order={2} fz={24} lh={1.2} style={{ letterSpacing: 0 }}>
              Match this article against project criteria
            </Title>
            <Text fz="sm" c="dimmed" lineClamp={2}>
              {article.title || 'Untitled article'}
            </Text>
          </Stack>
          <Group gap="sm" align="flex-end">
            <Select
              label="Project"
              value={selectedProjectId}
              onChange={onProjectChange}
              data={projects.map((project) => ({
                value: project.id,
                label: `${projectName(project)}${project.is_current ? ' (current)' : ''}`,
              }))}
              placeholder="Choose a project"
              allowDeselect={false}
              withCheckIcon={false}
              renderOption={({ option, checked }) => (
                <Text fz="sm" fw={checked ? 750 : 500} c={checked ? '#C96015' : undefined}>
                  {option.label}
                </Text>
              )}
              disabled={projects.length === 0 || loading}
              w={280}
            />
            <Button
              color="elsevierOrange"
              leftSection={loading ? <Loader size={16} color="white" /> : <Play size={16} />}
              onClick={onEvaluate}
              disabled={!canEvaluate || loading}
            >
              Evaluate
            </Button>
          </Group>
        </Group>
      </Paper>

      {projects.length === 0 && (
        <Alert color="orange" variant="light" radius="md" title="No projects available">
          Create a project and add criteria before evaluating articles.
        </Alert>
      )}

      {selectedProject && selectedProject.criteria.length === 0 && (
        <Alert color="orange" variant="light" radius="md" title="No criteria in this project">
          Add criteria to {projectName(selectedProject)} before running evaluation.
        </Alert>
      )}

      {error && (
        <Alert color="red" variant="light" radius="md" icon={<AlertCircle size={18} />} title="Evaluation failed">
          {error}
        </Alert>
      )}

      {selectedProject && selectedProject.criteria.length > 0 && !evaluation && !loading && !error && (
        <Paper withBorder radius="lg" p="xl" style={{ borderColor: '#E5E5E2', background: '#FFFFFF', textAlign: 'center' }}>
          <ClipboardCheck size={34} color="#E87722" />
          <Text fw={700} fz="lg" mt="sm">
            Ready to evaluate
          </Text>
          <Text c="dimmed" fz="sm" mt={4}>
            PaperLens will compare the article against {selectedProject.criteria.length} project criteria.
          </Text>
        </Paper>
      )}

      {loading && !evaluation && (
        <Paper withBorder radius="lg" p="xl" style={{ borderColor: '#E5E5E2', background: '#FFFFFF' }}>
          <Group gap="sm" justify="center">
            <Loader color="elsevierOrange" size="sm" />
            <Text fz="sm" c="dimmed">
              Evaluating article against project criteria
            </Text>
          </Group>
        </Paper>
      )}

      {evaluation && (
        <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg" style={{ alignItems: 'start' }}>
          <Stack gap="lg">
            <EvaluationProgressCard level={evaluation.llm_overall.rating_level} title={evaluation.project_name} />
            <MetricCard label="Final score" value={evaluation.computed_overall_score_percent} />
            <MetricCard label="Criteria average" value={evaluation.criterion_average_score_percent} />
          </Stack>

          <Stack gap="lg" style={{ gridColumn: 'span 2' }}>
            <Paper withBorder radius="lg" p="lg" style={{ borderColor: '#E5E5E2', background: '#FFFFFF' }}>
              <Text fz={11} fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1.2 }}>
                Overall reasoning
              </Text>
              <Text fz="sm" lh={1.65} mt="sm" c="dark.7">
                {evaluation.llm_overall.reasoning_summary}
              </Text>
            </Paper>

            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={700}>Criteria results</Text>
                <Badge variant="light" color="elsevierOrange">
                  {evaluation.criteria.length} criteria
                </Badge>
              </Group>
              {evaluation.criteria.map((item) => (
                <CriteriaResultCard key={item.criterion} item={item} />
              ))}
            </Stack>
          </Stack>
        </SimpleGrid>
      )}
    </Stack>
  );
}

export default function ArticlePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { ready: projectsReady, projects } = useProjectsContext();
  const [article, setArticle] = useState<ArticleDetails | null>(null);
  const [suggestions, setSuggestions] = useState<ArticleSuggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abstractOpen, setAbstractOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, ProjectEvaluationResult>>({});
  const [evaluationErrors, setEvaluationErrors] = useState<Record<string, string | null>>({});
  const [evaluationLoadingKey, setEvaluationLoadingKey] = useState<string | null>(null);
  const [evaluateEntry, setEvaluateEntry] = useState<{ sgrid: string; projectId: string } | null>(null);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0, ready: false });
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<ArticleTab, HTMLButtonElement | null>>({
    overview: null,
    evaluate: null,
    related: null,
  });
  const autoRunEvaluationKeys = useRef<Set<string>>(new Set());

  const queryKey = useMemo(() => {
    return params.get('sgrid') ?? '';
  }, [params]);
  const hasArticleParam = Boolean(params.get('sgrid'));
  const showDiscoverSurface = !hasArticleParam || params.get('tab') === 'discover';
  const activeArticleTab = resolveArticleTab(params.get('tab'));
  const preferredProject = useMemo(() => projects.find((project) => project.is_current) ?? projects[0] ?? null, [projects]);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const currentEvaluationKey = evaluationKey(selectedProjectId, article?.sgrid ?? null);
  const currentEvaluation = currentEvaluationKey ? evaluations[currentEvaluationKey] ?? null : null;
  const currentEvaluationError = currentEvaluationKey ? evaluationErrors[currentEvaluationKey] ?? null : null;
  const evaluationLoading = Boolean(currentEvaluationKey && evaluationLoadingKey === currentEvaluationKey);
  const canEvaluate = Boolean(
    article?.sgrid &&
      selectedProject &&
      selectedProject.criteria.length > 0 &&
      currentEvaluationKey,
  );

  useEffect(() => {
    const sgrid = queryKey;

    setAbstractOpen(false);

    if (!sgrid) {
      setArticle(null);
      setSuggestions(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setArticle(null);
    setSuggestions(null);

    const load = async () => {
      try {
        const data = await getArticle(sgrid);
        if (!cancelled) {
          setSuggestions(data.suggestions ?? null);
          setArticle(data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load article');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  useEffect(() => {
    if (!projectsReady) return;
    setSelectedProjectId((current) => {
      if (current && projects.some((project) => project.id === current)) return current;
      return preferredProject?.id ?? null;
    });
  }, [preferredProject?.id, projects, projectsReady]);

  useEffect(() => {
    if (activeArticleTab !== 'evaluate') {
      if (evaluateEntry) setEvaluateEntry(null);
      return;
    }

    if (!article?.sgrid || !selectedProjectId) return;

    setEvaluateEntry((current) => {
      if (current?.sgrid === article.sgrid && current.projectId === selectedProjectId) return current;
      if (current?.sgrid === article.sgrid) return current;
      return { sgrid: article.sgrid, projectId: selectedProjectId };
    });
  }, [activeArticleTab, article?.sgrid, evaluateEntry, selectedProjectId]);

  const setArticleTab = (tab: ArticleTab) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', tab);
      return next;
    });
  };

  const showDiscover = () => {
    const next = new URLSearchParams({ tab: 'discover' });
    const query = params.get('q');
    if (query) next.set('q', query);
    navigate(`/article?${next.toString()}`);
  };

  const discoverKeyword = (keyword: string) => {
    const next = new URLSearchParams({ tab: 'discover', q: keyword });
    navigate(`/article?${next.toString()}`);
  };

  const updateTabIndicator = useCallback(() => {
    const list = tabListRef.current;
    const tab = tabRefs.current[activeArticleTab];
    if (!list || !tab) return;

    const listRect = list.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const next = {
      left: tabRect.left - listRect.left,
      width: tabRect.width,
      ready: true,
    };

    setTabIndicator((current) => {
      if (current.ready === next.ready && current.left === next.left && current.width === next.width) return current;
      return next;
    });
  }, [activeArticleTab]);

  const runEvaluation = useCallback(async () => {
    const key = currentEvaluationKey;
    const sgrid = article?.sgrid;
    if (!key || !selectedProject || !sgrid || selectedProject.criteria.length === 0) return;

    setEvaluationLoadingKey(key);
    setEvaluationErrors((current) => ({ ...current, [key]: null }));
    try {
      const result = await evaluateArticleForProject(selectedProject.id, sgrid);
      setEvaluations((current) => ({ ...current, [key]: result }));
    } catch (err) {
      setEvaluationErrors((current) => ({
        ...current,
        [key]: err instanceof Error ? err.message : 'Project evaluation failed',
      }));
    } finally {
      setEvaluationLoadingKey((current) => (current === key ? null : current));
    }
  }, [article?.sgrid, currentEvaluationKey, selectedProject]);

  useEffect(() => {
    if (activeArticleTab !== 'evaluate' || !evaluateEntry) return;
    if (evaluateEntry.projectId !== selectedProjectId || evaluateEntry.sgrid !== article?.sgrid) return;
    if (!canEvaluate || !currentEvaluationKey || currentEvaluation || currentEvaluationError || evaluationLoading) return;
    if (autoRunEvaluationKeys.current.has(currentEvaluationKey)) return;

    autoRunEvaluationKeys.current.add(currentEvaluationKey);
    void runEvaluation();
  }, [
    activeArticleTab,
    article?.sgrid,
    canEvaluate,
    currentEvaluation,
    currentEvaluationError,
    currentEvaluationKey,
    evaluateEntry,
    evaluationLoading,
    runEvaluation,
    selectedProjectId,
  ]);

  useEffect(() => {
    if (showDiscoverSurface || !article) return;

    const animationFrame = window.requestAnimationFrame(updateTabIndicator);
    window.addEventListener('resize', updateTabIndicator);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateTabIndicator);
    };
  }, [article, showDiscoverSurface, updateTabIndicator]);

  if (showDiscoverSurface) {
    return (
      <Box p="xl" maw={1320} mx="auto">
        <Box maw={960} mx="auto">
          <ArticleDiscoverPanel />
        </Box>
      </Box>
    );
  }

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Box
        style={{
          flexShrink: 0,
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E5E2',
          padding: '10px 24px',
        }}
      >
        <Group justify="space-between" align="center" gap="md">
          <Button
            variant="default"
            color="elsevierOrange"
            radius="md"
            leftSection={<ArrowLeft size={16} />}
            onClick={showDiscover}
          >
            Discover
          </Button>

          {article && <AddToProjectButton article={article} />}
        </Group>
      </Box>

      <Box p="xl" maw={1320} mx="auto" w="100%" style={{ flex: 1, minWidth: 0 }}>
        {loading && <LoadingArticle />}
        {!loading && error && <ArticleError error={error} onDiscover={showDiscover} />}
        {!loading && !error && !article && <ArticleEmptyState onDiscover={showDiscover} />}

        {!loading && !error && article && (
          <>
            <style>
              {`
                .paperlens-article-tab-list {
                  position: relative;
                  border-bottom: 1px solid #E5E5E2;
                  gap: 28px;
                }

                .paperlens-article-tab {
                  position: relative;
                  min-height: 38px;
                  padding: 0 8px 8px;
                  border: 0 !important;
                  border-radius: 0;
                  background: transparent !important;
                  color: #6B6B66;
                  font-size: 14px;
                  font-weight: 600;
                  letter-spacing: 0;
                  transition:
                    transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1),
                    color 140ms ease;
                }

                .paperlens-article-tab:not([data-active]):hover {
                  color: #C96015;
                  transform: translateY(-1px);
                }

                .paperlens-article-tab[data-active] {
                  color: #E87722;
                  transform: translateY(-1px);
                }

                .paperlens-article-tab svg {
                  width: 16px;
                  height: 16px;
                  stroke-width: 2.25;
                }

                .paperlens-article-tab-indicator {
                  position: absolute;
                  bottom: -1px;
                  left: 0;
                  height: 3px;
                  border-radius: 999px 999px 0 0;
                  background: linear-gradient(90deg, #F59848 0%, #E87722 100%);
                  box-shadow: 0 2px 8px rgba(232, 119, 34, 0.28);
                  pointer-events: none;
                  transition:
                    transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
                    width 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
                    opacity 140ms ease;
                }

                .paperlens-article-panel {
                  animation: paperlens-tab-panel-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
                }

                @keyframes paperlens-tab-panel-in {
                  from {
                    opacity: 0;
                    transform: translateY(6px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }

                @media (prefers-reduced-motion: reduce) {
                  .paperlens-article-tab,
                  .paperlens-article-tab-indicator {
                    transition: none;
                  }

                  .paperlens-article-panel {
                    animation: none;
                  }
                }
              `}
            </style>
            <Tabs
              value={activeArticleTab}
              onChange={(value) => {
                if (value && ARTICLE_TABS.includes(value as ArticleTab)) setArticleTab(value as ArticleTab);
              }}
              color="elsevierOrange"
              keepMounted={false}
            >
              <Tabs.List ref={tabListRef} className="paperlens-article-tab-list">
                <Tabs.Tab
                  ref={(node) => {
                    tabRefs.current.overview = node;
                  }}
                  className="paperlens-article-tab"
                  value="overview"
                  leftSection={<FileText />}
                >
                  {ARTICLE_TAB_LABELS.overview}
                </Tabs.Tab>
                <Tabs.Tab
                  ref={(node) => {
                    tabRefs.current.evaluate = node;
                  }}
                  className="paperlens-article-tab"
                  value="evaluate"
                  leftSection={<ClipboardCheck />}
                >
                  {ARTICLE_TAB_LABELS.evaluate}
                </Tabs.Tab>
                <Tabs.Tab
                  ref={(node) => {
                    tabRefs.current.related = node;
                  }}
                  className="paperlens-article-tab"
                  value="related"
                  leftSection={<Link2 />}
                >
                  {ARTICLE_TAB_LABELS.related}
                </Tabs.Tab>
                <Box
                  aria-hidden
                  className="paperlens-article-tab-indicator"
                  style={{
                    width: tabIndicator.width,
                    opacity: tabIndicator.ready ? 1 : 0,
                    transform: `translateX(${tabIndicator.left}px)`,
                  }}
                />
              </Tabs.List>

              <Tabs.Panel className="paperlens-article-panel" value="overview" pt="lg">
                <SimpleGrid cols={{ base: 1, xl: 2 }} spacing={24} verticalSpacing={24} style={{ alignItems: 'start' }}>
                  <ArticleOverviewCard
                    article={article}
                    abstractOpen={abstractOpen}
                    onToggleAbstract={() => setAbstractOpen((value) => !value)}
                    onKeyword={discoverKeyword}
                  />

                  <Box style={{ position: 'sticky', top: 24 }}>
                    <ChatPanel
                      sgrid={article.sgrid}
                      doi={article.doi}
                      title={article.title}
                      suggestions={suggestions}
                      height="calc(100vh - 250px)"
                    />
                  </Box>
                </SimpleGrid>
              </Tabs.Panel>

              <Tabs.Panel className="paperlens-article-panel" value="evaluate" pt="lg">
                <EvaluationTabPanel
                  projects={projects}
                  selectedProjectId={selectedProjectId}
                  onProjectChange={setSelectedProjectId}
                  selectedProject={selectedProject}
                  article={article}
                  evaluation={currentEvaluation}
                  loading={evaluationLoading}
                  error={currentEvaluationError}
                  canEvaluate={canEvaluate}
                  onEvaluate={() => void runEvaluation()}
                />
              </Tabs.Panel>

              <Tabs.Panel className="paperlens-article-panel" value="related" pt="lg">
                <Box maw={960}>
                  <RelatedArticlesPanel article={article} onOpenArticle={(target) => navigate(target)} />
                </Box>
              </Tabs.Panel>
            </Tabs>
          </>
        )}
      </Box>
    </Box>
  );
}
