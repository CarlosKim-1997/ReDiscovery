"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "./session-client";
import type { RevealView } from "./session-types";
import { RevealResultContent } from "./reveal-result-content";

export function ResultScreen({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter();
  const [reveal, setReveal] = useState<RevealView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const payload = await loadSession(sessionId);
        if (payload.session.status === "LOCKED" || payload.session.status === "REVEAL_READY") {
          return router.replace(`/reveal/${sessionId}`);
        }
        if (payload.session.status !== "REVEALED") {
          return router.replace(`/play/${sessionId}`);
        }
        const response = await fetch(`/api/play-sessions/${sessionId}/reveal`, { cache: "no-store" });
        if (!response.ok) throw new Error("REVEAL_LOAD_FAILED");
        setReveal((await response.json() as { reveal: RevealView }).reveal);
      } catch {
        setError("결과를 불러오지 못했습니다.");
      }
    }
    void load();
  }, [router, sessionId]);

  if (error) return <main className="page-shell"><p role="alert">{error}</p></main>;
  if (!reveal) return <main className="page-shell"><p className="status-copy">연결을 정리하는 중…</p></main>;

  return (
    <main className="page-shell result-shell">
      <RevealResultContent reveal={reveal} />
      <button className="secondary-button" onClick={() => router.push("/")}>처음으로</button>
    </main>
  );
}
