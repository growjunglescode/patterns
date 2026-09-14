"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { GradeBadge } from "@/components/GradeBadge";
import { api } from "@/lib/api";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { useProjectId } from "@/lib/useProjectId";

type DataRow = {
  id: string;
  individual: string;
  station: string;
  date: string;
  side: string;
  sex: string;
  confidence: number;
  grade: string;
  uploader: string;
};

export default function ResearchDataPage() {
  const projectId = useProjectId();
  const [rows, setRows] = useState<DataRow[]>([]);
  const [matrix, setMatrix] = useState<{ occasions: string[]; rows: { individual: string; occasions: boolean[] }[] } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("");
  const [station, setStation] = useState("");
  const [busyExport, setBusyExport] = useState("");

  useEffect(() => {
    if (!projectId) return;
    setError("");
    Promise.all([api.projectData(projectId), api.captureMatrix(projectId)])
      .then(([table, capture]) => {
        setRows(table || []);
        setMatrix(capture || null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load research data"));
  }, [projectId]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (grade && row.grade !== grade) return false;
        if (station && row.station !== station) return false;
        return matchesQuery(row, query);
      }),
    [rows, grade, station, query],
  );

  async function runExport(kind: "sightings" | "matrix" | "geojson") {
    setBusyExport(kind);
    setError("");
    try {
      if (kind === "sightings") await api.exportSightingsCsv(projectId);
      else if (kind === "matrix") await api.exportCaptureMatrixCsv(projectId);
      else await api.exportSightingsGeoJson(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusyExport("");
    }
  }

  if (!projectId) {
    return <p className="text-ink/45">Select a project to open research data.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="page-kicker">Institution</p>
          <h1 className="page-title mt-1">Research data</h1>
          <p className="lede">
            Spreadsheet-ready detections and a monthly capture matrix for occupancy / SECR-style analysis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-forest"
            disabled={Boolean(busyExport)}
            onClick={() => void runExport("sightings")}
          >
            {busyExport === "sightings" ? "Exporting…" : "Export CSV"}
          </button>
          <button
            type="button"
            className="btn-forest"
            disabled={Boolean(busyExport)}
            onClick={() => void runExport("matrix")}
          >
            {busyExport === "matrix" ? "Exporting…" : "Export capture matrix"}
          </button>
          <button
            type="button"
            className="btn-forest"
            disabled={Boolean(busyExport)}
            onClick={() => void runExport("geojson")}
          >
            {busyExport === "geojson" ? "Exporting…" : "Export GeoJSON"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Filter by individual, station, uploader…"
        showing={filtered.length}
        total={rows.length}
      >
        <FilterSelect
          label="All grades"
          value={grade}
          onChange={setGrade}
          options={uniqueSorted(rows.map((r) => r.grade))}
        />
        <FilterSelect
          label="All stations"
          value={station}
          onChange={setStation}
          options={uniqueSorted(rows.map((r) => r.station).filter((s) => s && s !== "—"))}
        />
      </FilterBar>

      <section className="space-y-3">
        <h2 className="section-title">Detection table</h2>
        <div className="surface overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-ink/10 text-[11px] uppercase tracking-[0.12em] text-ink/45">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Individual</th>
                <th className="px-4 py-3 font-semibold">Station</th>
                <th className="px-4 py-3 font-semibold">Side</th>
                <th className="px-4 py-3 font-semibold">Sex</th>
                <th className="px-4 py-3 font-semibold">Conf</th>
                <th className="px-4 py-3 font-semibold">Grade</th>
                <th className="px-4 py-3 font-semibold">Uploader</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-ink/10 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-ink/70">{row.date}</td>
                  <td className="px-4 py-3">
                    <Link href={`/observations/${row.id}`} className="font-semibold text-ink hover:text-gold">
                      {row.individual}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{row.station}</td>
                  <td className="px-4 py-3 text-ink/70">{row.side || "—"}</td>
                  <td className="px-4 py-3 text-ink/70">{row.sex || "—"}</td>
                  <td className="px-4 py-3 font-mono text-ink/70">{(row.confidence * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3">
                    <GradeBadge grade={row.grade} />
                  </td>
                  <td className="px-4 py-3 text-ink/70">{row.uploader}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-ink/40">
                    {rows.length === 0 ? "No detections in this project yet." : "No rows match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="section-title">Capture matrix</h2>
          <p className="mt-1 text-[13px] text-ink/50">
            Individuals × months with at least one detection. Useful for occupancy and SECR-style summaries.
          </p>
        </div>
        {!matrix ? (
          <p className="text-ink/40">Loading matrix…</p>
        ) : matrix.rows.length === 0 ? (
          <p className="text-ink/40">No identified captures to build a matrix yet.</p>
        ) : (
          <div className="surface overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead className="border-b border-ink/10 text-[10px] uppercase tracking-[0.1em] text-ink/45">
                <tr>
                  <th className="sticky left-0 bg-[var(--paper)] px-4 py-3 font-semibold">Individual</th>
                  {matrix.occasions.map((month) => (
                    <th key={month} className="px-2 py-3 text-center font-semibold whitespace-nowrap">
                      {month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.individual} className="border-b border-ink/10 last:border-0">
                    <td className="sticky left-0 bg-[var(--paper)] px-4 py-2.5 font-medium text-ink">{row.individual}</td>
                    {row.occasions.map((hit, index) => (
                      <td key={`${row.individual}-${matrix.occasions[index]}`} className="px-2 py-2.5 text-center">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-sm ${
                            hit ? "bg-gold" : "bg-ink/15"
                          }`}
                          title={hit ? "Detected" : "Not detected"}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
