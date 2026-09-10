"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { when } from "../ui";

export default function AdminRecognitionPage() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"export" | "train" | "activate" | null>(null);
  const [note, setNote] = useState("");

  async function reload(p = page) {
    const next = await api.adminRecognition(p);
    setData(next);
    return next;
  }

  useEffect(() => {
    reload(page).catch((e) => setError(e instanceof Error ? e.message : "Could not load recognition"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function onExport() {
    setBusy("export");
    setError("");
    setNote("");
    try {
      const result = await api.adminRecognitionExport();
      setNote(
        `Exported ${result.written} crops` +
          (result.hard_negatives ? ` · ${result.hard_negatives} hard negatives` : "") +
          ` → ${result.out_dir}`,
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function onTrain(force = false) {
    setBusy("train");
    setError("");
    setNote(force ? "Force training… this can take several minutes." : "Training… this can take several minutes.");
    try {
      const result = await api.adminRecognitionTrain({ force, epochs: 12, activate: true, backfill: true });
      setNote(
        `Trained ${result.model_version}: ${result.individuals} individuals · ${result.photos} photos · loss ${
          result.final_loss != null ? Number(result.final_loss).toFixed(3) : "—"
        }` + (result.activate ? " · activated" : ""),
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed");
      setNote("");
    } finally {
      setBusy(null);
    }
  }

  async function onActivate() {
    setBusy("activate");
    setError("");
    try {
      const result = await api.adminRecognitionActivate();
      setNote(`Activated ${result.active?.coat_model_path || "checkpoint"}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activate failed");
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading recognition ledger…</p>;

  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  const accuracy = data.scored ? Math.round((data.correct / data.scored) * 100) : null;
  const training = data.training || {};
  const pipeline = data.pipeline || {};
  const ready = Boolean(training.ready_for_train);
  const hasCheckpoint = Boolean(pipeline.checkpoint_exists);

  return (
    <div className="space-y-5">
      <section className="surface overflow-hidden">
        <div className="border-b border-[var(--line)] bg-[var(--forest)] px-5 py-4 text-[var(--canvas)]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--gold)]">Control room · ML</p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl tracking-tight">Train coat model</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-white/65">
            Jaguar re-ID (<em className="text-white/80">Panthera onca</em>). Uses only human-confirmed photos plus
            hard negatives from disagreed reviews. Training is estate-wide; the admin scope chip does not limit this
            ledger. The model proposes — people decide.
          </p>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-3">
                <p className="kpi-value text-[1.35rem]">{training.trusted_photos ?? 0}</p>
                <p className="kpi-label">Confirmed photos</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-3">
                <p className="kpi-value text-[1.35rem]">{training.individuals_with_multi_photo ?? 0}</p>
                <p className="kpi-label">Multi-photo IDs</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-3">
                <p className={`text-[1.05rem] font-semibold ${ready ? "text-[var(--signal-ok)]" : "text-[var(--signal-review)]"}`}>
                  {ready ? "Ready" : "Not ready"}
                </p>
                <p className="kpi-label">Train status</p>
              </div>
            </div>
            <p className="text-[13px] text-[var(--muted)]">
              {training.reason || "Confirm jaguar identities in review to grow the training set."}
            </p>
            {error && <p className="text-sm text-[var(--signal-warn)]">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(busy) || !ready}
                onClick={() => onTrain(false)}
                className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "train" ? "Training…" : "Train model"}
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={onExport}
                className="rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--ink)] disabled:opacity-40"
              >
                {busy === "export" ? "Exporting…" : "Export training set"}
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || !hasCheckpoint}
                onClick={onActivate}
                className="rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--ink)] disabled:opacity-40"
              >
                {busy === "activate" ? "Activating…" : "Activate checkpoint"}
              </button>
              {!ready && (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => onTrain(true)}
                  className="rounded-full px-3 py-2 text-[12px] font-semibold text-[var(--signal-warn)] disabled:opacity-40"
                  title="Runs even when readiness thresholds are not met"
                >
                  Force train
                </button>
              )}
              <Link href="/model" className="px-2 text-[13px] font-semibold text-[var(--gold-deep)]">
                Model report →
              </Link>
            </div>
            {note && <p className="rounded-lg bg-[var(--forest)]/5 px-3 py-2 font-mono text-[12px] text-[var(--ink)]">{note}</p>}
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 text-[13px]">
            <p className="font-semibold">Active engine</p>
            <p className="mt-1 text-[var(--muted)]">
              {data.engine?.name || "—"} · <span className="font-mono">{data.engine?.model_version || "—"}</span>
            </p>
            <p className="mt-3 text-[12px] uppercase tracking-wider text-[var(--muted)]">Setting</p>
            <p className="font-mono text-[12.5px]">{data.engine?.recognition_engine_setting || "auto"}</p>
            <p className="mt-3 text-[12px] uppercase tracking-wider text-[var(--muted)]">Checkpoint</p>
            <p className="break-all font-mono text-[12px] text-[var(--muted)]">
              {pipeline.checkpoint_path || data.engine?.coat_model_path || "none yet"}
            </p>
            {pipeline.active?.activated_at && (
              <p className="mt-2 text-[12px] text-[var(--muted)]">
                Activated {when(pipeline.active.activated_at)}
                {pipeline.active.activated_by ? ` · ${pipeline.active.activated_by}` : ""}
              </p>
            )}
            <ol className="mt-4 list-decimal space-y-1 pl-4 text-[12.5px] text-[var(--muted)]">
              <li>Humans confirm identities</li>
              <li>Export confirmed coat crops + hard negatives</li>
              <li>Train projection head (triplet + semi-hard negatives)</li>
              <li>Activate trained engine + rebuild gallery</li>
            </ol>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="surface px-4 py-4">
          <p className="kpi-value">{data.total}</p>
          <p className="kpi-label">Decisions logged</p>
        </div>
        <div className="surface px-4 py-4">
          <p className="kpi-value">{data.scored}</p>
          <p className="kpi-label">Scored against humans</p>
        </div>
        <div className="surface px-4 py-4">
          <p className="kpi-value">{accuracy == null ? "—" : `${accuracy}%`}</p>
          <p className="kpi-label">Agreement when scored</p>
        </div>
        <div className="surface px-4 py-4">
          <p className="kpi-value">{data.incorrect}</p>
          <p className="kpi-label">Disagreements</p>
        </div>
      </div>
      <div className="surface overflow-hidden">
        <div className="table-scroll">
          <table className="w-full min-w-[52rem] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="px-4 py-2">When</th>
                <th className="px-3 py-2">Engine</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Suggested</th>
                <th className="px-3 py-2">Confirmed</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any) => (
                <tr key={row.id} className="border-t border-[var(--line)]">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-[var(--muted)]">
                    {when(row.created_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.engine}
                    <p className="font-mono text-[11px] text-[var(--muted)]">{row.model_version}</p>
                  </td>
                  <td className="px-3 py-2.5">{row.review_state?.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2.5">{row.suggested_code || "—"}</td>
                  <td className="px-3 py-2.5">{row.confirmed_code || "—"}</td>
                  <td className="px-3 py-2.5 font-mono">
                    {row.similarity_score != null ? `${(row.similarity_score * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.was_correct == null ? "Unscored" : row.was_correct ? "Agreed" : "Disagreed"}
                  </td>
                  <td className="px-3 py-2.5">{row.actor_name || "—"}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-[var(--muted)]">
                    No match reviews yet. Confirmations and rejections write into this ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between text-[13px] text-[var(--muted)]">
        <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <Link href="/model" className="text-[var(--gold)]">
          Open model report
        </Link>
        <button type="button" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
