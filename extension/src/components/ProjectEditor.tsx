import { Badge, Box, Button, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Check, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Project } from '../hooks/useProjects';
import CriteriaEditor from './CriteriaEditor';
import SavedArticles from './SavedArticles';

interface Props {
  project: Project;
  onRename: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onCriteriaChange: (criteria: string[]) => void;
  onSetCurrent: () => void;
  onDelete: () => void;
  onRemoveArticle: (articleId: string) => void;
}

export default function ProjectEditor({
  project,
  onRename,
  onDescriptionChange,
  onCriteriaChange,
  onSetCurrent,
  onDelete,
  onRemoveArticle,
}: Props) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [confirmOpen, { open, close }] = useDisclosure(false);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
  }, [project.id, project.name, project.description]);

  const commitName = () => {
    const next = name.trim() || 'Untitled project';
    if (next !== project.name) onRename(next);
  };

  const commitDescription = () => {
    const next = description.trim();
    if (next !== (project.description ?? '')) onDescriptionChange(next);
  };

  return (
    <Stack gap="xl">
      <Box
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E2',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <Group justify="space-between" align="center" mb={6}>
          <Text fz={11} tt="uppercase" fw={600} c="dimmed" style={{ letterSpacing: 1.2 }}>
            Project name
          </Text>
          {project.is_current && (
            <Badge
              variant="light"
              color="green"
              radius="sm"
              leftSection={<Check size={12} />}
              style={{ height: 30 }}
            >
              Current project
            </Badge>
          )}
          {!project.is_current && (
            <Button variant="default" color="elsevierOrange" radius="sm" size="compact-sm" onClick={onSetCurrent}>
              Set current
            </Button>
          )}
        </Group>
        <TextInput
          size="lg"
          radius="md"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          styles={{ input: { fontSize: 22, fontWeight: 700, letterSpacing: -0.3 } }}
        />

        <Text fz={11} tt="uppercase" fw={600} c="dimmed" mt="md" mb={6} style={{ letterSpacing: 1.2 }}>
          Description
        </Text>
        <Textarea
          radius="md"
          placeholder="What is this project about?"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          onBlur={commitDescription}
          autosize
          minRows={2}
          maxRows={5}
        />
      </Box>

      <Box
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E2',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <Stack gap="xs" mb="md">
          <Text fz={11} tt="uppercase" fw={600} c="dimmed" style={{ letterSpacing: 1.2 }}>
            Criteria
          </Text>
          <Text fz="xs" c="dimmed">
            Track the inclusion criteria for this research project.
          </Text>
        </Stack>
        <CriteriaEditor criteria={project.criteria} onChange={onCriteriaChange} />
      </Box>

      <Box
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E2',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <Group justify="space-between" mb="md">
          <Stack gap={2}>
            <Text fz={11} tt="uppercase" fw={600} c="dimmed" style={{ letterSpacing: 1.2 }}>
              Saved articles
            </Text>
            <Text fz="xs" c="dimmed">
              {project.articles.length} saved
            </Text>
          </Stack>
        </Group>
        <SavedArticles project={project} onRemove={onRemoveArticle} />
      </Box>

      <Group justify="flex-end">
        <Button
          variant="subtle"
          color="red"
          leftSection={<Trash2 size={14} />}
          size="sm"
          onClick={open}
        >
          Delete project
        </Button>
      </Group>

      <Modal
        opened={confirmOpen}
        onClose={close}
        title="Delete project?"
        radius="md"
        centered
      >
        <Stack gap="md">
          <Text fz="sm" c="dimmed">
            "{project.name}" and its {project.articles.length} saved article
            {project.articles.length === 1 ? '' : 's'} will be removed.
            {project.is_current ? ' The current-project selection will also be cleared.' : ''}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                onDelete();
                close();
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
