"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { when } from "../ui";
import { useAdminScope } from "../scope";

export default function AdminNamesPage() {
  const { projectId } = useAdminScope();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("pending");

  function load() {
    api
      .claims(projectId || undefined, status || "all")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load naming claims"));
  }

  useEffect(load, [projectId, status]);

  const filtered = rows;

  async function decide(id: string, approve: boolean) {
    const label = approve ? "Approve this name?" : "Reject this name proposal?";
    if (!window.confirm(label)) return;
    setBusyId(id);
    setError("");
    try {
      const updated = await api.decideClaim(id, approve);
      setRows((list) =>
        list
          .map((row) => (row.id === id ? { ...row, ...updated } : row))
          .filter((row) => !status || row.status === status),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decide claim");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[0.9375rem] text-[var(--muted)]">
        Approve or reject proposed individual names. Decisions are audited and update the catalog immediately.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[12rem]">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
        <p className="text-[12.5px] text-[var(--muted)]">
          {filtered.length} claim{filtered.length === 1 ? "" : "s"}
          {projectId ? " in scoped workspace" : ""}
        </p>
      </div>
      {error && <p className="text-sm text-[var(--signal-warn)]">{error}</p>}
      <div className="surface overflow-hidden">
        <div className="table-scroll">
          <table className="w-full min-w-[52rem] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="px-4 py-2">Proposed</th>
                <th className="px-3 py-2">Individual</th>
                <th className="px-3 py-2">Proposer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Opened</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 font-medium">{row.proposed_name}</td>
                  <td className="px-3 py-3">
                    {row.individual_code ? (
                      <Link href={`/individuals/${row.individual_code}`} className="font-mono text-[var(--gold)]">
                        {row.individual_code}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3">{row.proposer_name || "—"}</td>
                  <td className="px-3 py-3 capitalize">{row.status}</td>
                  <td className="px-3 py-3 text-[var(--muted)]">{when(row.created_at)}</td>
                  <td className="px-3 py-3">
                    {row.status === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => decide(row.id, true)}
                          className="rounded-md bg-[var(--gold)] px-2.5 py-1 text-[12px] font-semibold text-[#070a09]"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => decide(row.id, false)}
                          className="rounded-md border border-[var(--line)] px-2.5 py-1 text-[12px] font-semibold"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">Decided</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-[var(--muted)]">
                    No naming claims in this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
