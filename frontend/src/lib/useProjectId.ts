"use client";

import { useEffect, useState } from "react";
import { PROJECT_EVENT, readProjectId, scopedProjectId } from "@/lib/project";

/** Current project from the ops header switcher. Reloads when it changes.
 *  Returns undefined when “All projects” is selected. */
export function useProjectId() {
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    function sync() {
      setProjectId(readProjectId() || "");
    }
    sync();
    window.addEventListener(PROJECT_EVENT, sync);
    return () => window.removeEventListener(PROJECT_EVENT, sync);
  }, []);

  return scopedProjectId(projectId);
}
