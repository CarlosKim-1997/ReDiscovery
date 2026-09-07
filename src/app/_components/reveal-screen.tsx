"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadDemoSession, saveDemoSnapshot } from "./demo-storage";
import type { RevealView } from "./demo-types";
import type { PublicSessionView } from "@/application/play/session-view";

export const REVEAL_TIMING_MS = Object.freeze({ normal: [0, 450, 650, 650, 650, 600], reduced: [0, 40, 40, 40, 40, 40] });

export function RevealScreen({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter();
  const [reveal, setReveal] = useState<RevealView | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const payload = await loadDemoSession(sessionId);
        if (payload.session.status === "REVEALED") return router.replace(`/result/${sessionId}`);
        if (payload.session.status !== "LOCKED") return router.replace(`/play/${sessionId}`);
        const response = await fetch(`/api/demo/sessions/${sessionId}/reveal`, { cache: "no-store" });
        if (!response.ok) throw new Error("REVEAL_NOT_ALLOWED");
        const data = await response.json() as { reveal: RevealView };
        if (cancelled) return;
        setReveal(data.reveal);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const timing = reduced ? REVEAL_TIMING_MS.reduced : REVEAL_TIMING_MS.normal;
        for (let index = 1; index <= 5; index += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, timing[index]));
          if (cancelled) return;
          setStep(index);
        }
        const complete = await fetch(`/api/demo/sessions/${sessionId}/reveal`, { method: "POST" });
        if (!complete.ok) throw new Error("REVEAL_COMPLETE_FAILED");
        const completed = await complete.json() as { session: PublicSessionView };
        saveDemoSnapshot(completed.session);
        router.replace(`/result/${sessionId}`);
      } catch {
        if (!cancelled) setError("공개 화면을 불러오지 못했습니다.");
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [router, sessionId]);

  if (error) return <main className="page-shell"><p role="alert">{error}</p></main>;
  if (!reveal) return <main className="page-shell reveal-shell"><p className="status-copy">생각을 펼치는 중…</p></main>;

  return (
    <main className="page-shell reveal-shell" aria-live="polite" data-reveal-step={step}>
      <section className={`reveal-beat ${step >= 0 ? "shown" : ""}`}>
        <p className="eyebrow">당신의 생각</p><blockquote>{reveal.representativeThought}</blockquote>
      </section>
      <div className={`rewind-line ${step >= 1 ? "shown" : ""}`}>시간을 거슬러 올라갑니다</div>
      <section className={`reveal-beat history-beat ${step >= 2 ? "shown" : ""}`}>
        <p className="reveal-year">{reveal.year}</p>
        <p className={step >= 3 ? "shown" : "hidden-beat"}>{reveal.person}</p>
        <h1 className={step >= 4 ? "shown" : "hidden-beat"}>{reveal.theory}</h1>
      </section>
      <p className={`transition-copy ${step >= 5 ? "shown" : ""}`}>두 생각이 만나는 지점을 살펴봅니다.</p>
    </main>
  );
}
