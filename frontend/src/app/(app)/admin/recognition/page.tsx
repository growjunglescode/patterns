"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { when } from "../ui";

export default function AdminRecognitionPage() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminRecognition(page).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load recognition"));
  }, [page]);

  if (error) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading recognition ledger…</p>;

  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  const accuracy = data.scored ? Math.round((data.correct / data.scored) * 100) : null;

  return (
    <div className="space-y-5">
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
