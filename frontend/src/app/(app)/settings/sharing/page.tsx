"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type Individual, type User } from "@/lib/api";
import { FilterBar } from "@/components/FilterBar";
import { isScientist } from "@/lib/roles";
import { matchesQuery } from "@/lib/filter";

export default function SharingPage() {
  const [me, setMe] = useState<User | null>(null);
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    api.me().then(setMe).catch(() => undefined);
    api.individuals().then(setIndividuals).catch(() => setIndividuals([]));
  }, []);

  const filtered = useMemo(() => individuals.filter((row) => matchesQuery(row, query)), [individuals, query]);
  const canShare = isScientist(me?.role);

  async function togglePerson(next: boolean) {
    setError("");
    try {
      setMe(await api.patchMe({ profile_public: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update sharing");
    }
  }

  async function toggleIndividual(row: Individual, next: boolean) {
    setError("");
    try {
      const updated = await api.shareIndividual(row.id, next);
      setIndividuals((list) =>
        list.map((item) => (item.id === updated.id ? { ...item, share_public: updated.share_public } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share this profile");
    }
  }

  async function copy(path: string, id: string) {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(id);
    setTimeout(() => setCopied(""), 1600);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="section-title">Sharing</p>
        <p className="mt-1 text-[0.9375rem] text-ink/55">
          Public links skip login. Shared species pages hide exact GPS and show the coat, not the collar.
        </p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <section className="surface p-6">
        <p className="font-medium">Your profile</p>
        <p className="mt-1 text-[13px] text-ink/55">Anyone with the link sees your name, role, and institution — not your email.</p>
        <label className="mt-4 flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={Boolean(me?.profile_public)} onChange={(e) => togglePerson(e.target.checked)} />
          Share my public profile
        </label>
        {me && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={`/p/${me.id}`} className="font-mono text-[12px] text-gold-deep">
              /p/{me.id}
            </Link>
            <button type="button" disabled={!me.profile_public} className="rounded-full border px-3 py-1 text-[12.5px] disabled:opacity-40" onClick={() => copy(`/p/${me.id}`, "me")}>
              {copied === "me" ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
      </section>
      {canShare && (
        <section className="space-y-3">
          <p className="font-medium">Individual profiles</p>
          <FilterBar query={query} onQuery={setQuery} placeholder="Filter profiles…" showing={filtered.length} total={individuals.length} />
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            {filtered.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/5 px-5 py-3 last:border-0">
                <div>
                  <p className="font-medium">{row.display_name}</p>
                  <p className="font-mono text-[12px] text-ink/45">{row.code}</p>
                </div>
                <div className="flex items-center gap-3">
                  {row.share_public && (
                    <button type="button" className="text-[12.5px] font-semibold text-gold-deep" onClick={() => copy(`/share/individuals/${row.code}`, row.id)}>
                      {copied === row.id ? "Copied" : "Copy link"}
                    </button>
                  )}
                  <label className="text-[13px]">
                    <input
                      type="checkbox"
                      className="mr-1.5 align-middle"
                      checked={Boolean(row.share_public)}
                      onChange={(e) => toggleIndividual(row, e.target.checked)}
                    />
                    Public
                  </label>
                </div>
              </div>
            ))}
            {!filtered.length && <p className="px-5 py-8 text-center text-[13px] text-ink/45">No individuals yet.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
