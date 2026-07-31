import { Badge, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { Copy, ExternalLink, FileSearch } from 'lucide-react';
import { ArticleDetails } from '../api';
import BorderedIconButton from './BorderedIconButton';

interface Props {
  article: ArticleDetails;
}

function authorsLabel(authors: ArticleDetails['authors']): string {
  if (!authors?.length) return '';
  const names = authors
    .slice(0, 3)
    .map((a) => `${a.givenName || a.given || a.initials || ''} ${a.familyName || a.family || ''}`.trim())
    .filter(Boolean);
  const rest = authors.length - names.length;
  return rest > 0 ? `${names.join(', ')} +${rest} more` : names.join(', ');
}

function sourceTitle(article: ArticleDetails): string | null {
  return article.sourceTitle ?? article.journalTitle ?? null;
}

function publicationYear(article: ArticleDetails): number | string | null {
  return article.publicationYear ?? article.issueYear ?? null;
}

export default function ArticleHeader({ article }: Props) {
  const copyDoi = () => {
    if (article.doi) navigator.clipboard.writeText(article.doi);
  };
  const source = sourceTitle(article);
  const scopus = article.scopus_url ?? null;
  const scienceDirect = article.sciencedirect_url ?? null;
  const year = publicationYear(article);

  return (
    <Stack gap="md">
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

      <Title order={1} fz={32} lh={1.2} style={{ letterSpacing: 0 }}>
        {article.title || 'Untitled article'}
      </Title>

      {article.authors?.length > 0 && (
        <Text fz="sm" c="dimmed">
          {authorsLabel(article.authors)}
        </Text>
      )}

      <Group gap="xs">
        {scopus && (
          <Tooltip label="View on Scopus">
            <BorderedIconButton
              href={scopus}
              target="_blank"
              rel="noreferrer"
              label="View on Scopus"
              size={38}
            >
              <FileSearch size={16} />
            </BorderedIconButton>
          </Tooltip>
        )}
        {scienceDirect && (
          <Tooltip label="View on ScienceDirect">
            <BorderedIconButton
              href={scienceDirect}
              target="_blank"
              rel="noreferrer"
              label="View on ScienceDirect"
              size={38}
              tone="orange"
            >
              <ExternalLink size={16} />
            </BorderedIconButton>
          </Tooltip>
        )}
        {article.doi && (
          <Tooltip label="Copy DOI">
            <BorderedIconButton label="Copy DOI" size={38} onClick={copyDoi}>
              <Copy size={16} />
            </BorderedIconButton>
          </Tooltip>
        )}
      </Group>
    </Stack>
  );
}
