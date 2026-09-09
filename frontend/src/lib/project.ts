export const PROJECT_KEY = "patterns_project_id";
export const PROJECT_EVENT = "patterns-project";

export function readProjectId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(PROJECT_KEY) || "";
}

export function writeProjectId(id: string) {
  localStorage.setItem(PROJECT_KEY, id);
  window.dispatchEvent(new Event(PROJECT_EVENT));
}
