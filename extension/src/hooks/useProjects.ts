import { useCallback, useEffect, useState } from 'react';
import {
  addProjectArticle,
  ArticleDetails,
  createProject as createProjectApi,
  deleteProject as deleteProjectApi,
  getProject,
  listProjects,
  Project,
  ProjectArticle,
  removeProjectArticle,
  renameProject as renameProjectApi,
  setProjectCriteria,
  setCurrentProject as setCurrentProjectApi,
  updateProjectDescription as updateProjectDescriptionApi,
} from '../api';

export type SavedArticle = ProjectArticle;
export type { Project };

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const summaries = await listProjects();
    const details = await Promise.all(summaries.map((project) => getProject(project.id)));
    setProjects(details);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    listProjects()
      .then((summaries) => Promise.all(summaries.map((project) => getProject(project.id))))
      .then((details) => {
        if (cancelled) return;
        setProjects(details);
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('PaperLens projects API error:', err);
          setProjects([]);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createProject = useCallback(
    async (
      name = 'Untitled project',
      options: { description?: string | null } = {},
    ): Promise<Project> => {
      const created = await createProjectApi(name, options);
      const detailed = await getProject(created.id);
      setProjects((current) => [detailed, ...current]);
      return detailed;
    },
    [],
  );

  const renameProject = useCallback(async (id: string, name: string) => {
    await renameProjectApi(id, name);
    await refresh();
  }, [refresh]);

  const updateDescription = useCallback(async (id: string, description: string) => {
    await updateProjectDescriptionApi(id, description);
    setProjects((current) =>
      current.map((p) => (p.id === id ? { ...p, description } : p))
    );
  }, []);

  const setCurrentProject = useCallback(async (id: string | null) => {
    await setCurrentProjectApi(id);
    setProjects((current) =>
      current.map((p) => ({ ...p, is_current: Boolean(id && p.id === id) }))
    );
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await deleteProjectApi(id);
    setProjects((current) => current.filter((project) => project.id !== id));
  }, []);

  const setCriteria = useCallback(async (id: string, criteria: string[]) => {
    await setProjectCriteria(id, criteria);
    await refresh();
  }, [refresh]);

  const addArticleToProject = useCallback(
    async (
      projectId: string,
      article: { article?: ArticleDetails; sgrid?: string | null; doi?: string | null; pii?: string | null },
    ) => {
      if (!article.article && !article.sgrid && !article.doi && !article.pii) return;
      await addProjectArticle(projectId, {
        article: article.article,
        sgrid: article.sgrid,
        doi: article.doi,
        pii: article.pii,
      });
      await refresh();
    },
    [refresh],
  );

  const removeArticleFromProject = useCallback(
    async (projectId: string, articleId: string) => {
      await removeProjectArticle(projectId, articleId);
      await refresh();
    },
    [refresh],
  );

  return {
    ready,
    projects,
    refresh,
    createProject,
    renameProject,
    updateDescription,
    deleteProject,
    setCurrentProject,
    setCriteria,
    addArticleToProject,
    removeArticleFromProject,
  };
}
