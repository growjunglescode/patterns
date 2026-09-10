"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CoatPrint, Grain, TopoPrint, Wordmark } from "@/components/Brand";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.register({ email, password, display_name: displayName });
      await api.login(email, password);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.12fr_1fr]">
      <div className="relative hidden overflow-hidden bg-forest lg:block">
        <img src="/hero-jaguar-portrait.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/50 to-forest/25" />
        <TopoPrint tone="dark" strength="soft" />
        <CoatPrint tone="dark" strength="medium" />
        <Grain />
        <div className="relative flex h-full flex-col justify-between p-12 text-[#f6f1e6]">
          <Wordmark light />
          <p className="max-w-sm font-display text-4xl leading-tight">Build your field catalog from scratch.</p>
        </div>
      </div>
      <div className="relative flex items-center justify-center bg-canvas px-4 py-12 sm:px-6 sm:py-16">
        <TopoPrint tone="light" strength="medium" />
        <Grain />
        <form onSubmit={onSubmit} className="relative w-full max-w-md space-y-4 rounded-[1.6rem] border border-ink/[0.06] bg-paper p-6 shadow-lift sm:p-9">
          <p className="page-kicker">Patterns</p>
          <h1 className="page-title">Create account</h1>
          <p className="text-muted">We&apos;ll ask about your affiliation and camera traps next.</p>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <input placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn-forest w-full">Continue to profile setup</button>
          <p className="text-sm text-muted">
            Already have access?{" "}
            <Link href="/" className="font-semibold text-gold-deep">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
