"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { canonicalRole, roleLabel, ROLE_OPTIONS } from "@/lib/roles";
import { when } from "../ui";
import { useAdminScope } from "../scope";

function AdminPeopleInner() {
  const searchParams = useSearchParams();
  const { projectId: scopeId, projects } = useAdminScope();
  const [rows, setRows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [role, setRole] = useState(searchParams.get("role") || "");
  const [verified, setVerified] = useState(searchParams.get("verified") || "");
  const [onboarding, setOnboarding] = useState(searchParams.get("onboarding") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addProjectId, setAddProjectId] = useState("");
  const [addRole, setAddRole] = useState("researcher");

  function load() {
    api
      .adminPeople()
      .then((list) => {
        setRows(list);
        setSelectedId((current) => current || list[0]?.id || null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load people"));
  }

  useEffect(load, []);

  useEffect(() => {
    if (searchParams.get("q") != null) setQuery(searchParams.get("q") || "");
    if (searchParams.get("role") != null) setRole(searchParams.get("role") || "");
    if (searchParams.get("verified") != null) setVerified(searchParams.get("verified") || "");
    if (searchParams.get("onboarding") != null) setOnboarding(searchParams.get("onboarding") || "");
  }, [searchParams]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (role && canonicalRole(row.role) !== role) return false;
      if (verified === "0" && row.verified) return false;
      if (verified === "1" && !row.verified) return false;
      if (onboarding === "0" && row.onboarding_complete) return false;
      if (onboarding === "1" && !row.onboarding_complete) return false;
      if (scopeId && !(row.memberships || []).some((m: any) => m.project_id === scopeId)) return false;
      if (!needle) return true;
      return [row.display_name, row.email, row.organization, row.country, row.city, row.phone, row.home_project_name]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, query, role, verified, onboarding, scopeId]);

  const selected = filtered.find((row) => row.id === selectedId) || filtered[0] || null;

  async function update(id: string, body: object) {
    const nextRole = "role" in body ? String((body as any).role) : null;
    const current = rows.find((row) => row.id === id);
    if (current && nextRole && canonicalRole(current.role) === "admin" && nextRole !== "admin") {
      if (!window.confirm(`Demote ${current.display_name} from Admin? This cannot leave the system without an admin.`)) {
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const updated = await api.patchUser(id, body);
      setRows((list) => list.map((row) => (row.id === id ? { ...row, ...updated } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update account");
    } finally {
      setBusy(false);
    }
  }

  async function addMembership() {
    if (!selected || !addProjectId) return;
    setBusy(true);
    setError("");
    try {
      const member = await api.adminAddMember(addProjectId, { user_id: selected.id, member_role: addRole });
      setRows((list) =>
        list.map((row) => {
          if (row.id !== selected.id) return row;
          const rest = (row.memberships || []).filter((m: any) => m.project_id !== member.project_id);
          return {
            ...row,
            memberships: [
              ...rest,
              { project_id: member.project_id, project_name: projects.find((p) => p.id === member.project_id)?.name, member_role: member.member_role },
            ],
          };
        }),
      );
      setAddProjectId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add membership");
    } finally {
      setBusy(false);
    }
  }

  async function removeMembership(projectId: string) {
    if (!selected) return;
    if (!window.confirm("Remove this person from the workspace?")) return;
    setBusy(true);
    setError("");
    try {
      await api.adminRemoveMember(projectId, selected.id);
      setRows((list) =>
        list.map((row) => {
          if (row.id !== selected.id) return row;
          return {
            ...row,
            memberships: (row.memberships || []).filter((m: any) => m.project_id !== projectId),
            home_project_id: row.home_project_id === projectId ? null : row.home_project_id,
            home_project_name: row.home_project_id === projectId ? null : row.home_project_name,
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove membership");
    } finally {
      setBusy(false);
    }
  }

  async function setHome(projectId: string | null) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.adminSetHomeProject(selected.id, projectId);
      const name = projectId ? projects.find((p) => p.id === projectId)?.name || null : null;
      setRows((list) =>
        list.map((row) =>
          row.id === selected.id
            ? {
                ...row,
                home_project_id: projectId,
                home_project_name: name,
                memberships:
                  projectId && !(row.memberships || []).some((m: any) => m.project_id === projectId)
                    ? [...(row.memberships || []), { project_id: projectId, project_name: name, member_role: "researcher" }]
                    : row.memberships,
              }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set home workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, institution, city…" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="lg:max-w-[14rem]">
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {roleLabel(item)}
            </option>
          ))}
        </select>
        <select value={verified} onChange={(e) => setVerified(e.target.value)} className="lg:max-w-[12rem]">
          <option value="">Any verification</option>
          <option value="0">Unverified</option>
          <option value="1">Verified</option>
        </select>
        <select value={onboarding} onChange={(e) => setOnboarding(e.target.value)} className="lg:max-w-[12rem]">
          <option value="">Any onboarding</option>
          <option value="0">Incomplete</option>
          <option value="1">Complete</option>
        </select>
        <p className="text-[12.5px] text-[var(--muted)] lg:ml-auto">
          {filtered.length} of {rows.length} accounts
          {scopeId ? " · scoped" : ""}
        </p>
      </div>
      {error && <p className="text-sm text-[var(--signal-warn)]">{error}</p>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="surface overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[48rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="px-4 py-2">Person</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Affiliation</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Onboarding</th>
                  <th className="px-3 py-2 text-right">Photos</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-t border-[var(--line)] ${selected?.id === row.id ? "bg-[#c4a35a]/10" : ""}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.display_name}</p>
                      <p className="text-[12px] text-[var(--muted)]">{row.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      {roleLabel(row.role)}
                      {!row.verified && canonicalRole(row.role) === "scientist" ? (
                        <span className="ml-2 text-[11px] text-[var(--signal-warn)]">unverified</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 capitalize">{row.affiliation_type || "—"}</td>
                    <td className="px-3 py-3">{[row.city, row.country].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-3">{row.onboarding_complete ? "Complete" : "Incomplete"}</td>
                    <td className="px-3 py-3 text-right font-mono">{row.photo_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {selected && (
          <aside className="surface space-y-4 p-5">
            <div>
              <p className="section-title">Dossier</p>
              <h2 className="mt-2 font-display text-2xl">{selected.display_name}</h2>
              <p className="mt-1 text-[13px] text-[var(--muted)]">{selected.email}</p>
            </div>
            <label className="block text-[12px] text-[var(--muted)]">
              Role
              <select
                className="mt-1"
                disabled={busy}
                value={canonicalRole(selected.role)}
                onChange={(e) => update(selected.id, { role: e.target.value, verified: e.target.value !== "scientist" ? true : selected.verified })}
              >
                {ROLE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {roleLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={Boolean(selected.verified)}
                disabled={busy || canonicalRole(selected.role) === "admin"}
                onChange={(e) => update(selected.id, { verified: e.target.checked })}
              />
              Verified for identity work
            </label>
            <dl className="space-y-2 text-[13px]">
              {[
                ["Phone", selected.phone],
                ["Based", [selected.city, selected.country].filter(Boolean).join(", ")],
                ["Institution", selected.organization],
                ["Study area", [selected.study_region, selected.study_country].filter(Boolean).join(" · ")],
                ["ORCID", selected.orcid],
                ["Home project", selected.home_project_name],
                ["Joined", when(selected.created_at)],
                ["Reviews logged", selected.review_count],
                ["Public profile", selected.profile_public ? "Yes" : "No"],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-3 border-b border-[var(--line)] pb-2">
                  <dt className="text-[var(--muted)]">{label}</dt>
                  <dd className="text-right">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {selected.bio && <p className="text-[13px] leading-relaxed text-[var(--muted)]">{selected.bio}</p>}
            <div>
              <p className="section-title mb-2">Workspaces</p>
              <ul className="space-y-2 text-[13px]">
                {(selected.memberships || []).map((item: any) => (
                  <li key={item.project_id} className="flex items-start justify-between gap-2 border-b border-[var(--line)] pb-2">
                    <div>
                      <p>{item.project_name}</p>
                      <p className="text-[11px] text-[var(--muted)]">{item.member_role}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {selected.home_project_id === item.project_id ? (
                        <span className="text-[11px] text-[var(--gold)]">Home</span>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => setHome(item.project_id)} className="text-[11px] font-semibold text-[var(--gold)]">
                          Set home
                        </button>
                      )}
                      <button type="button" disabled={busy} onClick={() => removeMembership(item.project_id)} className="text-[11px] text-[var(--signal-warn)]">
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
                {(selected.memberships || []).length === 0 && <li className="text-[var(--muted)]">No workspace memberships.</li>}
              </ul>
              <div className="mt-3 space-y-2">
                <select value={addProjectId} onChange={(e) => setAddProjectId(e.target.value)}>
                  <option value="">Add to workspace…</option>
                  {projects
                    .filter((p) => !(selected.memberships || []).some((m: any) => m.project_id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <div className="flex gap-2">
                  <select value={addRole} onChange={(e) => setAddRole(e.target.value)} className="flex-1">
                    <option value="researcher">Researcher</option>
                    <option value="admin">Project admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy || !addProjectId}
                    onClick={addMembership}
                    className="rounded-md bg-[var(--gold)] px-3 py-1.5 text-[12px] font-semibold text-[#070a09]"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            <Link href={`/observations?uploader=${selected.id}`} className="inline-block text-[13px] font-semibold text-[var(--gold)]">
              View this person’s photos
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function AdminPeoplePage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading people…</p>}>
      <AdminPeopleInner />
    </Suspense>
  );
}
