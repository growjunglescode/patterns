"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { when } from "../ui";

export default function AdminAuditPage() {
  const [data, setData] = useState<any>(null);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .adminAudit({ action: action || undefined, entity: entity || undefined, q: query || undefined, page, page_size: 40 })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load audit trail"));
  }, [action, entity, query, page]);

  if (error && !data) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading audit trail…</p>;

  const pages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="space-y-4">
      <p className="text-[0.9375rem] text-[var(--muted)]">
        Immutable operational history: uploads, identity confirmations, name decisions, merges, and admin edits.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
        <input
          value={query}
          onChange={(e) => {
            setPage(1);
            setQuery(e.target.value);
          }}
          placeholder="Search action, entity, or detail…"
        />
        <select
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
        >
          <option value="">All actions</option>
          {data.actions.map((item: string) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={entity}
          onChange={(e) => {
            setPage(1);
            setEntity(e.target.value);
          }}
        >
          <option value="">All entities</option>
          {data.entities.map((item: string) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="surface overflow-hidden">
        <div className="table-scroll">
          <table className="w-full min-w-[52rem] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="px-4 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Record</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any) => (
                <tr key={row.id} className="border-t border-[var(--line)] align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-[var(--muted)]">
                    {when(row.created_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.actor_name || "System"}
                    {row.actor_email && <p className="text-[11px] text-[var(--muted)]">{row.actor_email}</p>}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{row.action.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2.5">{row.entity}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--muted)]">{row.entity_id}</td>
                  <td className="max-w-sm break-words px-3 py-2.5 text-[var(--muted)]">{row.detail || "—"}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-[var(--muted)]">
                    No events match these filters.
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
          {data.total} events · page {page} of {pages}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
