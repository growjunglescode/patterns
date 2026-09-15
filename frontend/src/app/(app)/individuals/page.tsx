"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, mediaSrc, type Individual } from "@/lib/api";
import { Rosette } from "@/components/Brand";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { ALL_PROJECTS, writeProjectId } from "@/lib/project";
import { useProjectId } from "@/lib/useProjectId";

const LIFE: Record<string, string> = {
  alive: "CAPTURED",
  lost: "LOST",
  dead: "DEAD",
  unknown: "UNKNOWN",
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function IndividualsPage() {
  return (
    <Suspense fallback={<p className="text-ink/40">Loading catalog…</p>}>
      <IndividualsGrid />
    </Suspense>
  );
}

function IndividualsGrid() {
  const search = useSearchParams();
  const [q, setQ] = useState(search.get("q") || "");
  const [items, setItems] = useState<Individual[]>([]);
  const [species, setSpecies] = useState("");
  const [status, setStatus] = useState("");
  const [sex, setSex] = useState("");
  const [life, setLife] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const headerProjectId = useProjectId();

  // Always load every individual the user can access — do not hide other projects.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .individuals()
      .then((rows) => {
        if (!cancelled) setItems(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync page filter from header when it changes (All projects → clear filter)
  useEffect(() => {
    setProjectFilter(headerProjectId || "");
  }, [headerProjectId]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const ind of items) {
      if (ind.project_id && ind.project_name) map.set(ind.project_id, ind.project_name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((ind) => {
        if (projectFilter && ind.project_id !== projectFilter) return false;
        if (species && ind.species !== species) return false;
        if (status && ind.identity_status !== status) return false;
        if (sex && (ind.sex || "unknown") !== sex) return false;
        if (life && ind.life_status !== life) return false;
        return matchesQuery(ind, q);
      }),
    [items, q, species, status, sex, life, projectFilter],
  );

  function onProjectFilter(next: string) {
    setProjectFilter(next);
    writeProjectId(next || ALL_PROJECTS);
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="page-kicker">Catalog</p>
        <h1 className="page-title mt-1">Individuals</h1>
        <p className="lede">
          {projectFilter
            ? "Filtered to one project. Choose All projects below to see every catalog you can access."
            : "Showing every individual across projects you can access."}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3">
        <label className="block min-w-[12rem] flex-1 text-[12px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">Project</span>
          <select
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-[14px] text-ink"
            value={projectFilter}
            onChange={(e) => onProjectFilter(e.target.value)}
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projectOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2 text-[12.5px] text-ink/50">
          {loading ? "Loading…" : `${filtered.length} of ${items.length} individuals`}
        </p>
      </div>

      <FilterBar query={q} onQuery={setQ} placeholder="Filter by name or ID…" showing={filtered.length} total={items.length}>
        <FilterSelect label="All species" value={species} onChange={setSpecies} options={uniqueSorted(items.map((i) => i.species))} />
        <FilterSelect label="All statuses" value={status} onChange={setStatus} options={uniqueSorted(items.map((i) => i.identity_status))} />
        <FilterSelect label="All sexes" value={sex} onChange={setSex} options={uniqueSorted(items.map((i) => i.sex || "unknown"))} />
        <FilterSelect label="All life statuses" value={life} onChange={setLife} options={uniqueSorted(items.map((i) => i.life_status))} />
      </FilterBar>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ind) => {
          const pictures = ind.photo_count ?? ind.detection_count ?? 0;
          return (
            <Link
              key={ind.id}
              href={`/individuals/${ind.code}`}
              className="group surface relative overflow-hidden transition hover:-translate-y-0.5 hover:bg-white/[0.03] hover:shadow-lift active:bg-white/[0.05]"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[#0c1210]">
                {ind.photo_url ? (
                  <img
                    src={mediaSrc(ind.photo_url)}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center opacity-25">
                    <Rosette className="h-24 w-24" />
                  </div>
                )}
                <span className="absolute right-3 top-3 rounded-full border border-[#2a3832]/80 bg-[#070a09]/75 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#e6ede8] backdrop-blur-sm">
                  {LIFE[ind.life_status] || ind.life_status}
                </span>
              </div>
              <div className="relative space-y-3 p-4 sm:p-5">
                <div>
                  <p className="font-display text-[1.35rem] font-semibold tracking-tight text-ink">{ind.display_name}</p>
                  <p className="mt-1 font-mono text-[12px] text-ink/45">
                    {ind.code} · {ind.species}
                    {ind.sex ? ` · ${ind.sex}` : ""}
                  </p>
                  {ind.project_name ? (
                    <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-gold/80">{ind.project_name}</p>
                  ) : null}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink/10 pt-3 text-[12.5px]">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">Added</dt>
                    <dd className="mt-1 text-ink/75">{fmtDate(ind.created_at || ind.first_seen)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">Last seen</dt>
                    <dd className="mt-1 text-ink/75">{fmtDate(ind.last_seen || ind.first_seen)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">Pictures</dt>
                    <dd className="mt-1 text-ink/75">
                      {pictures} {pictures === 1 ? "picture" : "pictures"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">Country</dt>
                    <dd className="mt-1 truncate text-ink/75">{ind.country || "—"}</dd>
                  </div>
                </dl>
              </div>
            </Link>
          );
        })}
        {!loading && filtered.length === 0 && <p className="text-ink/40">No individuals match these filters.</p>}
      </div>
    </div>
  );
}
