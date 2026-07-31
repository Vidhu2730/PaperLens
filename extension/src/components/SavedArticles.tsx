import { Badge, Box, Button, Group, Modal, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, SavedArticle } from '../hooks/useProjects';
import BorderedIconButton from './BorderedIconButton';

interface Props {
  project: Project;
  onRemove: (articleId: string) => void;
}

export default function SavedArticles({ project, onRemove }: Props) {
  const navigate = useNavigate();
  const [pendingRemove, setPendingRemove] = useState<SavedArticle | null>(null);

  if (project.articles.length === 0) {
    return (
      <Box
        style={{
          padding: 20,
          border: '1px dashed #D4D4D0',
          borderRadius: 10,
          textAlign: 'center',
        }}
      >
        <Text fz="sm" c="dimmed">
          Use Add to project from the Article page to save articles here.
        </Text>
      </Box>
    );
  }

  return (
    <>
      <Stack gap={8}>
        {project.articles.map((a: SavedArticle) => {
          const key = `${a.id}-${a.added_at}`;
          const goTo = () => {
            if (a.sgrid) navigate(`/article?sgrid=${encodeURIComponent(a.sgrid)}`);
          };
          return (
            <Box
              key={key}
              style={{
                padding: 14,
                background: '#FFFFFF',
                border: '1px solid #E5E5E2',
                borderRadius: 10,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <UnstyledButton onClick={goTo} disabled={!a.sgrid}>
                  <Text fz="sm" fw={600} lineClamp={2} style={{ lineHeight: 1.4 }}>
                    {a.title}
                  </Text>
                </UnstyledButton>
                <Group gap={6} wrap="wrap">
                  {a.publicationYear && (
                    <Badge variant="light" color="gray" size="xs" radius="sm">
                      {a.publicationYear}
                    </Badge>
                  )}
                  {a.sourceTitle && (
                    <Text fz={11} c="dimmed" lineClamp={1}>
                      {a.sourceTitle}
                    </Text>
                  )}
                  {a.added_at && (
                    <Text fz={11} c="dimmed">
                      Saved {new Date(a.added_at).toLocaleDateString()}
                    </Text>
                  )}
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6} mt={4}>
                  {a.sgrid && <Meta label="SGRID" value={a.sgrid} />}
                  {a.pii && <Meta label="PII" value={a.pii} />}
                  {a.doi && <Meta label="DOI" value={a.doi} />}
                  {typeof a.citationCount === 'number' && <Meta label="Citations" value={String(a.citationCount)} />}
                </SimpleGrid>
                {a.abstract && (
                  <Text fz="xs" c="dimmed" lineClamp={3} mt={4}>
                    {a.abstract}
                  </Text>
                )}
                <Group gap={6} mt={4}>
                  {a.scopus_url && (
                    <Button
                      component="a"
                      href={a.scopus_url}
                      target="_blank"
                      rel="noreferrer"
                      variant="default"
                      color="elsevierOrange"
                      size="compact-xs"
                      leftSection={<ExternalLink size={12} />}
                    >
                      Scopus
                    </Button>
                  )}
                  {a.sciencedirect_url && (
                    <Button
                      component="a"
                      href={a.sciencedirect_url}
                      target="_blank"
                      rel="noreferrer"
                      variant="default"
                      color="elsevierOrange"
                      size="compact-xs"
                      leftSection={<ExternalLink size={12} />}
                    >
                      ScienceDirect
                    </Button>
                  )}
                </Group>
              </Stack>
              <Group gap={6}>
                <BorderedIconButton label="Open article" tone="orange" size={30} radius={8} onClick={goTo} disabled={!a.sgrid}>
                  <ExternalLink size={14} />
                </BorderedIconButton>
                <BorderedIconButton label="Remove from project" tone="danger" size={30} radius={8} onClick={() => setPendingRemove(a)}>
                  <Trash2 size={14} />
                </BorderedIconButton>
              </Group>
            </Box>
          );
        })}
      </Stack>

      <Modal opened={Boolean(pendingRemove)} onClose={() => setPendingRemove(null)} title="Remove saved article?" radius="md" centered>
        <Stack gap="md">
          <Text fz="sm" c="dimmed">
            This removes the article from "{project.name || 'Untitled project'}".
          </Text>
          {pendingRemove && (
            <Text fz="sm" fw={600} lineClamp={2}>
              {pendingRemove.title}
            </Text>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setPendingRemove(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<Trash2 size={14} />}
              onClick={() => {
                if (pendingRemove) onRemove(pendingRemove.id);
                setPendingRemove(null);
              }}
            >
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      <Text fz={10} c="dimmed" tt="uppercase" fw={700} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text fz={11} c="dark.6" lineClamp={1}>
        {value}
      </Text>
    </Group>
  );
}
