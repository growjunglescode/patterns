"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Sign-in lives on the home page. Keep /login for old links. */
export default function LoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas text-[13px] text-ink/50">
      Opening sign in…
    </div>
  );
}
