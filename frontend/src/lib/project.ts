export const PROJECT_KEY = "patterns_project_id";
export const PROJECT_EVENT = "patterns-project";
/** Header value for “show every project I can access”. */
export const ALL_PROJECTS = "*";

export function readProjectId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(PROJECT_KEY) || "";
}

export function writeProjectId(id: string) {
  localStorage.setItem(PROJECT_KEY, id);
  window.dispatchEvent(new Event(PROJECT_EVENT));
}

/** API scope: undefined = all accessible projects. */
export function scopedProjectId(id?: string | null): string | undefined {
  if (!id || id === ALL_PROJECTS) return undefined;
  return id;
}
