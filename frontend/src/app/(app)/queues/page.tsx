"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old Name queue URL — keep bookmarks working. */
export default function QueuesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/review?tab=names");
  }, [router]);
  return <p className="text-ink/45">Opening Review…</p>;
}
