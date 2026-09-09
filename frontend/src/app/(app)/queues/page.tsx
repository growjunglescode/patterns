"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type NamingClaim, type User } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { AdminNameFilter } from "@/components/AdminFilters";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { useProjectId } from "@/lib/useProjectId";

export default function QueuesPage() {
  const [claims, setClaims] = useState<NamingClaim[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [proposer, setProposer] = useState("");
  const projectId = useProjectId();

  function load() {
    api.claims(projectId).then(setClaims).catch((e) => setError(e.message));
    api.me().then(setUser).catch(() => undefined);
  }

  useEffect(load, [projectId]);

  async function decide(id: string, approve: boolean) {
    setError("");
    try {
      await api.decideClaim(id, approve);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not allowed");
    }
  }

  const filtered = useMemo(
    () =>
      claims.filter(
        (c) =>
          (!status || c.status === status) &&
          (!proposer || c.proposer_name === proposer) &&
          matchesQuery(c, query),
      ),
    [claims, query, status, proposer],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="page-kicker">Command centre</p>
        <h1 className="page-title">Name approvals</h1>
        <p className="text-ink/60">Researchers propose. Admins approve. On approve the name is canonical app-wide.</p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <FilterBar query={query} onQuery={setQuery} placeholder="Filter names…" showing={filtered.length} total={claims.length}>
        <AdminNameFilter value={proposer} onChange={setProposer} label="All proposers" />
        <FilterSelect label="All statuses" value={status} onChange={setStatus} options={uniqueSorted(claims.map((c) => c.status))} />
      </FilterBar>
      <div className="space-y-3">
        {filtered.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 shadow-card">
            <p>
              “{c.proposed_name}” for {c.individual_code} · by {c.proposer_name}
              {c.status !== "pending" && <span className="ml-2 text-sm text-ink/40">{c.status}</span>}
            </p>
            {isAdmin(user?.role) && c.status === "pending" ? (
              <div className="flex gap-2">
                <button className="rounded-full bg-teal px-4 py-1 text-sm text-white" onClick={() => decide(c.id, true)}>
                  Approve
                </button>
                <button className="rounded-full border px-4 py-1 text-sm" onClick={() => decide(c.id, false)}>
                  Reject
                </button>
              </div>
            ) : (
              <span className="text-sm text-ink/40">{c.status === "pending" ? "Awaiting admin" : c.status}</span>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-ink/40">{claims.length === 0 ? "Queue is clear." : "No claims match."}</p>}
      </div>
    </div>
  );
}
