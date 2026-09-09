"use client";

import { useEffect, useMemo, useState } from "react";
import { SightingsMap } from "@/components/SightingsMap";
import { AdminAccountFilter } from "@/components/AdminFilters";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { api, type Individual } from "@/lib/api";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { useProjectId } from "@/lib/useProjectId";

export default function MapPage() {
  const [mode, setMode] = useState<"sightings" | "stations">("sightings");
  const [individualId, setIndividualId] = useState("");
  const [uploader, setUploader] = useState("");
  const [species, setSpecies] = useState("");
  const [grade, setGrade] = useState("");
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [payload, setPayload] = useState<{ points: any[]; track?: any[] }>({ points: [] });
  const [query, setQuery] = useState("");
  const projectId = useProjectId();

  useEffect(() => {
    api.individuals(undefined, projectId).then(setIndividuals).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    api
      .map(
        mode,
        mode === "sightings" ? individualId || undefined : undefined,
        mode === "sightings" ? uploader || undefined : undefined,
        projectId,
      )
      .then(setPayload);
  }, [mode, individualId, uploader, projectId]);

  const selected = useMemo(() => individuals.find((c) => c.id === individualId), [individuals, individualId]);
  const individualOptions = useMemo(() => individuals.filter((c) => matchesQuery(c, query)), [individuals, query]);

  const visiblePoints = useMemo(() => {
    let points = payload.points || [];
    if (mode === "sightings") {
      if (species) points = points.filter((p: any) => p.species === species);
      if (grade) points = points.filter((p: any) => p.grade === grade);
    }
    if (!query.trim() || individualId) return points;
    const names = new Set(individualOptions.map((c) => c.display_name.toLowerCase()));
    return points.filter(
      (p: any) =>
        matchesQuery(p, query) ||
        names.has(String(p.label || "").toLowerCase()) ||
        matchesQuery({ uploader: p.uploader_name }, query),
    );
  }, [payload.points, query, individualId, individualOptions, species, grade, mode]);

  return (
    <div className="space-y-4">
      <FilterBar query={query} onQuery={setQuery} placeholder="Filter map…" showing={visiblePoints.length} total={(payload.points || []).length}>
        <AdminAccountFilter value={uploader} onChange={setUploader} label="All uploaders" />
        {mode === "sightings" && (
          <>
            <FilterSelect
              label="All species"
              value={species}
              onChange={setSpecies}
              options={uniqueSorted((payload.points || []).map((p: any) => p.species))}
            />
            <FilterSelect
              label="All grades"
              value={grade}
              onChange={setGrade}
              options={uniqueSorted((payload.points || []).map((p: any) => p.grade))}
            />
          </>
        )}
      </FilterBar>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-kicker">Field</p>
          <h1 className="page-title mt-1">Map</h1>
          <p className="mt-1 text-[0.9375rem] text-ink/55">
            {selected
              ? `Tracking ${selected.display_name} from camera-trap re-sightings — not a GPS collar.`
              : "All sightings, or pick one individual to follow their movement line."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select
            className="rounded-full border bg-white px-3 py-1.5"
            value={individualId}
            onChange={(e) => {
              setIndividualId(e.target.value);
              setMode("sightings");
            }}
          >
            <option value="">All animals</option>
            {individualOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
          <button
            className={`rounded-full px-3 py-1 ${mode === "sightings" ? "bg-forest text-canvas" : "bg-white"}`}
            onClick={() => setMode("sightings")}
          >
            Sightings
          </button>
          <button
            className={`rounded-full px-3 py-1 ${mode === "stations" ? "bg-forest text-canvas" : "bg-white"}`}
            onClick={() => setMode("stations")}
          >
            Stations
          </button>
        </div>
      </div>
      <SightingsMap points={visiblePoints} track={payload.track || []} height={640} />
    </div>
  );
}
