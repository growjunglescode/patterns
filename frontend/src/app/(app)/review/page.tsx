"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminAccountFilter } from "@/components/AdminFilters";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { GradeBadge, ReviewStateBadge } from "@/components/GradeBadge";
import { api, mediaSrc, reviewStateLabel, type Detection } from "@/lib/api";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { useProjectId } from "@/lib/useProjectId";

export default function ReviewPage() {
  const [items, setItems] = useState<Detection[]>([]);
  const [query, setQuery] = useState("");
  const [station, setStation] = useState("");
  const [uploader, setUploader] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState("");
  const projectId = useProjectId();

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
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load review queue"));
  }, [uploader, projectId]);

  const filtered = useMemo(
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

  if (error) return <p>{error}</p>;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="page-kicker">Collect</p>
        <h1 className="page-title mt-1">Review</h1>
        <p className="lede">
          Photos waiting for an identity decision — confirm a suggested match, reject it, or register a new
          individual. Naming approvals live separately in the Name queue.
        </p>
      </div>

      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Filter by name, station, or note…"
        showing={filtered.length}
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
        {filtered.map((row) => {
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
        {filtered.length === 0 && (
          <div className="surface px-6 py-10 text-center text-[13.5px] text-ink/45">
            {items.length === 0
              ? "Nothing waiting for an identity decision."
              : "No photos match these filters."}
          </div>
        )}
      </div>
    </div>
  );
}
