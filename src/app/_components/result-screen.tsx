"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadDemoSession, saveDemoSnapshot } from "./demo-storage";
import type { RevealView } from "./demo-types";
import type { PublicSessionView } from "@/application/play/session-view";

export function ResultScreen({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter();
  const [reveal, setReveal] = useState<RevealView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const payload = await loadDemoSession(sessionId);
        if (payload.session.status === "LOCKED") {
          const completed = await fetch(`/api/demo/sessions/${sessionId}/reveal`, { method: "POST" });
          if (!completed.ok) throw new Error("REVEAL_COMPLETE_FAILED");
          const body = await completed.json() as { session: PublicSessionView };
          saveDemoSnapshot(body.session);
        } else if (payload.session.status !== "REVEALED") {
          return router.replace(`/play/${sessionId}`);
        }
        const response = await fetch(`/api/demo/sessions/${sessionId}/reveal`, { cache: "no-store" });
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
      <section className="result-card">
        <h2>당신이 먼저 적은 생각</h2>
        <blockquote>{reveal.representativeThought}</blockquote>
      </section>
      <section className="connection-card">
        <h2>어디에서 만났을까요?</h2>
        <p>{reveal.connection}</p>
        <p>{reveal.explanation}</p>
      </section>
      <p className="guidance-provenance">
        {reveal.substantialGuidanceUsed ? "도움을 통해 핵심 구조와 만났습니다." : "핵심 구조를 스스로 발견했습니다."}
      </p>
      <button className="secondary-button" onClick={() => router.push("/")}>처음으로</button>
    </main>
  );
}
