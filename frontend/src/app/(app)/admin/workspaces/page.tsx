"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { api } from "@/lib/api";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { writeProjectId } from "@/lib/project";
import { when } from "../ui";

export default function AdminWorkspacesPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [organization, setOrganization] = useState("");
  const [region, setRegion] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRegion, setCreateRegion] = useState("");
  const [createOrg, setCreateOrg] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  function load() {
    api.adminEstate().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load workspaces"));
  }
  useEffect(load, []);

  const allProjects = data?.projects || [];

  const orgOptions = useMemo(
    () => uniqueSorted(allProjects.map((project: any) => project.organization_name as string | null | undefined)),
    [allProjects],
  );

  const regionOptions = useMemo(
    () => uniqueSorted(allProjects.map((project: any) => project.region as string | null | undefined)),
    [allProjects],
  );

  const creatorOptions = useMemo(() => {
    const fromApi = data?.creators || [];
    if (fromApi.length) {
      return fromApi.map((person: any) => ({
        value: person.id,
        label: person.display_name || person.email || person.id,
      }));
    }
    const seen = new Map<string, string>();
    for (const project of allProjects) {
      if (project.created_by_id && !seen.has(project.created_by_id)) {
        seen.set(project.created_by_id, project.created_by_name || project.created_by_email || project.created_by_id);
      }
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, allProjects]);

  const projects = useMemo(() => {
    return allProjects.filter((project: any) => {
      if (status === "active" && !project.active) return false;
      if (status === "inactive" && project.active) return false;
      if (organization && project.organization_name !== organization) return false;
      if (region && project.region !== region) return false;
      if (creatorId && project.created_by_id !== creatorId) return false;
      return matchesQuery(
        {
          name: project.name,
          slug: project.slug,
          region: project.region,
          organization: project.organization_name,
          creator: `${project.created_by_name || ""} ${project.created_by_email || ""}`,
          members: (project.members || []).map((m: any) => `${m.display_name || ""} ${m.email || ""}`).join(" "),
        },
        query,
      );
    });
  }, [allProjects, query, status, organization, region, creatorId]);

  const stations = useMemo(() => {
    const ids = new Set(projects.map((project: any) => project.id));
    return (data?.stations || []).filter((station: any) => ids.has(station.project_id));
  }, [data, projects]);

  async function toggle(project: any) {
    const nextActive = !project.active;
    if (
      !nextActive &&
      !window.confirm(`Deactivate “${project.name}”? Members keep access history, but the workspace is marked inactive.`)
    ) {
      return;
    }
    setBusy(project.id);
    setError("");
    try {
      const updated = await api.adminPatchProject(project.id, { active: nextActive });
      setData((current: any) => ({
        ...current,
        projects: current.projects.map((row: any) => (row.id === project.id ? { ...row, ...updated } : row)),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update workspace");
    } finally {
      setBusy(null);
    }
  }

  async function createWorkspace() {
    if (!createName.trim()) return;
    setCreateBusy(true);
    setError("");
    try {
      const created = await api.adminCreateProject({
        name: createName.trim(),
        region: createRegion.trim() || null,
        organization_name: createOrg.trim() || null,
      });
      setShowCreate(false);
      setCreateName("");
      setCreateRegion("");
      setCreateOrg("");
      load();
      router.push(`/admin/workspaces/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace");
    } finally {
      setCreateBusy(false);
    }
  }

  function enterWorkspace(projectId: string) {
    writeProjectId(projectId);
    router.push("/overview");
  }

  function clearFilters() {
    setQuery("");
    setStatus("");
    setOrganization("");
    setRegion("");
    setCreatorId("");
  }

  if (error && !data) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading workspaces…</p>;

  const activeCount = allProjects.filter((p: any) => p.active).length;
  const hasFilters = Boolean(query || status || organization || region || creatorId);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-[var(--signal-warn)]">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.9375rem] text-[var(--muted)]">
          Every research workspace across the estate. Create, filter, enter, or deactivate.
        </p>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-full bg-[var(--gold)] px-4 py-2 text-[13px] font-semibold text-[#070a09]"
        >
          {showCreate ? "Cancel" : "New workspace"}
        </button>
      </div>

      {showCreate && (
        <section className="surface space-y-3 p-5">
          <p className="section-title mb-0">Create workspace</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Workspace name" />
            <input value={createRegion} onChange={(e) => setCreateRegion(e.target.value)} placeholder="Region (optional)" />
            <input value={createOrg} onChange={(e) => setCreateOrg(e.target.value)} placeholder="Organization (optional)" />
          </div>
          <button
            type="button"
            disabled={createBusy || !createName.trim()}
            onClick={createWorkspace}
            className="rounded-md bg-[var(--gold)] px-4 py-2 text-[13px] font-semibold text-[#070a09]"
          >
            {createBusy ? "Creating…" : "Create"}
          </button>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="surface px-4 py-4">
          <p className="kpi-value">{allProjects.length}</p>
          <p className="kpi-label">Workspaces</p>
        </div>
        <div className="surface px-4 py-4">
          <p className="kpi-value">{activeCount}</p>
          <p className="kpi-label">Active</p>
        </div>
        <div className="surface px-4 py-4">
          <p className="kpi-value">{data.organizations.length}</p>
          <p className="kpi-label">Organizations</p>
        </div>
        <div className="surface px-4 py-4">
          <p className="kpi-value">{data.stations.length}</p>
          <p className="kpi-label">Stations</p>
        </div>
      </section>

      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Filter by workspace, org, region, member…"
        showing={projects.length}
        total={allProjects.length}
      >
        <FilterSelect
          label="All statuses"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <FilterSelect label="Created by anyone" value={creatorId} onChange={setCreatorId} options={creatorOptions} />
        <FilterSelect label="All organizations" value={organization} onChange={setOrganization} options={orgOptions} />
        <FilterSelect label="All regions" value={region} onChange={setRegion} options={regionOptions} />
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-[var(--gold)]">
            Clear filters
          </button>
        )}
      </FilterBar>

      <section className="surface overflow-hidden">
        <div className="px-5 py-4">
          <p className="section-title mb-1">All workspaces</p>
          <p className="text-[13px] text-[var(--muted)]">
            Filter across every workspace. Enter switches the app into that project’s day-to-day view.
          </p>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[64rem] text-left text-[13px]">
            <thead>
              <tr className="border-y border-[var(--line)]">
                <th className="px-5 py-2">Workspace</th>
                <th className="px-3 py-2">Created by</th>
                <th className="px-3 py-2">Organization</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">IDs</th>
                <th className="px-3 py-2">Photos</th>
                <th className="px-3 py-2">Stations</th>
                <th className="px-3 py-2">People</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project: any) => (
                <tr key={project.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-5 py-3">
                    <Link href={`/admin/workspaces/${project.id}`} className="font-medium hover:text-[var(--gold)]">
                      {project.name}
                    </Link>
                    <p className="font-mono text-[11px] text-[var(--muted)]">{project.slug}</p>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">Created {when(project.created_at)}</p>
                  </td>
                  <td className="px-3 py-3">
                    {project.created_by_name || "—"}
                    {project.created_by_email && (
                      <p className="font-mono text-[11px] text-[var(--muted)]">{project.created_by_email}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">{project.organization_name || "—"}</td>
                  <td className="px-3 py-3">{project.region || "—"}</td>
                  <td className="px-3 py-3 font-mono">{project.individual_count}</td>
                  <td className="px-3 py-3 font-mono">{project.detection_count}</td>
                  <td className="px-3 py-3 font-mono">{project.station_count}</td>
                  <td className="px-3 py-3">
                    {project.members.length === 0
                      ? "—"
                      : project.members.slice(0, 3).map((m: any) => (
                          <p key={m.user_id} className="text-[12px]">
                            {m.display_name}
                          </p>
                        ))}
                    {project.members.length > 3 && (
                      <p className="text-[11px] text-[var(--muted)]">+{project.members.length - 3} more</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={busy === project.id}
                      onClick={() => toggle(project)}
                      className="rounded-md border border-[var(--line)] px-2 py-1 text-[12px]"
                    >
                      {project.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <button
                        type="button"
                        onClick={() => enterWorkspace(project.id)}
                        className="rounded-full bg-[var(--gold)] px-3 py-1 text-[12px] font-semibold text-[#070a09]"
                      >
                        Enter
                      </button>
                      <Link href={`/admin/workspaces/${project.id}`} className="text-[12px] font-semibold text-[var(--gold)]">
                        Admin view
                      </Link>
                      <Link
                        href={`/admin/catalog?project_id=${encodeURIComponent(project.id)}`}
                        className="text-[12px] text-[var(--muted)]"
                      >
                        Catalog
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-[var(--muted)]">
                    No workspaces match these filters.
                    {hasFilters && (
                      <>
                        {" "}
                        <button type="button" onClick={clearFilters} className="font-semibold text-[var(--gold)]">
                          Clear filters
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="px-5 py-4">
          <p className="section-title mb-0">Stations in filtered workspaces</p>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">
            {stations.length} station{stations.length === 1 ? "" : "s"} across the current filter
          </p>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[48rem] text-left text-[13px]">
            <thead>
              <tr className="border-y border-[var(--line)]">
                <th className="px-5 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Workspace</th>
                <th className="px-3 py-2">Coordinates</th>
                <th className="px-3 py-2">Camera</th>
                <th className="px-3 py-2">Photos</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((station: any) => (
                <tr key={station.id} className="border-t border-[var(--line)]">
                  <td className="px-5 py-2.5 font-mono">{station.code}</td>
                  <td className="px-3 py-2.5">{station.name}</td>
                  <td className="px-3 py-2.5">{station.project_name}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--muted)]">
                    {station.latitude?.toFixed?.(4)}, {station.longitude?.toFixed?.(4)}
                  </td>
                  <td className="px-3 py-2.5">{station.camera_model || "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{station.detection_count}</td>
                </tr>
              ))}
              {stations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-[var(--muted)]">
                    No stations in the filtered workspaces.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
