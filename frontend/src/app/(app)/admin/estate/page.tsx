"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Field estate moved to Workspaces. Keep this route as a redirect. */
export default function AdminEstateRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/workspaces");
  }, [router]);
  return <p className="text-[var(--muted)]">Opening workspaces…</p>;
}
