"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Grain, TopoPrint, Wordmark } from "@/components/Brand";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/roles";

export default function PublicPersonPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.publicPerson(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="relative min-h-screen bg-canvas text-ink">
      <TopoPrint tone="light" strength="medium" />
      <Grain />
      <header className="relative mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/">
          <Wordmark />
        </Link>
        <Link href="/login" className="text-sm font-semibold text-gold-deep">
          Sign in
        </Link>
      </header>
      <main className="relative mx-auto max-w-3xl px-6 pb-16">
        {error && (
          <div className="surface p-8">
            <h1 className="page-title">Profile not shared</h1>
            <p className="lede">This person has not published a public profile.</p>
          </div>
        )}
        {data && (
          <div className="surface p-8">
            <p className="page-kicker">{roleLabel(data.role)}</p>
            <h1 className="page-title mt-2">{data.display_name}</h1>
            {data.organization && <p className="mt-2 text-[0.98rem] text-ink/65">{data.organization}</p>}
            {data.bio && <p className="mt-5 max-w-xl text-[0.98rem] leading-relaxed text-ink/70">{data.bio}</p>}
            <p className="mt-6 text-[13px] text-ink/45">
              {data.verified ? "Verified" : "Unverified"} · {data.photo_count} photos contributed
              {data.orcid ? ` · ORCID ${data.orcid}` : ""}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
