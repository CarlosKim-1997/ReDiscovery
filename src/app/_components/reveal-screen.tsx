"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "./session-client";
import type { RevealView } from "./session-types";
import { RevealChoreographyView } from "./reveal-choreography-view";

export function RevealScreen({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<{ sessionId: string; reveal: RevealView; reducedMotion: boolean; completionPersisted: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await loadSession(sessionId);
        if (cancelled) return;
        if (payload.session.status === "REVEALED") return router.replace(`/result/${sessionId}`);
        if (payload.session.status !== "LOCKED" && payload.session.status !== "REVEAL_READY") return router.replace(`/play/${sessionId}`);
        const response = await fetch(`/api/play-sessions/${sessionId}/reveal`, { cache: "no-store" });
        if (!response.ok) throw new Error("REVEAL_NOT_ALLOWED");
        const data = await response.json() as { reveal: RevealView };
        if (cancelled) return;
        // Existing completion is independent of animation/skip. No skip-triggered I/O.
        const completion = fetch(`/api/play-sessions/${sessionId}/reveal`, { method: "POST" });
        setAuthorized({ sessionId, reveal: data.reveal, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, completionPersisted: false });
        const complete = await completion;
        if (!complete.ok) throw new Error("REVEAL_COMPLETE_FAILED");
        await complete.json();
        if (!cancelled) setAuthorized(current => current?.sessionId === sessionId ? { ...current, completionPersisted: true } : current);
      } catch {
        if (!cancelled) setError("공개 화면을 불러오지 못했습니다.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [router, sessionId]);
  if (error) return <main className="page-shell"><p role="alert">{error}</p></main>;
  if (!authorized || authorized.sessionId !== sessionId) return <main className="page-shell reveal-shell"><p className="status-copy">생각을 펼치는 중…</p></main>;
  return <RevealChoreographyView key={sessionId} sessionId={sessionId} reveal={authorized.reveal} reducedMotion={authorized.reducedMotion} onHome={() => router.push("/")} onLegacyComplete={() => { if (authorized.completionPersisted) router.replace(`/result/${sessionId}`); }} />;
}
