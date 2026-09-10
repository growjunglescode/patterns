"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CoatPrint, Grain, TopoPrint, Wordmark } from "@/components/Brand";
import { api, token } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!token()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then((me) => router.replace(me.onboarding_complete ? "/overview" : "/onboarding"))
      .catch(() => setChecking(false));
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.login(email, password);
      const me = await api.me();
      router.push(me.onboarding_complete ? "/overview" : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-[13px] text-ink/50">
        Opening workspace…
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative flex min-h-[42vh] flex-col justify-between overflow-hidden bg-forest text-[#f6f1e6] lg:min-h-screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-jaguar-portrait.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/50 to-forest/25" />
        <TopoPrint tone="dark" strength="soft" />
        <CoatPrint tone="dark" strength="medium" />
        <Grain />
        <div className="relative flex h-full flex-col justify-between p-6 sm:p-10 lg:p-12">
          <Wordmark light />
          <div className="max-w-md pb-2 lg:pb-4">
            <p className="page-kicker !text-gold">Patterns</p>
            <h1 className="mt-3 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
              Identity without collars.
            </h1>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-white/70 sm:text-[0.98rem]">
              Confirm matches, name new individuals, and watch the map fill with re-sightings.
            </p>
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center bg-canvas px-4 py-10 sm:px-6 sm:py-16">
        <TopoPrint tone="light" strength="medium" />
        <Grain />
        <form
          onSubmit={onSubmit}
          className="relative w-full max-w-md space-y-4 rounded-[1.6rem] border border-ink/[0.06] bg-paper p-6 shadow-lift sm:p-9"
        >
          <p className="page-kicker">Welcome back</p>
          <h2 className="page-title">Sign in</h2>
          <p className="text-muted">Use your research workspace credentials.</p>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            aria-label="Email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            aria-label="Password"
          />
          <button type="submit" className="btn-forest w-full">
            Continue
          </button>
          <p className="text-sm text-muted">
            New here?{" "}
            <Link href="/register" className="font-semibold text-gold-deep">
              Create an account
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}
