export function Rosette({ className = "h-8 w-8", gold = "#d4a03a" }: { className?: string; gold?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="18.2" fill="none" stroke={gold} strokeWidth="1.15" />
      <circle cx="20" cy="20" r="11.2" fill="none" stroke={gold} strokeWidth="1.2" />
      <circle cx="20" cy="20" r="3.1" fill={gold} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const r = ((deg - 90) * Math.PI) / 180;
        const cx = 20 + Math.cos(r) * 11.2;
        const cy = 20 + Math.sin(r) * 11.2;
        return <circle key={deg} cx={cx} cy={cy} r="2.15" fill="none" stroke={gold} strokeWidth="1.05" />;
      })}
    </svg>
  );
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={`flex items-center gap-2.5 ${light ? "text-[#f6f1e6]" : "text-forest"}`}>
      <Rosette className="h-8 w-8" gold={light ? "#e8c56a" : "#d4a03a"} />
      <span className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Patterns</span>
    </span>
  );
}

export function Grain() {
  return <div className="grain" aria-hidden />;
}

/** Repeating jaguar coat print — identity texture for dark panels. */
export function CoatPrint({
  tone = "dark",
  strength = "medium",
  className = "",
}: {
  tone?: "dark" | "light";
  strength?: "soft" | "medium" | "strong";
  className?: string;
}) {
  return (
    <div
      className={`coat-print coat-print--${tone} coat-print--${strength} ${className}`}
      aria-hidden
    />
  );
}

/** Topography contour print — territory texture. Light for canvas, dark for forest. */
export function TopoPrint({
  tone = "light",
  strength = "medium",
  className = "",
}: {
  tone?: "dark" | "light";
  strength?: "soft" | "medium" | "strong";
  className?: string;
}) {
  return (
    <div
      className={`topo-print topo-print--${tone} topo-print--${strength} ${className}`}
      aria-hidden
    />
  );
}
