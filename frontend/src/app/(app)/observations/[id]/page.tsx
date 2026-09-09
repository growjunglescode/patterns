"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GradeBadge, ReviewStateBadge } from "@/components/GradeBadge";
import { api, mediaSrc, type Detection } from "@/lib/api";

export default function ObservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [obs, setObs] = useState<Detection | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.detection(id).then(setObs).catch((e) => setError(e.message));
  }

  useEffect(load, [id]);

  async function confirm(individualId: string) {
    setObs(await api.confirm(id, { individual_id: individualId }));
  }

  async function createNew() {
    setObs(await api.confirm(id, { create_new: true }));
  }

  async function propose(e: FormEvent) {
    e.preventDefault();
    if (!obs?.individual_id) return;
    try {
      await api.proposeName(obs.individual_id, name);
      load();
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Name rejected");
    }
  }

  if (!obs) return <p>{error || "Loading…"}</p>;
  const stills = obs.media.filter((m) => m.kind !== "video");

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-4">
        {stills.map((m) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={mediaSrc(m.url)} alt="" className="w-full rounded-2xl bg-white shadow-card" />
        ))}
      </div>
      <div className="space-y-5">
        <p className="page-kicker">Detection</p>
        <h1 className="page-title">{obs.individual_name || obs.suggested_name || "Unassigned"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <GradeBadge grade={obs.grade} />
          <ReviewStateBadge state={obs.review_state} />
        </div>
        <p className="text-ink/70">{obs.summary}</p>
        <p className="font-mono text-sm text-ink/50">
          {obs.species} · {obs.side} · conf {obs.confidence.toFixed(2)}
          {obs.engine ? ` · ${obs.engine}` : ""}
        </p>
        {obs.known_match && (
          <p className="rounded-xl bg-teal/10 px-4 py-3 text-[13px]">
            Already in the database as <strong>{obs.individual_name}</strong>. No new name.
          </p>
        )}
        {obs.missing_location || obs.missing_time ? (
          <p className="text-[13px] text-gold">Location or time is missing — complete it on Upload or here after saving metadata.</p>
        ) : null}
        {obs.candidates.length === 0 && !obs.individual_id && obs.match_library_note && (
          <p className="rounded-xl bg-gold/10 px-4 py-3 text-[13px]">{obs.match_library_note}</p>
        )}
        {obs.review_state === "awaiting_second_review" && obs.individual_id && (
          <div className="rounded-2xl border border-gold/30 bg-white p-5 shadow-card">
            <p className="section-title mb-1">Second review needed</p>
            <p className="text-[13px] text-ink/55">
              First reviewer: {obs.reviewer_name || "unknown"}. A different scientist must confirm the same individual.
            </p>
            <button
              className="btn-gold mt-3 !px-4 !py-2"
              onClick={() => confirm(obs.individual_id!)}
            >
              Confirm as second reviewer
            </button>
          </div>
        )}
        {obs.candidates.length > 0 && !obs.known_match && !obs.individual_id && (
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <p className="text-xs uppercase tracking-widest text-ink/40">Ranked candidates</p>
            {obs.review_state === "potential_match" && (
              <p className="mt-1 text-[13px] text-ink/55">Potential Match — confirm, reject, or register as a new individual. The app never auto-names.</p>
            )}
            <ul className="mt-3 space-y-2">
              {obs.candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span>
                    {c.display_name} <span className="font-mono text-ink/40">{c.code}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm">{c.score.toFixed(2)}</span>
                    <button className="rounded-full bg-forest px-3 py-1 text-xs text-canvas" onClick={() => confirm(c.id)}>
                      Confirm
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <button className="mt-4 text-sm text-gold" onClick={createNew}>
              No match — this is a new individual
            </button>
            <button
              className="mt-2 block text-sm text-ink/50"
              onClick={async () => setObs(await api.confirm(id, { reject: true }))}
            >
              Reject these matches
            </button>
          </div>
        )}
        {obs.individual_id && obs.individual_code === obs.individual_name && (
          <form onSubmit={propose} className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="section-title">Propose a canonical name</h2>
            <p className="text-sm text-ink/50">Verified researchers propose; an admin approves. Names cannot overlap.</p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <input className="w-full rounded-lg border px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Itzel" required />
            <button className="rounded-full bg-gold px-5 py-2 text-white">Submit for approval</button>
          </form>
        )}
      </div>
    </div>
  );
}
