import { Badge, Box, Button, Group, Stack, Text } from '@mantine/core';
import { ArrowRight } from 'lucide-react';
import { SearchResultItem } from '../api';

interface Props {
  results: SearchResultItem[];
  query: string | null;
  count?: number;
  showCount?: boolean;
  onOpen: (target: string) => void;
}

function authorLine(authors: SearchResultItem['authors']): string {
  if (!authors?.length) return '';
  const names = authors
    .slice(0, 4)
    .map((a) => `${a.givenName || a.given || a.initials || ''} ${a.familyName || a.family || ''}`.trim())
    .filter(Boolean);
  const rest = authors.length - names.length;
  return rest > 0 ? `${names.join(', ')} +${rest}` : names.join(', ');
}

function resultTarget(result: SearchResultItem, query: string | null): string {
  const params = new URLSearchParams({ tab: 'overview', sgrid: result.sgrid });
  if (query) params.set('q', query);
  return `/article?${params.toString()}`;
}

export default function ArticleResultList({
  results,
  query,
  count = results.length,
  showCount = false,
  onOpen,
}: Props) {
  return (
    <>
      {showCount && (
        <Text fz="xs" c="dimmed" mb="sm" mt="md">
          Showing {results.length} of {count} results
        </Text>
      )}
      <Stack gap="sm">
        {results.map((result) => {
          const target = resultTarget(result, query);
          return (
            <Box
              key={result.sgrid || result.doi}
              onClick={() => onOpen(target)}
              style={{
                padding: 16,
                background: '#FFFFFF',
                border: '1px solid #E5E5E2',
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
              }}
              onMouseEnter={(event) => {
                const el = event.currentTarget as HTMLElement;
                el.style.transform = 'translateY(-2px)';
                el.style.boxShadow = '0 8px 24px rgba(20, 20, 18, 0.06)';
                el.style.borderColor = '#F5D9B8';
              }}
              onMouseLeave={(event) => {
                const el = event.currentTarget as HTMLElement;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = 'none';
                el.style.borderColor = '#E5E5E2';
              }}
            >
              <Group gap={6} mb={6}>
                {result.publicationYear && (
                  <Badge variant="light" color="elsevierOrange" size="sm" radius="sm">
                    {result.publicationYear}
                  </Badge>
                )}
                {result.sourceTitle && (
                  <Badge variant="default" size="sm" radius="sm" style={{ fontWeight: 500 }}>
                    {result.sourceTitle}
                  </Badge>
                )}
              </Group>
              <Group gap="sm" align="flex-start" justify="space-between" wrap="nowrap">
                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={600} fz="md" lh={1.35}>
                    {result.title}
                  </Text>
                  {result.authors?.length > 0 && (
                    <Text fz="xs" c="dimmed">
                      {authorLine(result.authors)}
                    </Text>
                  )}
                  {result.abstract && (
                    <Text fz="sm" c="dimmed" lineClamp={3} mt={4}>
                      {result.abstract}
                    </Text>
                  )}
                </Stack>
                <Button
                  variant="default"
                  color="elsevierOrange"
                  size="sm"
                  rightSection={<ArrowRight size={14} />}
                  style={{ flexShrink: 0 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(target);
                  }}
                >
                  View
                </Button>
              </Group>
            </Box>
          );
        })}
      </Stack>
    </>
  );
}
