"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { api } from "@/lib/api";
import { matchesQuery } from "@/lib/filter";

export default function PortfolioPage() {
  const [data, setData] = useState<any>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.portfolio().then(setData);
  }, []);

  const projects = data?.projects || [];
  const filtered = useMemo(() => projects.filter((p: any) => matchesQuery(p, query)), [projects, query]);

  if (!data) return <p className="text-ink/40">Loading portfolio…</p>;
  const t = data.totals;
  const months = data.months as string[];
  const colors = ["#9aa39b", "#c4a574", "#0F6E56", "#4a7c9b", "#d9d3c5"];

  return (
    <div className="space-y-8">
      <div>
        <p className="page-kicker">Cross-project intelligence</p>
        <h1 className="page-title">Portfolio Dashboard</h1>
        <p className="mt-1.5 text-[0.9375rem] text-ink/55">
          Population trends across {t.projects} projects — {t.individuals} individuals — {t.detections} detections.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          [`${t.projects} Projects`, `${t.active} active`],
          [`${t.individuals}`, "Total individuals"],
          [`${t.detections}`, "Total detections"],
          [`${t.stations}`, "Camera stations"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
            <p className="kpi-value">{v}</p>
            <p className="kpi-label">{l}</p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl bg-white p-4 shadow-card sm:p-6">
        <h2 className="text-xs uppercase tracking-widest text-ink/40">Cumulative sightings</h2>
        <StackedArea months={months} series={data.series} colors={colors} />
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {Object.keys(data.series).map((name, i) => (
            <span key={name} className="flex items-center gap-2">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: colors[i % colors.length] }} />
              {name}
            </span>
          ))}
        </div>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-card sm:p-6">
        <h2 className="text-xs uppercase tracking-widest text-ink/40">Projects</h2>
        <div className="mt-4">
          <FilterBar query={query} onQuery={setQuery} placeholder="Filter projects…" showing={filtered.length} total={projects.length} />
        </div>
        <div className="table-scroll mt-4">
          <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs uppercase text-ink/40">
            <tr>
              <th className="py-2">Project</th>
              <th className="py-2">Region</th>
              <th className="py-2">Individuals</th>
              <th className="py-2">Detections</th>
              <th className="py-2">Stations</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => (
              <tr key={p.id} className="border-t border-ink/5">
                <td className="py-2 font-medium">{p.name}</td>
                <td className="py-2">{p.region || "—"}</td>
                <td className="py-2 font-mono">{p.individual_count}</td>
                <td className="py-2 font-mono">{p.detection_count}</td>
                <td className="py-2 font-mono">{p.station_count}</td>
                <td className="py-2">{p.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}

function StackedArea({ months, series, colors }: { months: string[]; series: Record<string, number[]>; colors: string[] }) {
  const names = Object.keys(series);
  const cols = months.map((_, i) => names.reduce((sum, n) => sum + (series[n][i] || 0), 0));
  const max = Math.max(...cols, 1);
  const w = 800;
  const h = 240;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full">
      {names.map((name, ni) => {
        const pts = months.map((_, i) => {
          const below = names.slice(0, ni).reduce((s, n) => s + (series[n][i] || 0), 0);
          const val = below + (series[name][i] || 0);
          const x = (i / Math.max(months.length - 1, 1)) * w;
          const y = h - (val / max) * (h - 8);
          return `${x},${y}`;
        });
        const base = months.map((_, i) => {
          const below = names.slice(0, ni).reduce((s, n) => s + (series[n][i] || 0), 0);
          const x = (i / Math.max(months.length - 1, 1)) * w;
          const y = h - (below / max) * (h - 8);
          return `${x},${y}`;
        });
        return (
          <polygon
            key={name}
            fill={colors[ni % colors.length]}
            fillOpacity="0.55"
            points={`${pts.join(" ")} ${[...base].reverse().join(" ")}`}
          />
        );
      })}
    </svg>
  );
}
