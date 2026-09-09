export function Rosette({ className = "h-8 w-8" }: { className?: string; gold?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/patterns-mark.png" alt="" className={`object-contain ${className}`} aria-hidden />
  );
}

export function Wordmark({
  light = false,
  className = "",
}: {
  light?: boolean;
  className?: string;
}) {
  // Official lockup: gold mark + cream serif word. On light surfaces, use the mark + ink type.
  if (light) {
    return (
      <span className={`inline-flex items-center ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/patterns-wordmark.png"
          alt="Patterns"
          className="h-8 w-auto sm:h-9"
        />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 text-forest ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/patterns-mark.png" alt="" className="h-8 w-8 object-contain" aria-hidden />
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
