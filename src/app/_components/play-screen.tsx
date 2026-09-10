"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicSessionView } from "@/application/play/session-view";
import { loadSession } from "./session-client";
import type { DailyPayload } from "./session-types";
import { canonicalSessionRoute } from "./session-routing";

export function PlayScreen({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<DailyPayload | null>(null);
  const [thought, setThought] = useState("");
  const [synthesisText, setSynthesisText] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synthesisRequestKey = useRef<string | null>(null);

  const applyCanonicalPayload = useCallback((loaded: DailyPayload) => {
    const destination=canonicalSessionRoute(loaded.session.status,sessionId);
    if(destination){router.replace(destination);return;}
    setPayload(loaded);
  },[router,sessionId]);

  useEffect(() => {
    void loadSession(sessionId).then(applyCanonicalPayload).catch(() => setError("세션을 불러오지 못했습니다."));
  }, [applyCanonicalPayload, sessionId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!thought.trim() || evaluating) return;
    setEvaluating(true);
    setError(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const response = await fetch(`/api/play-sessions/${sessionId}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thought }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { error?: string };
      setError(failure.error === "JUDGE_UNAVAILABLE"
        ? "지금은 생각을 살펴보지 못했습니다. 입력은 그대로 두었으니 다시 시도해주세요."
        : "생각을 저장하지 못했습니다. 다시 시도해주세요.");
      setEvaluating(false);
      return;
    }
    const result = await response.json() as { session: PublicSessionView };
    setPayload((current) => current ? { ...current, session: result.session } : current);
    setThought("");
    setEvaluating(false);
  }

  async function lock() {
    const response = await fetch(`/api/play-sessions/${sessionId}/lock`, { method: "POST" });
    if (!response.ok) return setError("아직 생각을 잠글 수 없습니다.");
    router.push(`/reveal/${sessionId}`);
  }

  async function continueWithHelp() {
    const response = await fetch(`/api/play-sessions/${sessionId}/recovery`, { method: "POST" });
    if (!response.ok) return setError("도움을 이어가지 못했습니다.");
    const { session } = await response.json() as { session: PublicSessionView };
    setPayload((current) => current ? { ...current, session } : current);
  }

  async function submitSynthesis(event: FormEvent) {
    event.preventDefault();
    if (!payload || !synthesisText.trim() || evaluating || !payload.session.synthesis?.canSubmit) return;
    setEvaluating(true); setError(null);
    synthesisRequestKey.current ??= crypto.randomUUID();
    try { const response = await fetch(`/api/play-sessions/${sessionId}/final-synthesis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": synthesisRequestKey.current },
      body: JSON.stringify({ text: synthesisText, expectedStateVersion: payload.session.stateVersion }),
    }); await applySynthesisResponse(response); }
    catch { await recoverSynthesisNetworkFailure(); }
  }

  async function retrySynthesis() {
    if (!payload || evaluating) return;
    setEvaluating(true); setError(null);
    try { const response = await fetch(`/api/play-sessions/${sessionId}/final-synthesis/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStateVersion: payload.session.stateVersion }),
    }); await applySynthesisResponse(response); } catch { await recoverSynthesisNetworkFailure(); }
  }

  async function skipSynthesis() {
    if (!payload || evaluating) return;
    setEvaluating(true); setError(null);
    try { const response = await fetch(`/api/play-sessions/${sessionId}/final-synthesis/skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStateVersion: payload.session.stateVersion }),
    }); await applySynthesisResponse(response); } catch { await recoverSynthesisNetworkFailure(); }
  }

  async function applySynthesisResponse(response: Response) {
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { error?: string };
      const refreshed = await loadSession(sessionId).catch(() => null);
      if (refreshed) applyCanonicalPayload(refreshed);
      setError(failure.error === "FINAL_SYNTHESIS_UNAVAILABLE"
        ? "지금은 마지막 정리를 살펴보지 못했습니다. 같은 글로 다시 시도할 수 있어요."
        : "마지막 정리를 처리하지 못했습니다. 상태를 확인한 뒤 다시 시도해주세요.");
      setEvaluating(false); return;
    }
    const loaded = await response.json() as DailyPayload;
    applyCanonicalPayload(loaded); setSynthesisText(""); synthesisRequestKey.current=null; setEvaluating(false);
  }

  async function recoverSynthesisNetworkFailure() {
    const refreshed=await loadSession(sessionId).catch(()=>null);if(refreshed)applyCanonicalPayload(refreshed);
    setError("연결이 끊겼습니다. 저장된 상태를 확인한 뒤 다시 시도해주세요.");setEvaluating(false);
  }

  if (error && !payload) return <main className="page-shell"><p role="alert">{error}</p></main>;
  if (!payload) return <main className="page-shell"><p className="status-copy">문제를 준비하는 중…</p></main>;
  const { daily, session } = payload;
  const latestGuidance = session.guidance.at(-1);
  const lockable = session.status === "LOCKABLE";
  const synthesizing = session.status === "SYNTHESIZING" && Boolean(session.synthesis);
  const displayedTurn = Math.min(session.turnCount + (lockable ? 0 : 1), session.maxTurns);
  const turnLabel = session.correctiveRescueAvailable
    ? `${session.turnCount}개의 생각을 제출했고 정정 도움을 확인하는 중입니다`
    : synthesizing
    ? `${session.turnCount}개의 생각 이후 마지막 정리 중입니다`
    : lockable
    ? `${session.turnCount}개의 생각을 제출했고 이제 잠글 수 있습니다`
    : `${displayedTurn}번째 생각 작성 중`;

  return (
    <main className="page-shell play-shell">
      <header className="play-header">
        <p className="eyebrow">{daily.label} · 약 {daily.estimatedMinutes}분</p>
        <span aria-label={turnLabel}>{synthesizing ? session.turnCount : displayedTurn} / {session.maxTurns}</span>
      </header>
      {!lockable && !synthesizing ? (
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

      {synthesizing ? (
        <section className="synthesis-panel" aria-labelledby="synthesis-title">
          <p className="eyebrow">마지막 정리</p>
          <h2 id="synthesis-title">이제 당신이 발견한 원리를 스스로 정리해보세요.</h2>
          <p>앞선 대화를 보지 않아도 이 글만으로 생각과 관계가 이어지도록 당신의 말로 적어주세요.</p>
          {session.synthesis!.finalRewriteRequired ? <p className="synthesis-guidance" role="status">이 글만으로는 결론이 충분히 드러나지 않았어요. 앞선 대화를 보지 않아도 생각과 이유가 이어지도록 한 번 더 정리해볼까요?</p> : null}
          {session.synthesis!.evaluationInProgress || evaluating ? <div className="thinking-panel" aria-live="polite"><h2>마지막 정리를 살펴보는 중…</h2></div> : session.synthesis!.canRetryEvaluation ? <div className="synthesis-actions"><button className="primary-button" type="button" onClick={retrySynthesis}>같은 글 다시 살펴보기</button><button className="secondary-button" type="button" onClick={skipSynthesis}>공개로 넘어가기</button></div> : <form className="composer" onSubmit={submitSynthesis}>
            <label htmlFor="final-synthesis">당신의 마지막 정리</label>
            <textarea id="final-synthesis" name="final-synthesis" maxLength={session.synthesis!.maxChars} rows={6} value={synthesisText} onChange={(event)=>{setSynthesisText(event.target.value);synthesisRequestKey.current=null;}} placeholder="당신이 발견한 관계를 이 글 안에 온전히 담아보세요." />
            <div className="composer-footer"><span className="counter visible">{synthesisText.length} / {session.synthesis!.maxChars}</span><button className="primary-button" disabled={!synthesisText.trim() || !session.synthesis!.canSubmit} type="submit">{session.synthesis!.finalRewriteRequired ? "마지막으로 다시 정리하기" : "마지막 정리 제출하기"}</button></div>
          </form>}
          {session.synthesis!.canSkip && !session.synthesis!.canRetryEvaluation && !evaluating ? <button className="secondary-button synthesis-skip" type="button" onClick={skipSynthesis}>정리 없이 공개로 넘어가기</button> : null}
          <p className="attempt-copy">제출 {session.synthesis!.attemptsUsed} / {session.synthesis!.maxSubmissions}</p>
        </section>
      ) : evaluating ? (
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
