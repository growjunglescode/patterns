"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";

const SCOPE_KEY = "patterns_admin_scope_id";
const SCOPE_EVENT = "patterns-admin-scope";

type ProjectRow = {
  id: string;
  name: string;
  active?: boolean;
  region?: string | null;
  organization_name?: string | null;
};

type AdminScopeValue = {
  projectId: string;
  project: ProjectRow | null;
  projects: ProjectRow[];
  setProjectId: (id: string) => void;
  clear: () => void;
  ready: boolean;
};

const AdminScopeContext = createContext<AdminScopeValue | null>(null);

function readStored(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SCOPE_KEY) || "";
}

export function AdminScopeProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProjectIdState(readStored());
    api
      .adminEstate()
      .then((estate) => setProjects(estate.projects || []))
      .catch(() => undefined)
      .finally(() => setReady(true));

    function onExternal() {
      setProjectIdState(readStored());
    }
    window.addEventListener(SCOPE_EVENT, onExternal);
    return () => window.removeEventListener(SCOPE_EVENT, onExternal);
  }, []);

  const setProjectId = useCallback((id: string) => {
    const next = id || "";
    if (next) localStorage.setItem(SCOPE_KEY, next);
    else localStorage.removeItem(SCOPE_KEY);
    setProjectIdState(next);
    window.dispatchEvent(new Event(SCOPE_EVENT));
  }, []);

  const clear = useCallback(() => setProjectId(""), [setProjectId]);

  const project = useMemo(
    () => projects.find((row) => row.id === projectId) || null,
    [projects, projectId],
  );

  const value = useMemo(
    () => ({ projectId, project, projects, setProjectId, clear, ready }),
    [projectId, project, projects, setProjectId, clear, ready],
  );

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>;
}

export function useAdminScope() {
  const ctx = useContext(AdminScopeContext);
  if (!ctx) {
    throw new Error("useAdminScope must be used within AdminScopeProvider");
  }
  return ctx;
}

export function AdminScopeChip() {
  const { projectId, project, projects, setProjectId, clear, ready } = useAdminScope();
  if (!ready) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] bg-[#0d1210] px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Scope
      </span>
      <select
        className="min-w-[12rem] border-0 bg-transparent py-0 text-[13px] font-medium"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      >
        <option value="">All workspaces</option>
        {projects.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
            {row.active === false ? " (inactive)" : ""}
          </option>
        ))}
      </select>
      {project && (
        <button type="button" onClick={clear} className="text-[12px] font-semibold text-[var(--gold)]">
          Clear
        </button>
      )}
    </div>
  );
}
