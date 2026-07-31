import {
  Alert,
  Box,
  Group,
  Kbd,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { Search as SearchIcon, Sparkles } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { searchArticles, SearchResultItem } from '../api';
import ArticleResultList from './ArticleResultList';

export default function ArticleDiscoverPanel() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = params.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  useEffect(() => {
    const q = params.get('q');
    if (!q) {
      setResults(null);
      setCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setResults(null);

    searchArticles(q, 100)
      .then((resp) => {
        if (cancelled) return;
        setResults(resp.results);
        setCount(resp.count);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Search failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', 'discover');
      next.set('q', trimmed);
      return next;
    });
  };

  return (
    <Box>
      <Stack gap="sm" mb="xl" align="center">
        <Group gap={8} mb={4}>
          <Sparkles size={18} color="#E87722" />
          <Text fz={11} tt="uppercase" fw={700} c="elsevierOrange.7" style={{ letterSpacing: 1.4 }}>
            Scopus
          </Text>
        </Group>
        <Text fz={28} fw={700} ta="center" style={{ letterSpacing: 0 }}>
          Find articles in 90M+ Scopus records
        </Text>
      </Stack>

      <form onSubmit={submit}>
        <TextInput
          size="xl"
          radius="lg"
          placeholder="What are you researching?"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          autoFocus
          leftSection={<SearchIcon size={20} />}
          rightSection={
            <Group gap={4} pr={8} wrap="nowrap">
              <Kbd>Enter</Kbd>
            </Group>
          }
          rightSectionWidth={80}
          styles={{
            input: {
              border: '1px solid #E5E5E2',
              fontSize: 16,
              boxShadow: '0 1px 2px rgba(20, 20, 18, 0.04), 0 8px 20px rgba(20, 20, 18, 0.04)',
            },
          }}
        />
      </form>

      <Box mt="xl">
        {error && (
          <Alert color="red" variant="light" radius="md">
            {error}
          </Alert>
        )}

        {loading && (
          <Stack gap="md" mt="md">
            {[0, 1, 2, 3].map((item) => (
              <Box
                key={item}
                style={{
                  padding: 16,
                  background: '#FFFFFF',
                  border: '1px solid #E5E5E2',
                  borderRadius: 12,
                }}
              >
                <Group gap="xs" mb={8}>
                  <Skeleton h={18} w={50} radius="sm" />
                  <Skeleton h={18} w={120} radius="sm" />
                </Group>
                <Skeleton h={20} w="80%" mb={8} />
                <Skeleton h={12} w="60%" mb={6} />
                <Skeleton h={12} w="100%" />
                <Skeleton h={12} w="92%" mt={4} />
              </Box>
            ))}
          </Stack>
        )}

        {!loading && !error && results && results.length === 0 && (
          <Text c="dimmed" ta="center" mt="xl">
            No results for "{params.get('q')}". Try a different phrasing.
          </Text>
        )}

        {!loading && !error && results && results.length > 0 && (
          <ArticleResultList
            results={results}
            query={params.get('q')}
            count={count}
            showCount
            onOpen={(target) => navigate(target)}
          />
        )}

        {!loading && !error && !results && (
          <Box
            mt={48}
            style={{
              padding: 48,
              background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF7EE 100%)',
              border: '1px solid #F5D9B8',
              borderRadius: 16,
              textAlign: 'center',
            }}
          >
            <Text fz="lg" fw={600} mb={6}>
              Start typing to search
            </Text>
            <Text fz="sm" c="dimmed">
              Try: "CRISPR gene editing in plants" or "transformer attention mechanisms"
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
