"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Stat, when } from "./ui";

export default function AdminCommandPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminOverview().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load control room"));
  }, []);

  if (error) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Assembling system picture…</p>;

  const q = data.queues;
  const t = data.totals;
  const open =
    q.pending_names +
    q.needs_identification +
    q.awaiting_second_review +
    q.unverified_scientists +
    q.incomplete_onboarding;

  return (
    <div className="space-y-8">
      <section>
        <p className="section-title mb-3">Operational load</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Open work" value={open} note="Queues that still need a human" tone={open ? "warn" : "ok"} />
          <Stat label="Needs identification" value={q.needs_identification} href="/admin/catalog" />
          <Stat label="Names pending" value={q.pending_names} href="/admin/catalog" />
          <Stat label="Second review" value={q.awaiting_second_review} href="/admin/catalog" />
          <Stat label="Unverified scientists" value={q.unverified_scientists} href="/admin/people" />
        </div>
      </section>

      <section>
        <p className="section-title mb-3">Estate</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="People" value={t.users} href="/admin/people" />
          <Stat label="Organizations" value={t.organizations} href="/admin/estate" />
          <Stat label="Projects" value={`${t.active_projects}/${t.projects}`} note="Active / total" href="/admin/estate" />
          <Stat label="Stations" value={t.stations} href="/admin/estate" />
          <Stat label="Individuals" value={t.individuals} href="/admin/catalog" />
          <Stat label="Detections" value={t.detections} href="/admin/catalog" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="section-title mb-0">Identity mix</p>
            <p className="font-mono text-[11px] text-[var(--muted)]">Generated {when(data.generated_at)}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <Breakdown title="Roles" rows={data.roles} />
            <Breakdown title="Affiliations" rows={data.affiliations} />
            <Breakdown title="Identity status" rows={data.identity} />
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Breakdown title="Detection grades" rows={data.grades} />
            <Breakdown title="Review states" rows={data.review_states} />
          </div>
        </section>

        <section className="surface p-5">
          <p className="section-title">Attention</p>
          <dl className="mt-4 space-y-4 text-[13px]">
            <Row
              label="Oldest unnamed wait"
              value={
                data.attention.oldest_pending_name
                  ? `${data.attention.oldest_pending_name.proposed_name} · ${when(data.attention.oldest_pending_name.created_at)}`
                  : "Clear"
              }
            />
            <Row
              label="Oldest needs-ID photo"
              value={
                data.attention.oldest_needs_id
                  ? `${data.attention.oldest_needs_id.species} · ${when(data.attention.oldest_needs_id.created_at)}`
                  : "Clear"
              }
            />
            <Row label="Incomplete profiles" value={String(q.incomplete_onboarding)} />
            <Row label="Public individuals" value={String(q.public_individuals)} />
            <Row label="Media files" value={String(t.media)} />
            <Row label="Coat embeddings" value={String(t.coat_embeddings)} />
            <Row label="Match reviews" value={String(t.match_reviews)} />
            <Row label="Audit events" value={String(t.audit_events)} />
          </dl>
        </section>
      </div>

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <p className="section-title mb-0">Recent audit</p>
          <Link href="/admin/audit" className="text-[13px] font-semibold text-[var(--gold)]">
            Open full trail
          </Link>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[40rem] text-left text-[13px]">
            <thead>
              <tr className="border-y border-[var(--line)]">
                <th className="px-5 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_audit.map((row: any) => (
                <tr key={row.id} className="border-t border-[var(--line)]">
                  <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[12px] text-[var(--muted)]">
                    {when(row.created_at)}
                  </td>
                  <td className="px-3 py-2.5">{row.actor_name || "System"}</td>
                  <td className="px-3 py-2.5 font-medium">{row.action.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2.5 text-[var(--muted)]">{row.entity}</td>
                  <td className="max-w-xs truncate px-3 py-2.5 text-[var(--muted)]">{row.detail || "—"}</td>
                </tr>
              ))}
              {data.recent_audit.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-[var(--muted)]">
                    No administrative events yet. Uploads, reviews, and name decisions will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows || {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{title}</p>
      <ul className="mt-3 space-y-2">
        {entries.length === 0 && <li className="text-[13px] text-[var(--muted)]">None yet</li>}
        {entries.map(([key, n]) => (
          <li key={key}>
            <div className="mb-1 flex justify-between text-[12.5px]">
              <span className="capitalize">{key.replaceAll("_", " ")}</span>
              <span className="font-mono text-[var(--muted)]">{n}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[#18211d]">
              <div className="h-full bg-[#c4a35a]" style={{ width: `${Math.max(6, (n / total) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
