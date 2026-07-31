import { Button, Checkbox, Group, Loader, Menu, Stack, Text } from '@mantine/core';
import { ChevronDown, FolderPlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArticleDetails, ProjectArticle } from '../api';
import { useProjectsContext } from '../contexts/ProjectsContext';

interface Props {
  article: ArticleDetails;
}

function matchingSavedArticle(article: ArticleDetails, projectArticles: ProjectArticle[]) {
  return projectArticles.find(
    (saved) =>
      (article.sgrid && saved.sgrid === article.sgrid) ||
      (article.doi && saved.doi === article.doi) ||
      (article.pii && saved.pii === article.pii),
  );
}

function projectName(project: { name?: string | null }) {
  return project.name?.trim() || 'Untitled project';
}

function truncateProjectName(name: string) {
  return name.length > 10 ? `${name.slice(0, 10)}...` : name;
}

export default function AddToProjectButton({ article }: Props) {
  const {
    projects,
    addArticleToProject,
    removeArticleFromProject,
  } = useProjectsContext();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const canSave = Boolean(article.sgrid || article.doi || article.pii);
  const mappedProjects = projects.flatMap((project) => {
    const savedArticle = matchingSavedArticle(article, project.articles);
    return savedArticle ? [{ project, savedArticle }] : [];
  });
  const selectedLabel =
    mappedProjects.length === 0
      ? 'Add to projects'
      : mappedProjects.length === 1
        ? `Added to ${truncateProjectName(projectName(mappedProjects[0].project))}`
        : `Added to ${mappedProjects
            .slice(0, 2)
            .map(({ project }) => truncateProjectName(projectName(project)))
            .join(', ')} (${mappedProjects.length})`;

  const saveToProject = async (projectId: string) => {
    if (!canSave || busyAction) return;
    setBusyAction(`save:${projectId}`);
    try {
      await addArticleToProject(projectId, { article });
    } finally {
      setBusyAction(null);
    }
  };

  const removeFromProject = async (projectId: string, articleId: string) => {
    if (busyAction) return;
    setBusyAction(`remove:${projectId}`);
    try {
      await removeArticleFromProject(projectId, articleId);
    } finally {
      setBusyAction(null);
    }
  };

  const removeFromAllProjects = async () => {
    if (busyAction || mappedProjects.length === 0) return;
    setBusyAction('remove-all');
    try {
      for (const { project, savedArticle } of mappedProjects) {
        await removeArticleFromProject(project.id, savedArticle.id);
      }
    } finally {
      setBusyAction(null);
    }
  };

  if (projects.length === 0) {
    return (
      <Button component={Link} to="/projects" variant="default" color="elsevierOrange" radius="md" leftSection={<FolderPlus size={16} />}>
        Create project
      </Button>
    );
  }

  return (
    <Group gap={8} wrap="nowrap">
      <Menu position="bottom-start" shadow="md" radius="md" width={340} closeOnItemClick={false}>
        <Menu.Target>
          <Button
            variant="default"
            color="elsevierOrange"
            radius="md"
            leftSection={<FolderPlus size={16} />}
            rightSection={<ChevronDown size={14} />}
          >
            {selectedLabel}
          </Button>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Label>Article projects</Menu.Label>
          {mappedProjects.length > 0 && (
            <>
              <Menu.Item
                color="red"
                disabled={Boolean(busyAction)}
                leftSection={busyAction === 'remove-all' ? <Loader size={14} /> : <Trash2 size={14} />}
                onClick={() => void removeFromAllProjects()}
              >
                Clear all
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          {projects.map((project) => {
            const savedArticle = matchingSavedArticle(article, project.articles);
            const alreadySaved = Boolean(savedArticle);
            const saveBusy = busyAction === `save:${project.id}`;
            const removeBusy = busyAction === `remove:${project.id}`;
            return (
              <Menu.Item
                key={project.id}
                disabled={Boolean(busyAction) || (!alreadySaved && !canSave)}
                leftSection={
                  saveBusy || removeBusy ? (
                    <Loader size={14} />
                  ) : (
                    <Checkbox
                      checked={alreadySaved}
                      readOnly
                      size="xs"
                      color="elsevierOrange"
                      aria-hidden
                      styles={{ input: { cursor: 'pointer' } }}
                    />
                  )
                }
                onClick={() => {
                  if (alreadySaved && savedArticle) {
                    void removeFromProject(project.id, savedArticle.id);
                  } else {
                    void saveToProject(project.id);
                  }
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <Stack gap={1} style={{ minWidth: 0 }}>
                    <Text fz="sm" fw={600} lineClamp={1}>
                      {projectName(project)}
                    </Text>
                    <Text fz={11} c="dimmed">
                      {project.articles.length} article{project.articles.length === 1 ? '' : 's'}
                    </Text>
                  </Stack>
                  {alreadySaved && (
                    <Text fz={11} c="dimmed" style={{ flexShrink: 0 }}>
                      Added
                    </Text>
                  )}
                </Group>
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
