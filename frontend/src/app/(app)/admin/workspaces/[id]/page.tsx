"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GradeBadge } from "@/components/GradeBadge";
import { api } from "@/lib/api";
import { writeProjectId } from "@/lib/project";
import { Stat, when } from "../../ui";
import { useAdminScope } from "../../scope";

export default function AdminWorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { setProjectId: setScope } = useAdminScope();
  const [data, setData] = useState<any>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("researcher");

  function load() {
    api
      .adminWorkspace(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load workspace"));
  }
  useEffect(load, [id]);
  useEffect(() => {
    api.adminPeople().then(setPeople).catch(() => undefined);
  }, []);

  async function toggleActive() {
    if (!data?.project) return;
    const nextActive = !data.project.active;
    if (
      !nextActive &&
      !window.confirm(`Deactivate “${data.project.name}”? The workspace will be marked inactive across the estate.`)
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await api.adminPatchProject(data.project.id, { active: nextActive });
      setData((current: any) => ({ ...current, project: { ...current.project, ...updated } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update workspace");
    } finally {
      setBusy(false);
    }
  }

  function enterWorkspace() {
    writeProjectId(id);
    setScope(id);
    router.push("/overview");
  }

  async function addMember() {
    if (!addUserId) return;
    setBusy(true);
    setError("");
    try {
      await api.adminAddMember(id, { user_id: addUserId, member_role: addRole });
      setAddUserId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add member");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.adminRemoveMember(id, userId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading workspace…</p>;

  const project = data.project;
  const t = data.totals;
  const memberIds = new Set((data.members || []).map((m: any) => m.user_id));
  const candidates = people.filter((p) => !memberIds.has(p.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/admin/workspaces" className="text-[13px] font-semibold text-[var(--gold)]">
            ← All workspaces
          </Link>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl tracking-tight">{project.name}</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {project.organization_name || "No organization"} · {project.region || "No region"} ·{" "}
            <span className="font-mono">{project.slug}</span>
          </p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Created by {project.created_by_name || "unknown"}
            {project.created_by_email ? ` · ${project.created_by_email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enterWorkspace}
            className="rounded-full bg-[var(--gold)] px-4 py-2 text-[13px] font-semibold text-[#070a09]"
          >
            Enter workspace
          </button>
          <Link
            href={`/admin/catalog?project_id=${encodeURIComponent(project.id)}`}
            className="rounded-full border border-[var(--line)] px-4 py-2 text-[13px] font-semibold"
          >
            Catalog
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={toggleActive}
            className="rounded-full border border-[var(--line)] px-4 py-2 text-[13px] font-semibold"
          >
            {project.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--signal-warn)]">{error}</p>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="People" value={t.members} />
        <Stat label="Stations" value={t.stations} />
        <Stat label="Individuals" value={t.individuals} />
        <Stat label="Photos" value={t.detections} />
        <Stat label="Needs ID" value={t.needs_identification} tone={t.needs_identification ? "warn" : "ok"} />
        <Stat label="Names pending" value={t.pending_names} tone={t.pending_names ? "warn" : "ok"} />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Breakdown title="Grades" rows={data.breakdowns.grades} />
        <Breakdown title="Review states" rows={data.breakdowns.review_states} />
        <Breakdown title="Identity status" rows={data.breakdowns.identity} />
      </div>

      <section className="surface overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="section-title mb-0">Members</p>
          <div className="flex flex-wrap gap-2">
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="min-w-[12rem]">
              <option value="">Add person…</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.display_name} · {person.email}
                </option>
              ))}
            </select>
            <select value={addRole} onChange={(e) => setAddRole(e.target.value)}>
              <option value="researcher">Researcher</option>
              <option value="admin">Project admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="button"
              disabled={busy || !addUserId}
              onClick={addMember}
              className="rounded-md bg-[var(--gold)] px-3 py-1.5 text-[12px] font-semibold text-[#070a09]"
            >
              Add
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[40rem] text-left text-[13px]">
            <thead>
              <tr className="border-y border-[var(--line)]">
                <th className="px-5 py-2">Person</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Account role</th>
                <th className="px-3 py-2">Project role</th>
                <th className="px-3 py-2">Verified</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.members.map((row: any) => (
                <tr key={row.user_id} className="border-t border-[var(--line)]">
                  <td className="px-5 py-2.5 font-medium">{row.display_name || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--muted)]">{row.email}</td>
                  <td className="px-3 py-2.5 capitalize">{row.role || "—"}</td>
                  <td className="px-3 py-2.5">{row.member_role || "—"}</td>
                  <td className="px-3 py-2.5">{row.verified ? "Yes" : "No"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeMember(row.user_id, row.display_name || row.email)}
                      className="text-[12px] text-[var(--signal-warn)]"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {data.members.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-[var(--muted)]">
                    No members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="px-5 py-4">
          <p className="section-title mb-0">Camera stations</p>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[44rem] text-left text-[13px]">
            <thead>
              <tr className="border-y border-[var(--line)]">
                <th className="px-5 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
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
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--muted)]">
                    {station.latitude?.toFixed?.(4)}, {station.longitude?.toFixed?.(4)}
                  </td>
                  <td className="px-3 py-2.5">{station.camera_model || "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{station.detection_count}</td>
                </tr>
              ))}
              {data.stations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-[var(--muted)]">
                    No stations in this workspace.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <p className="section-title mb-0">Individuals</p>
            <Link href={`/admin/catalog?project_id=${encodeURIComponent(project.id)}`} className="text-[13px] text-[var(--gold)]">
              Full catalog
            </Link>
          </div>
          <div className="table-scroll">
            <table className="w-full min-w-[28rem] text-left text-[13px]">
              <thead>
                <tr className="border-y border-[var(--line)]">
                  <th className="px-5 py-2">ID</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.individuals.map((row: any) => (
                  <tr key={row.id} className="border-t border-[var(--line)]">
                    <td className="px-5 py-2.5">
                      <Link href={`/individuals/${row.code}`} className="font-medium">
                        {row.name || row.code}
                      </Link>
                      <p className="font-mono text-[11px] text-[var(--muted)]">{row.code}</p>
                    </td>
                    <td className="px-3 py-2.5 capitalize">{row.identity_status}</td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">{when(row.created_at)}</td>
                  </tr>
                ))}
                {data.individuals.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-[var(--muted)]">
                      No named individuals yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface overflow-hidden">
          <div className="px-5 py-4">
            <p className="section-title mb-0">Recent detections</p>
          </div>
          <div className="table-scroll">
            <table className="w-full min-w-[32rem] text-left text-[13px]">
              <thead>
                <tr className="border-y border-[var(--line)]">
                  <th className="px-5 py-2">When</th>
                  <th className="px-3 py-2">Species</th>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Identity</th>
                </tr>
              </thead>
              <tbody>
                {data.detections.map((row: any) => (
                  <tr key={row.id} className="border-t border-[var(--line)]">
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[12px] text-[var(--muted)]">
                      {when(row.captured_at || row.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/observations/${row.id}`}>{row.species}</Link>
                      <p className="text-[11px] text-[var(--muted)]">{row.station_code || "No station"}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <GradeBadge grade={row.grade} />
                    </td>
                    <td className="px-3 py-2.5">
                      {row.individual_code ? (
                        <Link href={`/individuals/${row.individual_code}`}>{row.individual_name || row.individual_code}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {data.detections.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-[var(--muted)]">
                      No detections yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows || {}).sort((a, b) => b[1] - a[1]);
  return (
    <section className="surface p-5">
      <p className="section-title">{title}</p>
      <dl className="mt-3 space-y-2 text-[13px]">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3 border-b border-[var(--line)] pb-2">
            <dt className="capitalize text-[var(--muted)]">{key.replaceAll("_", " ")}</dt>
            <dd className="font-mono">{value}</dd>
          </div>
        ))}
        {entries.length === 0 && <p className="text-[var(--muted)]">Nothing yet.</p>}
      </dl>
    </section>
  );
}
