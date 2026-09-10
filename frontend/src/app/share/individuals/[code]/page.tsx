"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Grain, TopoPrint, Wordmark } from "@/components/Brand";
import { api, mediaSrc } from "@/lib/api";

export default function PublicIndividualPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.publicIndividual(code).then(setData).catch((e) => setError(e.message));
  }, [code]);

  return (
    <div className="relative min-h-screen bg-canvas text-ink">
      <TopoPrint tone="light" strength="medium" />
      <Grain />
      <header className="relative mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Link href="/">
          <Wordmark />
        </Link>
        <Link href="/" className="text-sm font-semibold text-gold-deep">
          Sign in
        </Link>
      </header>
      <main className="relative mx-auto max-w-4xl space-y-6 px-6 pb-16">
        {error && (
          <div className="surface p-8">
            <h1 className="page-title">This profile is not public</h1>
            <p className="lede">A scientist or admin has to share the profile before it can be opened without signing in.</p>
          </div>
        )}
        {data && (
          <>
            <div className="surface p-8">
              <p className="page-kicker">{data.project_name || "Patterns"}</p>
              <h1 className="page-title mt-2">{data.display_name}</h1>
              <p className="mt-2 font-mono text-[13px] text-ink/50">
                {data.code} · {data.species} · {data.detection_count} sightings
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(data.photos || []).map((photo: any, i: number) => (
                <figure key={i} className="overflow-hidden rounded-2xl bg-white shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaSrc(photo.url)} alt="" className="h-56 w-full object-cover" />
                  <figcaption className="px-4 py-3 text-[13px] text-ink/55">
                    {photo.station || "Unknown station"}
                    {photo.captured_at ? ` · ${new Date(photo.captured_at).toLocaleDateString()}` : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
