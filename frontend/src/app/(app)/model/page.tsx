"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { api, mediaSrc } from "@/lib/api";
import { matchesQuery } from "@/lib/filter";
import { useProjectId } from "@/lib/useProjectId";

export default function ModelReportPage() {
  const [summary, setSummary] = useState<any>(null);
  const [distribution, setDistribution] = useState<any>(null);
  const [decisions, setDecisions] = useState<any>(null);
  const [engine, setEngine] = useState("");
  const [outcome, setOutcome] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const projectId = useProjectId();

  useEffect(() => {
    const params: { engine?: string; project_id?: string } = {};
    if (engine) params.engine = engine;
    if (projectId) params.project_id = projectId;
    Promise.all([api.modelSummary(params), api.modelScoreDistribution(params)])
      .then(([s, d]) => {
        setSummary(s);
        setDistribution(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load model report"));
  }, [engine, projectId]);

  useEffect(() => {
    const params: {
      engine?: string;
      outcome?: string;
      page: number;
      page_size: number;
      project_id?: string;
    } = {
      page,
      page_size: 25,
    };
    if (engine) params.engine = engine;
    if (outcome) params.outcome = outcome;
    if (projectId) params.project_id = projectId;
    api
      .modelDecisions(params)
      .then(setDecisions)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load decisions"));
  }, [engine, outcome, page, projectId]);

  const filteredDecisions = useMemo(() => {
    const items = decisions?.items || [];
    return items.filter((row: any) =>
      matchesQuery(
        {
          suggested: row.suggested_name,
          confirmed: row.confirmed_name,
          station: row.station_code,
          engine: row.engine_label,
          actor: row.decided_by,
        },
        query,
      ),
    );
  }, [decisions, query]);

  if (error) return <p>{error}</p>;
  if (!summary) return <p className="text-ink/40">Loading model report…</p>;

  const overall = summary.overall || {};
  const decided = overall.decided ?? 0;
  const showAccuracy = overall.accuracy_percent != null;
  const engines: any[] = summary.by_engine || [];
  const buckets: any[] = distribution?.buckets || [];
  const peakBucket = Math.max(1, ...buckets.map((b: any) => b.evaluated || 0));
  const readingSentences: string[] = distribution?.reading?.sentences || [];
  const top1 = overall.top1 || {};
  const top5 = overall.top5 || {};

  return (
    <div className="space-y-10">
      <div className="max-w-2xl">
        <p className="page-kicker">Institution</p>
        <h1 className="page-title mt-1">Model report</h1>
        <p className="lede">
          How often the recognition engines agree with human reviewers. This is agreement with people, not
          absolute ground truth.
        </p>
      </div>

      {summary.notes?.empty_state && (
        <div className="surface border border-gold/30 bg-gold/[0.07] px-6 py-5 text-[13.5px] text-ink/70">
          {summary.notes.empty_state}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="All engines"
          value={engine}
          onChange={(v) => {
            setEngine(v);
            setPage(1);
          }}
          options={summary.available?.engines || []}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <div className="surface px-5 py-5">
          <p className={`kpi-value ${!showAccuracy ? "!text-[1.15rem] !text-ink/45" : ""}`}>
            {showAccuracy ? `${overall.accuracy_percent}%` : "Not yet"}
          </p>
          <p className="kpi-label">Headline accuracy</p>
          <p className="mt-2 text-[12.5px] text-gold-deep">
            {showAccuracy
              ? `${overall.accepted} correct of ${decided} decided`
              : `${decided} decided · need ${summary.minimum_reviews_for_accuracy} for a %`}
          </p>
        </div>
        <div className="surface px-5 py-5">
          <p className="kpi-value">{overall.total_reviews ?? 0}</p>
          <p className="kpi-label">Reviews recorded</p>
          <p className="mt-2 text-[12.5px] text-gold-deep">
            {overall.accepted ?? 0} accepted · {overall.rejected ?? 0} rejected
          </p>
        </div>
        <div className="surface px-5 py-5">
          <p className="kpi-value">{top1.percent != null ? `${top1.percent}%` : "—"}</p>
          <p className="kpi-label">Top-1 hit rate</p>
          <p className="mt-2 text-[12.5px] text-gold-deep">
            {top1.hits ?? 0} of {top1.evaluated ?? 0} scored photos
          </p>
        </div>
        <div className="surface px-5 py-5">
          <p className="kpi-value">{top5.percent != null ? `${top5.percent}%` : "—"}</p>
          <p className="kpi-label">Top-5 hit rate</p>
          <p className="mt-2 text-[12.5px] text-gold-deep">
            {top5.hits ?? 0} of {top5.evaluated ?? 0} where the list was usable
          </p>
        </div>
      </div>
      <p className="-mt-6 max-w-3xl text-[12.5px] text-ink/45">{summary.notes?.accuracy_basis}</p>
      {!showAccuracy && (
        <p className="-mt-4 max-w-3xl text-[12.5px] text-ink/45">{summary.notes?.small_sample}</p>
      )}

      <section>
        <h2 className="section-title mb-3">Engine comparison</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {engines.length === 0 && (
            <div className="surface px-6 py-8 text-[13px] text-ink/45">No engine has recorded a decision yet.</div>
          )}
          {engines.map((row: any) => (
            <div key={row.engine} className="surface px-6 py-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[0.95rem] font-semibold">{row.engine_label || row.engine}</h3>
                <span className="font-mono text-[12.5px] text-ink/50">
                  {row.accuracy_percent != null ? `${row.accuracy_percent}%` : "counts only"}
                </span>
              </div>
              <p className="mt-2 text-[13px] text-ink/60">
                {row.accepted ?? 0} correct · {row.rejected ?? 0} incorrect · {row.decided ?? 0} decided
              </p>
              <p className="mt-1 text-[12.5px] text-ink/40">
                {(row.model_versions || []).join(", ") || "version unknown"}
              </p>
            </div>
          ))}
        </div>
        {summary.engine_comparison_note && (
          <p className="mt-3 text-[12.5px] text-ink/45">{summary.engine_comparison_note}</p>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3">Score vs accuracy</h2>
        <div className="surface px-6 py-5">
          {buckets.length === 0 ? (
            <p className="text-[13px] text-ink/45">{distribution?.notes?.empty_state || "No scored decisions yet."}</p>
          ) : (
            <>
              <div className="flex h-36 items-end gap-1.5">
                {buckets.map((b: any) => (
                  <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-forest/75"
                      style={{ height: `${Math.max(4, (100 * (b.evaluated || 0)) / peakBucket)}%` }}
                      title={`${b.label}: ${b.evaluated} decisions${b.accuracy_percent != null ? `, ${b.accuracy_percent}% correct` : ""}`}
                    />
                    <span className="font-mono text-[10px] text-ink/40">{b.label}</span>
                  </div>
                ))}
              </div>
              {readingSentences.length > 0 && (
                <ul className="mt-4 space-y-2 text-[13px] text-ink/65">
                  {readingSentences.map((sentence) => (
                    <li key={sentence.slice(0, 40)}>{sentence}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[12.5px] text-ink/45">
                Suggest threshold {summary.thresholds?.suggest} · Confirm threshold {summary.thresholds?.confirm}.{" "}
                {summary.thresholds?.note}
              </p>
            </>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="section-title">Decision log</h2>
          <FilterSelect
            label="All outcomes"
            value={outcome}
            onChange={(v) => {
              setOutcome(v);
              setPage(1);
            }}
            options={["correct", "incorrect", "undecided"]}
          />
        </div>
        <FilterBar
          query={query}
          onQuery={setQuery}
          placeholder="Filter decisions…"
          showing={filteredDecisions.length}
          total={decisions?.items?.length || 0}
        />
        <div className="mt-3 divide-y divide-ink/[0.06] overflow-hidden rounded-2xl bg-white shadow-card">
          {filteredDecisions.map((row: any) => (
            <div key={row.id} className="flex gap-4 px-5 py-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink/5">
                {row.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(row.photo_url)} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="rounded-full bg-canvas px-2 py-0.5 font-medium">{row.review_state_label}</span>
                  <span className="text-ink/45">{row.engine_label}</span>
                  {row.similarity_score != null && (
                    <span className="font-mono text-ink/45">{(row.similarity_score * 100).toFixed(0)}%</span>
                  )}
                  {row.was_correct === true && <span className="text-teal">Correct</span>}
                  {row.was_correct === false && <span className="text-[#7a2e22]">Incorrect</span>}
                </div>
                <p className="mt-1 text-[0.95rem]">
                  Suggested {row.suggested_name || "—"}
                  {row.confirmed_name ? ` · decided as ${row.confirmed_name}` : ""}
                </p>
                <p className="mt-1 text-[12.5px] text-ink/45">
                  {row.station_code || "Unknown station"}
                  {row.created_at ? ` · ${new Date(row.created_at).toLocaleString()}` : ""}
                  {row.decided_by ? ` · ${row.decided_by}` : ""}
                  {row.detection_exists && (
                    <>
                      {" · "}
                      <Link href={`/observations/${row.detection_id}`} className="text-gold-deep hover:underline">
                        Open observation
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>
          ))}
          {filteredDecisions.length === 0 && (
            <p className="px-5 py-8 text-ink/40">{decisions?.notes?.empty_state || "No decisions match."}</p>
          )}
        </div>
        {(decisions?.pages || 0) > 1 && (
          <div className="mt-3 flex items-center justify-between text-[13px]">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full border border-ink/15 bg-white px-4 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-ink/45">
              Page {decisions.page} of {decisions.pages}
            </span>
            <button
              type="button"
              disabled={!decisions.has_more}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-ink/15 bg-white px-4 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>

      {summary.context?.note && <p className="text-[12.5px] text-ink/45">{summary.context.note}</p>}
    </div>
  );
}
