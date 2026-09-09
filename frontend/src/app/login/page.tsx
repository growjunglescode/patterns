"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CoatPrint, Grain, TopoPrint, Wordmark } from "@/components/Brand";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.12fr_1fr]">
      <div className="relative hidden overflow-hidden bg-forest text-[#f6f1e6] lg:block">
        <img src="/hero-jaguar-portrait.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/45 to-forest/20" />
        <TopoPrint tone="dark" strength="soft" />
        <CoatPrint tone="dark" strength="medium" />
        <Grain />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Wordmark light />
          <div>
            <p className="page-kicker !text-gold">Patterns</p>
            <h2 className="mt-3 max-w-sm font-display text-5xl font-semibold leading-[1.02]">
              Identity without collars.
            </h2>
            <p className="mt-4 max-w-sm text-[0.98rem] text-white/68">
              Confirm matches, name new individuals, and watch the map fill with re-sightings.
            </p>
          </div>
        </div>
      </div>
      <div className="relative flex items-center justify-center bg-canvas px-4 py-12 sm:px-6 sm:py-16">
        <TopoPrint tone="light" strength="medium" />
        <Grain />
        <form onSubmit={onSubmit} className="relative w-full max-w-md space-y-4 rounded-[1.6rem] border border-ink/[0.06] bg-paper p-6 shadow-lift sm:p-9">
          <p className="page-kicker">Welcome back</p>
          <h1 className="page-title">Sign in</h1>
          <p className="text-muted">Use your research workspace credentials.</p>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn-forest w-full">Continue</button>
          <p className="text-sm text-muted">
            New here?{" "}
            <Link href="/register" className="font-semibold text-gold-deep">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
