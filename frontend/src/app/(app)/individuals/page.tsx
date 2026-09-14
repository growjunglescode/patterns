"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, mediaSrc, type Individual } from "@/lib/api";
import { Rosette } from "@/components/Brand";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
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
  const projectId = useProjectId();

  useEffect(() => {
    api.individuals(undefined, projectId).then(setItems).catch(() => setItems([]));
  }, [projectId]);

  const filtered = useMemo(
    () =>
      items.filter((ind) => {
        if (species && ind.species !== species) return false;
        if (status && ind.identity_status !== status) return false;
        if (sex && (ind.sex || "unknown") !== sex) return false;
        if (life && ind.life_status !== life) return false;
        return matchesQuery(ind, q);
      }),
    [items, q, species, status, sex, life],
  );

  return (
    <div className="space-y-7">
      <div>
        <p className="page-kicker">Catalog</p>
        <h1 className="page-title mt-1">Individuals</h1>
        <p className="lede">Each card is a living identity — named or waiting as a system ID.</p>
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
              <div className="relative space-y-2 p-4 sm:p-5">
                <p className="font-display text-[1.35rem] font-semibold tracking-tight text-ink">{ind.display_name}</p>
                <p className="font-mono text-[12px] text-ink/45">
                  {ind.code} · {ind.species} · {ind.sex || "—"}
                </p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1 text-[12px]">
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-ink/35">Added</dt>
                    <dd className="mt-0.5 text-ink/75">{fmtDate(ind.created_at || ind.first_seen)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-ink/35">Last seen</dt>
                    <dd className="mt-0.5 text-ink/75">{fmtDate(ind.last_seen)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-ink/35">Pictures</dt>
                    <dd className="mt-0.5 text-ink/75">
                      {pictures} {pictures === 1 ? "picture" : "pictures"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-ink/35">Status</dt>
                    <dd className="mt-0.5 truncate text-ink/75">{ind.identity_status}</dd>
                  </div>
                </dl>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && <p className="text-ink/40">No individuals match these filters.</p>}
      </div>
    </div>
  );
}
