"use client";

import { useEffect, useState } from "react";
import { PROJECT_EVENT, readProjectId } from "@/lib/project";

/** Current project from the ops header switcher. Reloads when it changes. */
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

  return projectId || undefined;
}
