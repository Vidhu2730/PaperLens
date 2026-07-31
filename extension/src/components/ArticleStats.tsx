import { Box, Group, Stack, Text } from '@mantine/core';
import { Calendar, Quote, Tag } from 'lucide-react';
import { ReactNode } from 'react';
import { ArticleDetails } from '../api';

interface Props {
  article: ArticleDetails;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <Box
      style={{
        flex: 1,
        minWidth: 0,
        padding: '14px 18px',
        background: '#FFFFFF',
        border: '1px solid #E5E5E2',
        borderRadius: 12,
      }}
    >
      <Group gap={8} mb={6} c="dimmed">
        {icon}
        <Text fz={11} tt="uppercase" fw={600} style={{ letterSpacing: 1 }}>
          {label}
        </Text>
      </Group>
      <Text fz={22} fw={700} lh={1.1}>
        {value}
      </Text>
    </Box>
  );
}

function keywordCount(article: ArticleDetails): number {
  if (Array.isArray(article.keywords)) return article.keywords.length;
  if (typeof article.keywords === 'string' && article.keywords.trim()) return 1;
  return 0;
}

function citationCount(article: ArticleDetails): number | string {
  if (Array.isArray(article.citations)) return article.citations.length;
  if (typeof article.citations === 'number') return article.citations;
  return '—';
}

function publicationYear(article: ArticleDetails): number | string {
  return article.publicationYear ?? article.issueYear ?? '—';
}

export default function ArticleStats({ article }: Props) {
  return (
    <Group gap="sm" wrap="nowrap" align="stretch">
      <Stat
        icon={<Quote size={14} />}
        value={citationCount(article)}
        label="Citations"
      />
      <Stat
        icon={<Calendar size={14} />}
        value={publicationYear(article)}
        label="Published"
      />
      <Stat
        icon={<Tag size={14} />}
        value={keywordCount(article)}
        label="Keywords"
      />
    </Group>
  );
}
