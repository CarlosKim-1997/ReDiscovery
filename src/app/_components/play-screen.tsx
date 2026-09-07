"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicSessionView } from "@/application/play/session-view";
import { loadDemoSession, saveDemoSnapshot } from "./demo-storage";
import type { DemoPayload } from "./demo-types";

export function PlayScreen({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<DemoPayload | null>(null);
  const [thought, setThought] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDemoSession(sessionId).then((loaded) => {
      if (loaded.session.status === "LOCKED") router.replace(`/reveal/${sessionId}`);
      else if (loaded.session.status === "REVEALED") router.replace(`/result/${sessionId}`);
      else setPayload(loaded);
    }).catch(() => setError("세션을 불러오지 못했습니다."));
  }, [router, sessionId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!thought.trim() || evaluating) return;
    setEvaluating(true);
    setError(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const response = await fetch(`/api/demo/sessions/${sessionId}/thoughts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thought }),
    });
    if (!response.ok) {
      setError("생각을 저장하지 못했습니다. 다시 시도해주세요.");
      setEvaluating(false);
      return;
    }
    const result = await response.json() as { session: PublicSessionView };
    setPayload((current) => current ? { ...current, session: result.session } : current);
    saveDemoSnapshot(result.session);
    setThought("");
    setEvaluating(false);
  }

  async function lock() {
    const response = await fetch(`/api/demo/sessions/${sessionId}/lock`, { method: "POST" });
    if (!response.ok) return setError("아직 생각을 잠글 수 없습니다.");
    const { session } = await response.json() as { session: PublicSessionView };
    saveDemoSnapshot(session);
    router.push(`/reveal/${sessionId}`);
  }

  async function continueWithHelp() {
    const response = await fetch(`/api/demo/sessions/${sessionId}/recovery`, { method: "POST" });
    if (!response.ok) return setError("도움을 이어가지 못했습니다.");
    const { session } = await response.json() as { session: PublicSessionView };
    setPayload((current) => current ? { ...current, session } : current);
    saveDemoSnapshot(session);
  }

  if (error && !payload) return <main className="page-shell"><p role="alert">{error}</p></main>;
  if (!payload) return <main className="page-shell"><p className="status-copy">문제를 준비하는 중…</p></main>;
  const { daily, session } = payload;
  const latestGuidance = session.guidance.at(-1);
  const lockable = session.status === "LOCKABLE";
  const displayedTurn = Math.min(session.turnCount + (lockable ? 0 : 1), session.maxTurns);
  const turnLabel = session.correctiveRescueAvailable
    ? `${session.turnCount}개의 생각을 제출했고 정정 도움을 확인하는 중입니다`
    : lockable
    ? `${session.turnCount}개의 생각을 제출했고 이제 잠글 수 있습니다`
    : `${displayedTurn}번째 생각 작성 중`;

  return (
    <main className="page-shell play-shell">
      <header className="play-header">
        <p className="eyebrow">{daily.label} · 약 {daily.estimatedMinutes}분</p>
        <span aria-label={turnLabel}>{displayedTurn} / {session.maxTurns}</span>
      </header>
      {!lockable ? (
        <section className="scenario-card" aria-labelledby="scenario-title">
          <h1 id="scenario-title">반복되는 모양</h1>
          <p>{daily.scenario}</p>
        </section>
      ) : null}

      {latestGuidance ? (
        <aside className={`guidance-card guidance-${latestGuidance.stage.toLowerCase()}`} aria-label={`${latestGuidance.stage} 도움`}>
          <p className="guidance-label">{latestGuidance.stage === "RESCUE" ? "생각의 연결" : "다음 관점"}</p>
          <p>{latestGuidance.text}</p>
        </aside>
      ) : null}

      {session.thoughts.length ? (
        <details className="previous-thoughts">
          <summary>지금까지의 생각 {session.thoughts.length}개</summary>
          <ol>{session.thoughts.map((item) => <li key={item.id}>{item.text}</li>)}</ol>
        </details>
      ) : null}

      {evaluating ? (
        <section className="thinking-panel" aria-live="polite">
          <p className="eyebrow">살펴보기</p>
          <h2>생각을 살펴보는 중…</h2>
        </section>
      ) : lockable ? (
        <section className="lock-panel" aria-labelledby="lock-title">
          <p className="eyebrow">내 생각</p>
          <h2 id="lock-title">여기까지 닿았습니다.</h2>
          <blockquote>{session.representativeThought}</blockquote>
          <button className="primary-button" onClick={lock}>내 생각 잠그고 공개하기</button>
        </section>
      ) : session.correctiveRescueAvailable ? (
        <section className="lock-panel" aria-labelledby="recovery-title">
          <p className="eyebrow">정정 도움</p>
          <h2 id="recovery-title">이 관점을 연결해볼까요?</h2>
          <p>답을 다시 쓰지 않아도 핵심 연결을 확인하고 계속할 수 있습니다.</p>
          <button className="primary-button" onClick={continueWithHelp}>도움으로 이어가기</button>
        </section>
      ) : (
        <form className="composer" onSubmit={submit}>
          <label htmlFor="thought">{daily.question}</label>
          <textarea
            id="thought"
            name="thought"
            maxLength={2_000}
            rows={4}
            value={thought}
            onChange={(event) => setThought(event.target.value)}
            placeholder="정답보다, 지금 떠오르는 이유를 적어보세요."
          />
          <div className="composer-footer">
            <span className={thought.length > 1_800 ? "counter visible" : "counter"}>{thought.length} / 2,000</span>
            <button className="primary-button" disabled={!thought.trim()} type="submit">생각 제출하기</button>
          </div>
        </form>
      )}
      {error ? <p className="error-copy" role="alert">{error}</p> : null}
    </main>
  );
}
