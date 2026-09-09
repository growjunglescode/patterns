"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { GradeBadge } from "@/components/GradeBadge";
import { when } from "../ui";

const TABS = [
  { id: "detections", label: "Detections" },
  { id: "individuals", label: "Individuals" },
  { id: "claims", label: "Name claims" },
] as const;

export default function AdminCatalogPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("detections");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api
        .adminCatalog({ q: query || undefined })
        .then(setData)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load catalog"));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (error && !data) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading catalog…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${
                tab === item.id ? "bg-[#c4a35a] text-[#070a09]" : "text-[var(--muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter across IDs, species, stations, people…" />
      </div>

      {tab === "detections" && (
        <div className="surface overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[64rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="px-4 py-2">Logged</th>
                  <th className="px-3 py-2">Species</th>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Review</th>
                  <th className="px-3 py-2">Identity</th>
                  <th className="px-3 py-2">Station</th>
                  <th className="px-3 py-2">Observer</th>
                  <th className="px-3 py-2">Method</th>
                </tr>
              </thead>
              <tbody>
                {data.detections.map((row: any) => (
                  <tr key={row.id} className="border-t border-[var(--line)]">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-[var(--muted)]">
                      {when(row.captured_at || row.created_at)}
                    </td>
                    <td className="px-3 py-2.5 capitalize">
                      <Link href={`/observations/${row.id}`} className="font-medium">
                        {row.species}
                      </Link>
                      <span className="ml-2 text-[11px] text-[var(--muted)]">{row.side}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <GradeBadge grade={row.grade} />
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">{row.review_state?.replaceAll("_", " ") || "—"}</td>
                    <td className="px-3 py-2.5">
                      {row.individual_code ? (
                        <Link href={`/individuals/${row.individual_code}`}>{row.individual_name || row.individual_code}</Link>
                      ) : (
                        row.suggested_code || "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.station_code || "—"}
                      <p className="text-[11px] text-[var(--muted)]">{row.project_name}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {row.uploader_name || "—"}
                      {row.reviewer_name && <p className="text-[11px] text-[var(--muted)]">Confirmed {row.reviewer_name}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--muted)]">
                      {row.engine || "—"}
                      {row.match_score != null ? ` · ${(row.match_score * 100).toFixed(0)}%` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "individuals" && (
        <div className="surface overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[44rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Species</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Public</th>
                </tr>
              </thead>
              <tbody>
                {data.individuals.map((row: any) => (
                  <tr key={row.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-2.5 font-mono">
                      <Link href={`/individuals/${row.code}`}>{row.code}</Link>
                    </td>
                    <td className="px-3 py-2.5">{row.name || "—"}</td>
                    <td className="px-3 py-2.5 capitalize">{row.species}</td>
                    <td className="px-3 py-2.5">
                      {row.identity_status} · {row.life_status}
                    </td>
                    <td className="px-3 py-2.5">{row.project_name}</td>
                    <td className="px-3 py-2.5">{row.share_public ? "Shared" : "Private"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "claims" && (
        <div className="surface overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[44rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="px-4 py-2">Proposed</th>
                  <th className="px-3 py-2">Individual</th>
                  <th className="px-3 py-2">Proposer</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Opened</th>
                </tr>
              </thead>
              <tbody>
                {data.claims.map((row: any) => (
                  <tr key={row.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-2.5 font-medium">{row.proposed_name}</td>
                    <td className="px-3 py-2.5">
                      {row.individual_code ? (
                        <Link href={`/individuals/${row.individual_code}`}>{row.individual_code}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">{row.proposer_name}</td>
                    <td className="px-3 py-2.5 capitalize">{row.status}</td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">{when(row.created_at)}</td>
                  </tr>
                ))}
                {data.claims.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-[var(--muted)]">
                      No naming claims yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
