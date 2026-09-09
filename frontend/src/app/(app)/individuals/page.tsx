"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type Individual } from "@/lib/api";
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
        {filtered.map((ind) => (
          <Link key={ind.id} href={`/individuals/${ind.code}`} className="group surface relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
            <span className="absolute -right-6 -top-8 opacity-[0.11] transition group-hover:opacity-20">
              <Rosette className="h-32 w-32" />
            </span>
            <div className="relative flex justify-end">
              <span className="rounded-full bg-forest/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-forest">
                {LIFE[ind.life_status] || ind.life_status}
              </span>
            </div>
            <div className="relative my-8 flex h-16 items-center">
              <div className="h-px w-full bg-gradient-to-r from-gold/70 to-transparent" />
            </div>
            <p className="relative font-display text-[1.45rem] font-semibold tracking-tight">{ind.display_name}</p>
            <p className="relative mt-1 font-mono text-[12px] text-ink/45">
              {ind.code} · {ind.species} · {ind.sex || "—"}
            </p>
            <p className="relative mt-2 text-[12.5px] text-ink/50">
              {ind.detection_count} detections · {ind.identity_status}
            </p>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-ink/40">No individuals match these filters.</p>}
      </div>
    </div>
  );
}
