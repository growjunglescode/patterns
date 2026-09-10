"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Stat, when } from "./ui";
import { useAdminScope } from "./scope";

export default function AdminCommandPage() {
  const { projectId } = useAdminScope();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminOverview().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load control room"));
  }, []);

  if (error) return <p className="text-[var(--signal-warn)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Assembling system picture…</p>;

  const q = data.queues;
  const t = data.totals;
  const h = data.health || {};
  const catalogQs = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };
  const open =
    q.pending_names +
    q.needs_identification +
    q.awaiting_second_review +
    q.unverified_scientists +
    q.incomplete_onboarding;

  return (
    <div className="space-y-8">
      <section className="surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="section-title mb-0">Recognition health</p>
          <Link href="/admin/recognition" className="text-[13px] font-semibold text-[var(--gold)]">
            Open recognition
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthCell label="Engine" value={h.engine_name || "—"} note={h.recognition_engine_setting} />
          <HealthCell label="Model version" value={h.model_version || "—"} note={h.activated_at ? `Activated ${when(h.activated_at)}` : undefined} />
          <HealthCell
            label="Checkpoint"
            value={h.checkpoint_exists ? "Present" : "Missing"}
            note={h.coat_model_path || undefined}
            tone={h.checkpoint_exists ? "ok" : "warn"}
          />
          <HealthCell
            label="Train ready"
            value={h.ready_for_train ? "Yes" : "Not yet"}
            note={h.training_reason || `${h.media_files ?? t.media} media files`}
            tone={h.ready_for_train ? "ok" : "warn"}
          />
        </div>
        {h.error && <p className="mt-3 text-[12.5px] text-[var(--signal-warn)]">{h.error}</p>}
      </section>

      <section>
        <p className="section-title mb-3">Operational load</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Open work" value={open} note="Queues that still need a human" tone={open ? "warn" : "ok"} />
          <Stat label="Needs identification" value={q.needs_identification} href={`/admin/catalog${catalogQs({ grade: "needs_id" })}`} />
          <Stat label="Names pending" value={q.pending_names} href={`/admin/names${catalogQs()}`} />
          <Stat label="Second review" value={q.awaiting_second_review} href={`/admin/catalog${catalogQs({ review_state: "awaiting_second_review" })}`} />
          <Stat label="Unverified scientists" value={q.unverified_scientists} href="/admin/people?verified=0&role=scientist" />
        </div>
      </section>

      <section>
        <p className="section-title mb-3">Estate</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="People" value={t.users} href="/admin/people" />
          <Stat label="Organizations" value={t.organizations} href="/admin/workspaces" />
          <Stat label="Workspaces" value={`${t.active_projects}/${t.projects}`} note="Active / total" href="/admin/workspaces" />
          <Stat label="Stations" value={t.stations} href="/admin/workspaces" />
          <Stat label="Individuals" value={t.individuals} href={`/admin/catalog${catalogQs({ tab: "individuals" })}`} />
          <Stat label="Detections" value={t.detections} href={`/admin/catalog${catalogQs()}`} />
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
              href={data.attention.oldest_pending_name ? "/admin/names" : undefined}
            />
            <Row
              label="Oldest needs-ID photo"
              value={
                data.attention.oldest_needs_id
                  ? `${data.attention.oldest_needs_id.species} · ${when(data.attention.oldest_needs_id.created_at)}`
                  : "Clear"
              }
              href={data.attention.oldest_needs_id ? `/observations/${data.attention.oldest_needs_id.id}` : undefined}
            />
            <Row label="Incomplete profiles" value={String(q.incomplete_onboarding)} href="/admin/people?onboarding=0" />
            <Row label="Public individuals" value={String(q.public_individuals)} />
            <Row label="Media files" value={String(t.media)} />
            <Row label="Coat embeddings" value={String(t.coat_embeddings)} />
            <Row label="Match reviews" value={String(t.match_reviews)} href="/admin/recognition" />
            <Row label="Audit events" value={String(t.audit_events)} href="/admin/audit" />
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

function HealthCell({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-md border border-[var(--line)] px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-[15px] font-semibold ${tone === "warn" ? "text-[var(--signal-warn)]" : ""}`}>{value}</p>
      {note && <p className="mt-1 truncate font-mono text-[11px] text-[var(--muted)]">{note}</p>}
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

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right">
        {href ? (
          <Link href={href} className="font-medium text-[var(--gold)]">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
