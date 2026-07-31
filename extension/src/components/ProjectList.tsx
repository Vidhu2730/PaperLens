import { ActionIcon, Badge, Box, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { CheckCircle2, FolderKanban, Plus } from 'lucide-react';
import { Project } from '../hooks/useProjects';

interface Props {
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export default function ProjectList({ projects, activeId, onSelect, onCreate }: Props) {
  return (
    <Box
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E2',
        borderRadius: 14,
        padding: 14,
        height: '100%',
      }}
    >
      <Group justify="space-between" mb="md" px="xs">
        <Text fz="sm" fw={700}>
          Projects
        </Text>
        <Tooltip label="New project">
          <ActionIcon variant="light" color="elsevierOrange" radius="md" onClick={onCreate}>
            <Plus size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {projects.length === 0 ? (
        <Box
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: '#6B6B66',
          }}
        >
          <Box
            style={{
              width: 40,
              height: 40,
              margin: '0 auto 10px',
              borderRadius: 10,
              background: 'rgba(232, 119, 34, 0.1)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <FolderKanban size={20} color="#E87722" />
          </Box>
          <Text fz="xs">Create your first project to start saving articles.</Text>
        </Box>
      ) : (
        <Stack gap={2}>
          {projects.map((project) => {
            const active = project.id === activeId;
            const current = project.is_current;
            return (
              <UnstyledButton
                key={project.id}
                onClick={() => onSelect(project.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  display: 'block',
                  textAlign: 'left',
                  background: active ? 'rgba(232, 119, 34, 0.08)' : 'transparent',
                  borderLeft: active ? '3px solid #E87722' : '3px solid transparent',
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={(event) => {
                  if (!active) event.currentTarget.style.background = 'rgba(0,0,0,0.03)';
                }}
                onMouseLeave={(event) => {
                  if (!active) event.currentTarget.style.background = 'transparent';
                }}
              >
                <Text
                  fz="sm"
                  fw={active ? 600 : 500}
                  c={active ? 'elsevierOrange.8' : 'dark.7'}
                  lineClamp={1}
                >
                  {project.name || 'Untitled project'}
                </Text>
                <Group gap={6} mt={6}>
                  {current && (
                    <Badge
                      variant="light"
                      color="green"
                      radius="sm"
                      leftSection={<CheckCircle2 size={10} />}
                      style={{ height: 26 }}
                    >
                      Current
                    </Badge>
                  )}
                  <Text fz={11} c="dimmed">
                    {project.criteria.length} criteria / {project.articles.length} articles
                  </Text>
                </Group>
              </UnstyledButton>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
