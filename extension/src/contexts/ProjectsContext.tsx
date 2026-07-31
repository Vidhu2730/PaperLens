import { createContext, ReactNode, useContext } from 'react';
import { useProjects } from '../hooks/useProjects';

type ProjectsContextValue = ReturnType<typeof useProjects>;

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const value = useProjects();
  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjectsContext(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjectsContext must be used inside ProjectsProvider');
  return ctx;
}
