"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void;
          cancel: () => void;
        };
      };
    };
  }
}

type Props = {
  label?: string;
  onError?: (message: string) => void;
};

export function GoogleSignInButton({ label = "Continue with Google", onError }: Props) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const providers = await api.authProviders();
        if (cancelled) return;
        if (!providers.google || !providers.google_client_id) {
          setEnabled(false);
          return;
        }
        setEnabled(true);

        await loadGis();
        if (cancelled || !hostRef.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: providers.google_client_id,
          callback: async (response: { credential?: string }) => {
            if (!response.credential) {
              onError?.("Google did not return a sign-in credential");
              return;
            }
            setBusy(true);
            try {
              await api.loginWithGoogle(response.credential);
              const me = await api.me();
              router.push(me.onboarding_complete ? "/overview" : "/onboarding");
            } catch (err) {
              onError?.(err instanceof Error ? err.message : "Google sign-in failed");
            } finally {
              setBusy(false);
            }
          },
          ux_mode: "popup",
          auto_select: false,
        });

        hostRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(hostRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: hostRef.current.offsetWidth || 360,
          logo_alignment: "left",
        });
        setReady(true);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      try {
        window.google?.accounts.id.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [onError, router]);

  if (!enabled) return null;

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-3 text-[12px] uppercase tracking-[0.12em] text-ink/35">
        <span className="h-px flex-1 bg-ink/10" />
        or
        <span className="h-px flex-1 bg-ink/10" />
      </div>
      <div className="min-h-[44px] w-full overflow-hidden" ref={hostRef} aria-label={label} />
      {(!ready || busy) && (
        <p className="text-center text-[13px] text-muted">{busy ? "Signing in with Google…" : "Loading Google…"}</p>
      )}
    </div>
  );
}

function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-google-gis="1"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load Google")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleGis = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google"));
    document.head.appendChild(script);
  });
}
