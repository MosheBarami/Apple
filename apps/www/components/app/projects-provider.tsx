"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { listProjects, type Project } from "@/lib/api";

interface ProjectsValue {
  error: string | null;
  projects: Project[] | null;
  refresh: () => void;
}

const ProjectsContext = createContext<ProjectsValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    setError(null);
    listProjects().then(
      (items) => {
        setProjects(items);
        setError(null);
      },
      () =>
        setError("Couldn’t load your projects. Your work has not been removed.")
    );
  }, []);
  useEffect(refresh, [refresh]);
  const value = useMemo(
    () => ({ error, projects, refresh }),
    [projects, refresh, error]
  );
  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsValue {
  const value = useContext(ProjectsContext);
  if (!value) {
    throw new Error("useProjects must be used inside ProjectsProvider");
  }
  return value;
}
