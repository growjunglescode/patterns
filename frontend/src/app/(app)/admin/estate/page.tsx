"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { when } from "../ui";

export default function AdminEstatePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    api.adminEstate().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load estate"));
  }
  useEffect(load, []);

  async function toggle(project: any) {
    setBusy(project.id);
    setError("");
    try {
      const updated = await api.adminPatchProject(project.id, { active: !project.active });
      setData((current: any) => ({
        ...current,
        projects: current.projects.map((row: any) => (row.id === project.id ? { ...row, ...updated } : row)),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update project");
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading field estate…</p>;

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-[var(--signal-warn)]">{error}</p>}

      <section className="surface overflow-hidden">
        <div className="px-5 py-4">
          <p className="section-title mb-0">Organizations</p>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[32rem] text-left text-[13px]">
            <thead>
              <tr className="border-y border-[var(--line)]">
                <th className="px-5 py-2">Name</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Projects</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.organizations.map((org: any) => (
                <tr key={org.id} className="border-t border-[var(--line)]">
                  <td className="px-5 py-2.5 font-medium">{org.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--muted)]">{org.slug}</td>
                  <td className="px-3 py-2.5">{org.region || "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{org.project_count}</td>
                  <td className="px-3 py-2.5 text-[var(--muted)]">{when(org.created_at)}</td>
                </tr>
              ))}
              {data.organizations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-[var(--muted)]">
                    No organizations yet. They appear when a university or institution completes onboarding.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="px-5 py-4">
          <p className="section-title mb-0">Projects</p>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[52rem] text-left text-[13px]">
            <thead>
              <tr className="border-y border-[var(--line)]">
                <th className="px-5 py-2">Project</th>
                <th className="px-3 py-2">Organization</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">IDs</th>
                <th className="px-3 py-2">Photos</th>
                <th className="px-3 py-2">Stations</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project: any) => (
                <tr key={project.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-5 py-3">
                    <p className="font-medium">{project.name}</p>
                    <p className="font-mono text-[11px] text-[var(--muted)]">{project.slug}</p>
                  </td>
                  <td className="px-3 py-3">{project.organization_name || "—"}</td>
                  <td className="px-3 py-3">{project.region || "—"}</td>
                  <td className="px-3 py-3 font-mono">{project.individual_count}</td>
                  <td className="px-3 py-3 font-mono">{project.detection_count}</td>
                  <td className="px-3 py-3 font-mono">{project.station_count}</td>
                  <td className="px-3 py-3">
                    {project.members.length === 0
                      ? "—"
                      : project.members.map((m: any) => (
                          <p key={m.user_id} className="text-[12px]">
                            {m.display_name} · {m.role}
                          </p>
                        ))}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="px-5 py-4">
          <p className="section-title mb-0">Camera stations</p>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[48rem] text-left text-[13px]">
            <thead>
              <tr className="border-y border-[var(--line)]">
                <th className="px-5 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Coordinates</th>
                <th className="px-3 py-2">Camera</th>
                <th className="px-3 py-2">Photos</th>
              </tr>
            </thead>
            <tbody>
              {data.stations.map((station: any) => (
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
              {data.stations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-[var(--muted)]">
                    No camera traps registered.
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
