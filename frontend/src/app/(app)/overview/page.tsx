"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminNameFilter } from "@/components/AdminFilters";
import { GradeBadge } from "@/components/GradeBadge";
import { api } from "@/lib/api";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { PROJECT_EVENT, readProjectId } from "@/lib/project";

export default function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("");
  const [proposer, setProposer] = useState("");

  useEffect(() => {
    function load() {
      api.overview(readProjectId() || undefined).then(setData).catch((e) => setError(e.message));
    }
    load();
    window.addEventListener(PROJECT_EVENT, load);
    return () => window.removeEventListener(PROJECT_EVENT, load);
  }, []);

  const tasks = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Detections needing confirmation", value: data.to_review, note: "Needs identification", href: "/review", tone: "review" },
      { label: "Names pending", value: data.names_pending, note: "Admin review", href: "/queues", tone: "review" },
      { label: "Silence (180 days)", value: data.silent_180, note: "No recent detections", href: "/dashboard", tone: "warn" },
      { label: "New uncatalogued", value: data.new_unidentified, note: "Last 30 days", href: "/individuals", tone: "new" },
    ];
  }, [data]);

  const recent = useMemo(() => {
    if (!data) return [];
    return data.recent.filter(
      (row: any) => (!grade || row.grade === grade) && matchesQuery(row, query),
    );
  }, [data, query, grade]);

  const pending = useMemo(() => {
    if (!data) return [];
    return data.pending_names.filter(
      (claim: any) =>
        (!proposer || claim.proposer_name === proposer) && matchesQuery(claim, query),
    );
  }, [data, query, proposer]);

  if (error) return <p>{error}</p>;
  if (!data) return <p className="text-ink/40">Loading workspace…</p>;

  const openWork = tasks.filter((t) => t.value > 0);

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="page-kicker">
          {data.organization_name ? `${data.organization_name} · ` : ""}
          {data.project_name}
        </p>
        <h1 className="page-title mt-2">Field log clock</h1>
        <p className="lede">
          {openWork.length
            ? `${openWork.length} queue${openWork.length === 1 ? "" : "s"} need attention.`
            : "No open queues. Catalog, names, and silence look clear."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tasks.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="surface px-4 py-4 transition hover:border-[var(--gold)] sm:px-5 sm:py-5"
          >
            <p className="kpi-value">{c.value}</p>
            <p className="kpi-label">{c.label}</p>
            <p className="mt-2 text-[12.5px] text-[var(--muted)]">{c.note}</p>
          </Link>
        ))}
      </div>
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Filter lists…"
        showing={recent.length + pending.length}
        total={data.recent.length + data.pending_names.length}
      >
        <FilterSelect
          label="All grades"
          value={grade}
          onChange={setGrade}
          options={uniqueSorted(data.recent.map((r: any) => r.grade))}
        />
        <AdminNameFilter value={proposer} onChange={setProposer} label="All proposers" />
      </FilterBar>
      <section>
        <h2 className="section-title mb-3">Recent field activity</h2>
        <div className="surface divide-y divide-ink/[0.06] overflow-hidden">
          {recent.map((row: any) => (
            <Link
              key={row.id}
              href={`/observations/${row.id}`}
              className="flex items-center justify-between px-5 py-3.5 transition hover:bg-canvas/70"
            >
              <div>
                <p className="text-[0.95rem]">
                  {row.individual_name || row.suggested_name || "Unknown"} detected at{" "}
                  {row.station_code || "Unknown station"}
                </p>
                <p className="text-[12.5px] text-ink/45">
                  {row.captured_at
                    ? new Date(row.captured_at).toLocaleDateString()
                    : new Date(row.created_at).toLocaleDateString()}
                </p>
              </div>
              <GradeBadge grade={row.grade} />
            </Link>
          ))}
          {recent.length === 0 && <p className="px-5 py-8 text-ink/40">No recent activity matches.</p>}
        </div>
      </section>
      <section>
        <h2 className="section-title mb-3">Pending name decisions</h2>
        <div className="space-y-2">
          {pending.map((claim: any) => (
            <div key={claim.id} className="surface flex items-center justify-between px-5 py-3.5">
              <p className="text-[0.95rem]">
                ‘{claim.proposed_name}’ for{" "}
                <span className="font-mono text-[12.5px]">{claim.individual_code}</span> by{" "}
                {claim.proposer_name}
              </p>
              <Link
                href="/queues"
                className="rounded-md border border-ink/15 px-3 py-1 text-[12.5px] font-semibold"
              >
                Review
              </Link>
            </div>
          ))}
          {pending.length === 0 && <p className="text-ink/40">No naming claims waiting.</p>}
        </div>
      </section>
    </div>
  );
}
