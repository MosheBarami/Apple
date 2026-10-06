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
  projects: Project[] | null;
  refresh: () => void;
}

const ProjectsContext = createContext<ProjectsValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const refresh = useCallback(() => {
    listProjects().then(setProjects, () => setProjects((p) => p ?? []));
  }, []);
  useEffect(refresh, [refresh]);
  const value = useMemo(() => ({ projects, refresh }), [projects, refresh]);
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
