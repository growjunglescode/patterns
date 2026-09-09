import Link from "next/link";
import { CoatPrint, Grain, Rosette, TopoPrint, Wordmark } from "@/components/Brand";

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-forest text-[#f6f1e6]">
      <img
        src="/hero-jaguar-wide.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-55"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-forest via-forest/88 to-forest/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-forest via-transparent to-forest/40" />
      <TopoPrint tone="dark" strength="medium" />
      <CoatPrint tone="dark" strength="medium" />
      <Grain />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6">
        <Wordmark light />
        <div className="flex shrink-0 items-center gap-3 text-sm sm:gap-5">
          <Link href="/login" className="text-white/80 hover:text-white">
            Sign in
          </Link>
          <Link href="/register" className="btn-gold !px-3 !py-2 sm:!px-4">
            Create account
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
        <div className="mb-6 flex items-start gap-3 sm:items-center">
          <Rosette className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" gold="#e8c56a" />
          <p className="page-kicker !text-gold">Wildlife intelligence · starting with jaguars</p>
        </div>
        <h1 className="max-w-3xl font-display text-[clamp(2.2rem,9vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
          Name the jaguar.
          <span className="mt-2 block italic text-gold">Track the population.</span>
        </h1>
        <p className="mt-6 max-w-lg text-[1rem] leading-relaxed text-white/72 sm:mt-7 sm:text-[1.08rem]">
          Camera-trap photos become a living catalog of individuals. EXIF fills the map. The coat proposes a match.
          Scientists confirm; the system never names an animal by itself.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap">
          <Link href="/login" className="btn-gold px-7">
            Open the workspace
          </Link>
          <Link href="/register" className="btn-ghost">
            Join as a citizen scientist
          </Link>
        </div>
        <div className="mt-16 grid max-w-3xl gap-4 sm:mt-24 sm:grid-cols-3">
          {[
            ["01", "Read the file", "Time, GPS, and camera from EXIF — asked for if missing."],
            ["02", "Match the coat", "Known individuals keep their name. New ones wait for admin."],
            ["03", "Follow the trail", "Re-sightings redraw movement on the map."],
          ].map(([n, t, b]) => (
            <div
              key={n}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-sm"
            >
              <CoatPrint tone="dark" strength="soft" />
              <div className="relative">
                <p className="font-mono text-[11px] text-gold">{n}</p>
                <p className="mt-2 font-semibold">{t}</p>
                <p className="mt-1 text-[13px] leading-snug text-white/55">{b}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
