"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "./session-client";
import type { RevealView } from "./session-types";

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
      <p className="eyebrow">오늘의 연결</p>
      <h1>{reveal.theory}</h1>
      <p className="historical-line">{reveal.year} · {reveal.person}</p>
      {reveal.representativeThought ? <section className="result-card">
        <h2>{reveal.discoveryOutcome === "VERIFIED_FINAL_SYNTHESIS" ? "당신이 마지막으로 정리한 생각" : "당신이 먼저 적은 생각"}</h2>
        <blockquote>{reveal.representativeThought}</blockquote>
      </section> : null}
      <section className="connection-card">
        <h2>어디에서 만났을까요?</h2>
        <p>{reveal.connection}</p>
        <p>{reveal.explanation}</p>
      </section>
      <p className="guidance-provenance">
        {reveal.discoveryOutcome === "UNVERIFIED_REVEAL" ? "잠금 없이 공개까지 살펴보았습니다." : reveal.substantialGuidanceUsed ? "도움을 통해 핵심 구조와 만났습니다." : "핵심 구조를 스스로 발견했습니다."}
      </p>
      <button className="secondary-button" onClick={() => router.push("/")}>처음으로</button>
    </main>
  );
}
