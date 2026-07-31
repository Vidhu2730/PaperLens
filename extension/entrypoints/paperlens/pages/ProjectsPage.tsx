import { Box, Button, Stack, Text } from '@mantine/core';
import { FolderPlus } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectsContext } from '../../../src/contexts/ProjectsContext';
import ProjectEditor from '../../../src/components/ProjectEditor';

export default function ProjectsPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const {
    ready,
    projects,
    createProject,
    renameProject,
    updateDescription,
    deleteProject,
    setCurrentProject,
    setCriteria,
    removeArticleFromProject,
  } = useProjectsContext();

  // Auto-redirect to first project when landing on /projects with no id
  useEffect(() => {
    if (!ready || id) return;
    if (projects.length > 0) navigate(`/projects/${projects[0].id}`, { replace: true });
  }, [ready, id, projects, navigate]);

  const handleCreate = async () => {
    const project = await createProject('Untitled project');
    navigate(`/projects/${project.id}`);
  };

  if (!ready) return null;

  if (projects.length === 0) {
    return (
      <Box p="xl" maw={520} mx="auto" mt={80} style={{ textAlign: 'center' }}>
        <Box
          style={{
            width: 72,
            height: 72,
            margin: '0 auto 18px',
            borderRadius: 18,
            background: 'linear-gradient(135deg, #FFE0C2 0%, #F59848 100%)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 12px 30px rgba(232, 119, 34, 0.32)',
          }}
        >
          <FolderPlus size={32} color="white" />
        </Box>
        <Text fz={26} fw={700} mb={6} style={{ letterSpacing: -0.4 }}>
          Create your first project
        </Text>
        <Text c="dimmed" mb="xl">
          Projects hold research criteria and saved article references.
        </Text>
        <Button size="md" color="elsevierOrange" radius="md" onClick={handleCreate}>
          Create project
        </Button>
      </Box>
    );
  }

  const active = projects.find((p) => p.id === id) ?? null;

  if (!active) {
    return (
      <Stack align="center" justify="center" mih="100vh">
        <Text c="dimmed" fz="sm">
          Select a project from the sidebar.
        </Text>
      </Stack>
    );
  }

  return (
    <Box p="xl" maw={960} mx="auto" w="100%">
      <ProjectEditor
        project={active}
        onRename={(name) => renameProject(active.id, name)}
        onDescriptionChange={(description) => updateDescription(active.id, description)}
        onCriteriaChange={(criteria) => setCriteria(active.id, criteria)}
        onSetCurrent={() => setCurrentProject(active.id)}
        onDelete={() => {
          void deleteProject(active.id);
          navigate('/projects', { replace: true });
        }}
        onRemoveArticle={(savedArticleId) => removeArticleFromProject(active.id, savedArticleId)}
      />
    </Box>
  );
}
