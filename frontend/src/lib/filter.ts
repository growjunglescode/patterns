export function matchesQuery(record: unknown, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const walk = (value: unknown): string => {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(walk).join(" ");
    if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(walk).join(" ");
    return "";
  };
  return walk(record).toLowerCase().includes(q);
}

export function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((v): v is string => Boolean(v && v !== "—")))].sort((a, b) => a.localeCompare(b));
}
