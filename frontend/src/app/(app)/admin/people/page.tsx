"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { canonicalRole, roleLabel, ROLE_OPTIONS } from "@/lib/roles";
import { when } from "../ui";

export default function AdminPeoplePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.adminPeople().then((list) => {
      setRows(list);
      setSelectedId((current) => current || list[0]?.id || null);
    }).catch((e) => setError(e instanceof Error ? e.message : "Could not load people"));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (role && canonicalRole(row.role) !== role) return false;
      if (!needle) return true;
      return [row.display_name, row.email, row.organization, row.country, row.city, row.phone, row.home_project_name]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, query, role]);

  const selected = filtered.find((row) => row.id === selectedId) || filtered[0] || null;

  async function update(id: string, body: object) {
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
        <p className="text-[12.5px] text-[var(--muted)] lg:ml-auto">
          {filtered.length} of {rows.length} accounts
        </p>
      </div>
      {error && <p className="text-sm text-[var(--signal-warn)]">{error}</p>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
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
            {selected.memberships?.length > 0 && (
              <div>
                <p className="section-title mb-2">Projects</p>
                <ul className="space-y-1 text-[13px]">
                  {selected.memberships.map((item: any) => (
                    <li key={item.project_id}>
                      {item.project_name} · {item.member_role}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href={`/observations?uploader=${selected.id}`} className="inline-block text-[13px] font-semibold text-[var(--gold)]">
              View this person’s photos
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}
