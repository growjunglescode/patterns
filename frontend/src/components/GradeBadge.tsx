import { gradeLabel, reviewStateLabel } from "@/lib/api";

export function GradeBadge({ grade }: { grade: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase grade-${grade}`}>
      {gradeLabel(grade)}
    </span>
  );
}

export function ReviewStateBadge({ state }: { state?: string | null }) {
  const label = reviewStateLabel(state);
  if (!label) return null;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase review-${state}`}>
      {label}
    </span>
  );
}

