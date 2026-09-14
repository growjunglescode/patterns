"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminAccountFilter, AdminNameFilter } from "@/components/AdminFilters";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { GradeBadge, ReviewStateBadge } from "@/components/GradeBadge";
import { api, mediaSrc, reviewStateLabel, type Detection, type NamingClaim, type User } from "@/lib/api";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { isAdmin } from "@/lib/roles";
import { useProjectId } from "@/lib/useProjectId";

type Tab = "jaguars" | "names";

export default function ReviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "names" ? "names" : "jaguars";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<Detection[]>([]);
  const [claims, setClaims] = useState<NamingClaim[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [query, setQuery] = useState("");
  const [station, setStation] = useState("");
  const [uploader, setUploader] = useState("");
  const [grade, setGrade] = useState("");
  const [status, setStatus] = useState("");
  const [proposer, setProposer] = useState("");
  const [error, setError] = useState("");
  const projectId = useProjectId();

  useEffect(() => {
    setTab(searchParams.get("tab") === "names" ? "names" : "jaguars");
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    if (next === "names") params.set("tab", "names");
    else params.delete("tab");
    const qs = params.toString();
    router.replace(qs ? `/review?${qs}` : "/review");
  }

  useEffect(() => {
    api.me().then(setUser).catch(() => undefined);
  }, []);

  useEffect(() => {
    api
      .claims(projectId)
      .then(setClaims)
      .catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    Promise.all([
      api.detections("needs_id", undefined, uploader || undefined, undefined, projectId),
      api.detections(undefined, undefined, uploader || undefined, "potential_match", projectId),
      api.detections(undefined, undefined, uploader || undefined, "awaiting_second_review", projectId),
    ])
      .then(([needsId, potential, second]) => {
        const byId = new Map<string, Detection>();
        for (const row of [...needsId, ...potential, ...second]) byId.set(row.id, row);
        setItems(
          Array.from(byId.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load jaguar review queue"));
  }, [uploader, projectId]);

  function loadClaims() {
    api
      .claims(projectId)
      .then(setClaims)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load naming claims"));
  }

  async function decide(id: string, approve: boolean) {
    setError("");
    try {
      await api.decideClaim(id, approve);
      loadClaims();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not allowed");
    }
  }

  const jaguarFiltered = useMemo(
    () =>
      items.filter((row) => {
        if (station && row.station_code !== station) return false;
        if (grade && row.grade !== grade) return false;
        return matchesQuery(
          {
            ...row,
            suggested: row.suggested_name || "",
            review: reviewStateLabel(row.review_state),
            uploader: row.uploader_name,
          },
          query,
        );
      }),
    [items, query, station, grade],
  );

  const nameFiltered = useMemo(
    () =>
      claims.filter(
        (c) =>
          (!status || c.status === status) &&
          (!proposer || c.proposer_name === proposer) &&
          matchesQuery(c, query),
      ),
    [claims, query, status, proposer],
  );

  const pendingNames = claims.filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="page-kicker">Collect</p>
        <h1 className="page-title mt-1">Review</h1>
        <p className="lede">
          Confirm jaguar identity matches, and approve or reject proposed names — one place for both queues.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["jaguars", "Jaguars", items.length],
            ["names", "Names", pendingNames],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => selectTab(value)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${
              tab === value ? "bg-forest text-canvas" : "bg-paper text-ink/70 shadow-card"
            }`}
          >
            {label}
            {count > 0 ? <span className="ml-2 font-mono text-[11px] opacity-80">{count}</span> : null}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {tab === "jaguars" && (
        <>
          <FilterBar
            query={query}
            onQuery={setQuery}
            placeholder="Filter by name, station, or note…"
            showing={jaguarFiltered.length}
            total={items.length}
          >
            <AdminAccountFilter value={uploader} onChange={setUploader} label="All uploaders" />
            <FilterSelect
              label="All stations"
              value={station}
              onChange={setStation}
              options={uniqueSorted(items.map((r) => r.station_code || ""))}
            />
            <FilterSelect
              label="All grades"
              value={grade}
              onChange={setGrade}
              options={uniqueSorted(items.map((r) => r.grade))}
            />
          </FilterBar>

          <div className="space-y-3">
            {jaguarFiltered.map((row) => {
              const thumb = row.media.find((m) => m.is_best_frame) || row.media[0];
              const top = row.candidates[0];
              return (
                <Link
                  key={row.id}
                  href={`/observations/${row.id}`}
                  className="surface flex gap-3 overflow-hidden p-3 transition hover:bg-canvas/70 sm:gap-4 sm:p-4"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-ink/5 sm:h-24 sm:w-28">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaSrc(thumb.url)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] text-ink/35">No photo</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <GradeBadge grade={row.grade} />
                      {row.review_state && <ReviewStateBadge state={row.review_state} />}
                    </div>
                    <p className="mt-2 text-[0.95rem] font-medium">
                      {row.suggested_name || top?.display_name || "No suggested match"}
                      {top && (
                        <span className="ml-2 font-mono text-[12.5px] text-ink/45">
                          {(top.score * 100).toFixed(0)}%
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-[12.5px] text-ink/50">
                      {row.station_code || "Unknown station"}
                      {row.captured_at ? ` · ${new Date(row.captured_at).toLocaleString()}` : ""}
                      {row.uploader_name ? ` · ${row.uploader_name}` : ""}
                    </p>
                    {row.candidates.length > 1 && (
                      <p className="mt-1 text-[12px] text-ink/40">
                        {row.candidates.length} candidates — open to confirm or reject
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
            {jaguarFiltered.length === 0 && (
              <div className="surface px-6 py-10 text-center text-[13.5px] text-ink/45">
                {items.length === 0
                  ? "Nothing waiting for an identity decision."
                  : "No photos match these filters."}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "names" && (
        <>
          <FilterBar
            query={query}
            onQuery={setQuery}
            placeholder="Filter names…"
            showing={nameFiltered.length}
            total={claims.length}
          >
            <AdminNameFilter value={proposer} onChange={setProposer} label="All proposers" />
            <FilterSelect
              label="All statuses"
              value={status}
              onChange={setStatus}
              options={uniqueSorted(claims.map((c) => c.status))}
            />
          </FilterBar>
          <div className="space-y-3">
            {nameFiltered.map((c) => (
              <div key={c.id} className="surface flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <p>
                  “{c.proposed_name}” for{" "}
                  <Link href={`/individuals/${c.individual_code}`} className="font-semibold text-gold-deep">
                    {c.individual_code}
                  </Link>{" "}
                  · by {c.proposer_name}
                  {c.status !== "pending" && <span className="ml-2 text-sm text-ink/40">{c.status}</span>}
                </p>
                {isAdmin(user?.role) && c.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-teal px-4 py-1 text-sm text-white"
                      onClick={() => decide(c.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="rounded-full border px-4 py-1 text-sm"
                      onClick={() => decide(c.id, false)}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-ink/40">
                    {c.status === "pending" ? "Awaiting admin" : c.status}
                  </span>
                )}
              </div>
            ))}
            {nameFiltered.length === 0 && (
              <div className="surface px-6 py-10 text-center text-[13.5px] text-ink/45">
                {claims.length === 0 ? "No naming claims waiting." : "No claims match these filters."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
