"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminAccountFilter } from "@/components/AdminFilters";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { GradeBadge } from "@/components/GradeBadge";
import { api, mediaSrc, type Detection } from "@/lib/api";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { useProjectId } from "@/lib/useProjectId";

export default function ObservationsPage() {
  return (
    <Suspense fallback={<p className="text-ink/40">Loading photos…</p>}>
      <ObservationsList />
    </Suspense>
  );
}

function ObservationsList() {
  const search = useSearchParams();
  const router = useRouter();
  const uploaderFromUrl = search.get("uploader") || "";
  const [items, setItems] = useState<Detection[]>([]);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("");
  const [species, setSpecies] = useState("");
  const [station, setStation] = useState("");
  const [uploader, setUploader] = useState(uploaderFromUrl);
  const [side, setSide] = useState("");
  const projectId = useProjectId();

  useEffect(() => {
    setUploader(uploaderFromUrl);
  }, [uploaderFromUrl]);

  useEffect(() => {
    api.detections(undefined, undefined, uploader || undefined, undefined, projectId).then(setItems).catch(() => setItems([]));
  }, [uploader, projectId]);

  function chooseUploader(id: string) {
    setUploader(id);
    const next = new URLSearchParams(search.toString());
    if (id) next.set("uploader", id);
    else next.delete("uploader");
    const q = next.toString();
    router.replace(q ? `/observations?${q}` : "/observations");
  }

  const filtered = useMemo(
    () =>
      items.filter((obs) => {
        if (grade && obs.grade !== grade) return false;
        if (species && obs.species !== species) return false;
        if (station && obs.station_code !== station) return false;
        if (side && obs.side !== side) return false;
        return matchesQuery(
          {
            name: obs.individual_name,
            suggested: obs.suggested_name,
            species: obs.species,
            station: obs.station_code,
            grade: obs.grade,
            side: obs.side,
            uploader: obs.uploader_name,
          },
          query,
        );
      }),
    [items, query, grade, species, station, side],
  );

  return (
    <div className="space-y-6">
      <h1 className="page-title">{uploader ? "Photos from this account" : "Recent observations"}</h1>
      <FilterBar query={query} onQuery={setQuery} placeholder="Filter photos…" showing={filtered.length} total={items.length}>
        <AdminAccountFilter value={uploader} onChange={chooseUploader} label="All uploaders" />
        <FilterSelect label="All grades" value={grade} onChange={setGrade} options={uniqueSorted(items.map((o) => o.grade))} />
        <FilterSelect label="All species" value={species} onChange={setSpecies} options={uniqueSorted(items.map((o) => o.species))} />
        <FilterSelect label="All stations" value={station} onChange={setStation} options={uniqueSorted(items.map((o) => o.station_code))} />
        <FilterSelect label="All sides" value={side} onChange={setSide} options={uniqueSorted(items.map((o) => o.side))} />
      </FilterBar>
      <div className="space-y-3">
        {filtered.map((obs) => {
          const cover = obs.media.find((m) => m.kind !== "video");
          return (
            <Link
              key={obs.id}
              href={`/observations/${obs.id}`}
              className="flex items-start gap-3 rounded-[1.15rem] bg-paper p-3 shadow-card transition hover:-translate-y-px hover:shadow-lift sm:items-center sm:gap-4"
            >
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaSrc(cover.url)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover bg-canvas sm:h-16 sm:w-16" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink/30 sm:h-16 sm:w-16">◻</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[0.92rem] leading-snug sm:text-[1rem]">
                  {obs.individual_name || obs.suggested_name || "Unknown"} · {obs.species} ·{" "}
                  {obs.station_code || "Unknown station"} ·{" "}
                  {obs.captured_at ? new Date(obs.captured_at).toLocaleDateString() : "—"}
                </p>
                <p className="mt-1 text-[12.5px] text-ink/45 sm:text-sm">
                  conf {(obs.confidence * 100).toFixed(0)}% · {obs.side} side
                  {obs.uploader_name ? ` · ${obs.uploader_name}` : ""}
                </p>
                <div className="mt-2 sm:hidden">
                  <GradeBadge grade={obs.grade} />
                </div>
              </div>
              <div className="hidden shrink-0 sm:block">
                <GradeBadge grade={obs.grade} />
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && <p className="text-ink/40">No photos match these filters.</p>}
      </div>
    </div>
  );
}
