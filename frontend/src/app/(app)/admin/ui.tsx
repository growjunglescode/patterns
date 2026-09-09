import Link from "next/link";

export function when(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function Stat({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: number | string;
  note?: string;
  href?: string;
  tone?: "warn" | "ok" | "mute";
}) {
  const color =
    tone === "warn" ? "text-[var(--signal-warn)]" : tone === "ok" ? "text-[var(--signal-ok)]" : "text-[var(--ink)]";
  const inner = (
    <div className="surface h-full px-4 py-4">
      <p className={`kpi-value ${color}`}>{value}</p>
      <p className="kpi-label">{label}</p>
      {note && <p className="mt-2 text-[12px] text-[var(--muted)]">{note}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
