"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { GradeBadge } from "@/components/GradeBadge";
import { api } from "@/lib/api";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { useProjectId } from "@/lib/useProjectId";

const UNAVAILABLE = "Not available";

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function km(value?: number | null) {
  if (value == null) return "—";
  return `${value < 0.1 ? "0" : value.toFixed(1)} km`;
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [alertQuery, setAlertQuery] = useState("");
  const [topQuery, setTopQuery] = useState("");
  const [species, setSpecies] = useState("");
  const projectId = useProjectId();

  useEffect(() => {
    Promise.all([api.dashboard(projectId), api.analytics(projectId)])
      .then(([dash, analyticsData]) => {
        setData(dash);
        setAnalytics(analyticsData);
      })
      .catch((e) => setError(e.message));
  }, [projectId]);

  const movementRows = useMemo(() => {
    const rows = data?.movement?.rows || [];
    return rows.filter((row: any) => matchesQuery(row, query));
  }, [data, query]);

  const notSeen = useMemo(() => {
    const rows = data?.alerts?.not_seen || [];
    return rows.filter((row: any) => matchesQuery(row, alertQuery));
  }, [data, alertQuery]);

  const newUnidentified = useMemo(() => {
    const rows = data?.alerts?.new_unidentified || [];
    return rows.filter((row: any) => matchesQuery(row, alertQuery));
  }, [data, alertQuery]);

  const topIndividuals = useMemo(() => {
    const rows = analytics?.top_individuals || [];
    return rows.filter(
      (row: any) => (!species || row.species === species) && matchesQuery(row, topQuery),
    );
  }, [analytics, species, topQuery]);

  if (error) return <p>{error}</p>;
  if (!data) return <p className="text-ink/40">Loading dashboard…</p>;

  const t = data.totals;
  const cards = [
    { label: "Known individuals", value: t.known_individuals, note: "in the catalogue" },
    { label: "Active last 90 days", value: t.active_last_90_days, note: "confirmed sighting" },
    { label: "New this year", value: t.new_individuals_this_year, note: "first catalogued" },
    { label: "Camera stations", value: t.stations, note: "surveyed points" },
    { label: "Total images", value: t.total_images, note: "photos & frames" },
    { label: "Total detections", value: t.total_detections, note: "all records" },
    {
      label: "Human reviewed",
      value: t.human_reviewed_percent == null ? UNAVAILABLE : `${t.human_reviewed_percent}%`,
      note: t.human_reviewed_percent == null ? "no detections yet" : `${t.human_reviewed} of ${t.total_detections}`,
    },
    {
      label: "Estimated population",
      value: UNAVAILABLE,
      note: "needs capture-recapture",
    },
  ];

  const sexes = data.sex_breakdown;
  const sexTotal = Math.max(1, sexes.male + sexes.female + sexes.unknown);
  const curve = data.catalogued_over_time;
  const peak = Math.max(1, ...(curve.cumulative as number[]));

  return (
    <div className="space-y-10">
      <div className="max-w-2xl">
        <p className="page-kicker">{data.project_name}</p>
        <h1 className="page-title mt-2">Dashboard</h1>
        <p className="lede">
          Everything on this page is counted from the database as of {fmtDate(data.generated_at)}. Where a figure
          cannot be calculated yet it is marked “{UNAVAILABLE}”.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="surface px-5 py-5">
            <p className={`kpi-value ${typeof c.value === "string" && c.value === UNAVAILABLE ? "!text-[1.1rem] !text-ink/45" : ""}`}>
              {c.value}
            </p>
            <p className="kpi-label">{c.label}</p>
            <p className="mt-2 text-[12.5px] text-gold-deep">{c.note}</p>
          </div>
        ))}
      </div>
      <p className="-mt-6 max-w-3xl text-[12.5px] text-ink/45">{data.notes.population_estimate}</p>

      <section>
        <h2 className="section-title mb-3">Sex breakdown</h2>
        <div className="surface px-6 py-5">
          <div className="space-y-3">
            {[
              ["Male", sexes.male],
              ["Female", sexes.female],
              ["Unknown", sexes.unknown],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="flex items-baseline justify-between text-[13.5px]">
                  <span>{label}</span>
                  <span className="font-mono text-ink/60">
                    {value as number} · {Math.round((100 * (value as number)) / sexTotal)}%
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-canvas">
                  <div
                    className="h-2 rounded-full bg-teal/80"
                    style={{ width: `${(100 * (value as number)) / sexTotal}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] text-ink/45">{data.notes.seeded_attributes}</p>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="section-title">Alerts</h2>
          <FilterBar
            query={alertQuery}
            onQuery={setAlertQuery}
            placeholder="Filter alerts…"
            showing={notSeen.length + newUnidentified.length}
            total={(data.alerts.not_seen?.length || 0) + (data.alerts.new_unidentified?.length || 0)}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface px-6 py-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[0.95rem] font-semibold">
                Not seen in over {data.alerts.not_seen_days} days
              </h3>
              <span className="font-mono text-[12.5px] text-ink/50">{notSeen.length}</span>
            </div>
            <ul className="mt-3 divide-y divide-ink/[0.06]">
              {notSeen.slice(0, 12).map((row: any) => (
                <li key={row.individual_id} className="flex items-center justify-between py-2.5 text-[13.5px]">
                  <Link href={`/individuals/${row.code}`} className="hover:text-gold-deep">
                    {row.display_name} <span className="font-mono text-[11.5px] text-ink/40">{row.code}</span>
                  </Link>
                  <span className="text-ink/55">
                    {row.days_since_seen} days · last {fmtDate(row.last_seen)}
                  </span>
                </li>
              ))}
            </ul>
            {notSeen.length === 0 && (
              <p className="mt-3 text-[13px] text-ink/45">
                {alertQuery ? "No alerts match this filter." : "Every catalogued individual has been seen recently."}
              </p>
            )}
            {notSeen.length > 12 && (
              <p className="mt-3 text-[12.5px] text-ink/45">
                Showing the 12 longest gaps of {notSeen.length}.
              </p>
            )}
          </div>
          <div className="surface px-6 py-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[0.95rem] font-semibold">
                Newly detected, still unidentified
              </h3>
              <span className="font-mono text-[12.5px] text-ink/50">
                {newUnidentified.length}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-ink/45">
              Added to the catalogue in the last {data.alerts.new_individual_days} days without a confirmed name.
            </p>
            <ul className="mt-3 divide-y divide-ink/[0.06]">
              {newUnidentified.slice(0, 12).map((row: any) => (
                <li key={row.individual_id} className="flex items-center justify-between py-2.5 text-[13.5px]">
                  <Link href={`/individuals/${row.code}`} className="hover:text-gold-deep">
                    <span className="font-mono">{row.code}</span>{" "}
                    <span className="capitalize text-ink/55">{row.species}</span>
                  </Link>
                  <span className="text-ink/55">
                    {row.sighting_count} sighting{row.sighting_count === 1 ? "" : "s"} · first {fmtDate(row.first_seen)}
                  </span>
                </li>
              ))}
            </ul>
            {newUnidentified.length === 0 && (
              <p className="mt-3 text-[13px] text-ink/45">
                {alertQuery ? "No alerts match this filter." : "No new unidentified individuals."}
              </p>
            )}
            <p className="mt-4 text-[12.5px] text-ink/45">
              {data.alerts.detections_awaiting_id} photo
              {data.alerts.detections_awaiting_id === 1 ? "" : "s"} are still waiting for an identity
              decision.{" "}
              <Link href="/review" className="font-semibold text-gold-deep hover:underline">
                Open Review
              </Link>
            </p>
          </div>
        </div>
      </section>

      {analytics && (
        <section>
          <h2 className="section-title mb-3">Field patterns</h2>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              [`${analytics.recapture_rate}%`, "Recapture rate"],
              [analytics.named, "Named individuals"],
              [analytics.unnamed, "Still unnamed"],
            ].map(([v, l]) => (
              <div key={String(l)} className="surface px-5 py-4">
                <p className="kpi-value">{v}</p>
                <p className="kpi-label">{l}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface px-6 py-5">
              <h3 className="text-[0.95rem] font-semibold">Activity by hour</h3>
              <div className="mt-4 flex h-32 items-end gap-1">
                {(analytics.hours as number[]).map((n: number, i: number) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-teal/80"
                    style={{ height: `${4 + (n / Math.max(...analytics.hours, 1)) * 100}%` }}
                    title={`${i}:00 — ${n}`}
                  />
                ))}
              </div>
            </div>
            <div className="surface px-6 py-5">
              <h3 className="text-[0.95rem] font-semibold">Species distribution</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {Object.entries(analytics.species || {}).map(([k, v]) => (
                  <li key={k} className="flex justify-between capitalize">
                    <span>{k}</span>
                    <span className="font-mono">{v as number}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="surface mt-6 px-6 py-5">
            <h3 className="text-[0.95rem] font-semibold">Top individuals</h3>
            <div className="mt-3">
              <FilterBar
                query={topQuery}
                onQuery={setTopQuery}
                placeholder="Filter individuals…"
                showing={topIndividuals.length}
                total={(analytics.top_individuals || []).length}
              >
                <FilterSelect
                  label="All species"
                  value={species}
                  onChange={setSpecies}
                  options={uniqueSorted((analytics.top_individuals || []).map((r: any) => r.species))}
                />
              </FilterBar>
            </div>
            <div className="table-scroll">
            <table className="mt-4 w-full min-w-[28rem] text-left text-[13px]">
              <thead className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink/40">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Species</th>
                  <th className="py-2">Detections</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {topIndividuals.map((row: any, i: number) => (
                  <tr key={row.id} className="border-t border-ink/5">
                    <td className="py-2 pr-3 font-mono text-ink/40">{i + 1}</td>
                    <td className="py-2 font-medium">
                      <Link href={`/individuals/${row.code || row.id}`} className="hover:text-gold-deep">
                        {row.display_name}
                      </Link>
                    </td>
                    <td className="py-2 capitalize">{row.species}</td>
                    <td className="py-2 font-mono">{row.detections}</td>
                    <td className="py-2">
                      <GradeBadge grade={row.identity_status === "named" ? "research_grade" : "needs_id"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="section-title">Movement</h2>
        </div>
        <p className="mb-3 rounded-2xl border border-gold/40 bg-gold/[0.09] px-4 py-3 text-[13px] text-ink/70">
          <span className="font-semibold">These are minimum distances.</span> {data.movement.caveat}
        </p>
        <FilterBar
          query={query}
          onQuery={setQuery}
          placeholder="Filter individuals…"
          showing={movementRows.length}
          total={data.movement.rows.length}
        />
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink/40">
              <tr>
                {["Individual", "Last 30 days", "Total min. distance", "Widest span", "Sightings", "Cameras", "Last seen"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {movementRows.map((row: any) => (
                <tr key={row.individual_id} className="border-t border-ink/5">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/individuals/${row.code}`} className="hover:text-gold-deep">
                      {row.display_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono">{km(row.distance_last_30_days_km)}</td>
                  <td className="px-4 py-3 font-mono">{km(row.total_min_distance_km)}</td>
                  <td className="px-4 py-3 font-mono">{km(row.max_span_km)}</td>
                  <td className="px-4 py-3 font-mono">{row.sighting_count}</td>
                  <td className="px-4 py-3 font-mono">{row.distinct_cameras}</td>
                  <td className="px-4 py-3 font-mono">{fmtDate(row.last_seen)}</td>
                </tr>
              ))}
              {movementRows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-ink/40" colSpan={7}>
                    No individuals with confirmed sightings match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3">{curve.label}</h2>
        <div className="surface px-6 py-5">
          {curve.months.length === 0 ? (
            <p className="text-[13px] text-ink/45">Nothing catalogued yet, so there is no curve to draw.</p>
          ) : (
            <>
              <div className="flex h-40 items-end gap-1">
                {(curve.cumulative as number[]).map((n, i) => (
                  <div
                    key={curve.months[i]}
                    className="flex-1 rounded-t bg-forest/80"
                    style={{ height: `${Math.max(3, (100 * n) / peak)}%` }}
                    title={`${curve.months[i]}: ${n} catalogued`}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[11px] text-ink/40">
                <span>{curve.months[0]}</span>
                <span>{curve.months[curve.months.length - 1]}</span>
              </div>
              <p className="mt-2 text-[13px] text-ink/60">
                {peak} individuals catalogued to date.
              </p>
            </>
          )}
          <p className="mt-3 text-[12.5px] text-ink/45">{curve.note}</p>
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3">Exports</h2>
        <div className="surface flex flex-wrap items-center gap-3 px-6 py-5">
          <button
            type="button"
            onClick={() => api.exportSightingsCsv()}
            className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm"
          >
            Sightings CSV
          </button>
          <button
            type="button"
            onClick={() => api.exportCaptureMatrixCsv(data.project_id || undefined)}
            className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm"
          >
            Capture matrix CSV
          </button>
          <button
            type="button"
            onClick={() => api.exportSightingsGeoJson()}
            className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm"
          >
            Sightings GeoJSON
          </button>
          <p className="text-[12.5px] text-ink/45">
            Coordinates in every export are generalised to match what your role is allowed to see.
          </p>
        </div>
      </section>
    </div>
  );
}
