import type { RevealView } from "./session-types";
import { PersonalizedRevealSection } from "./personalized-reveal-section";
import { AuthControls } from "./auth-controls";

export function RevealResultContent({ reveal, sessionId }: { readonly reveal: RevealView; readonly sessionId?: string }) {
  return <>
    <p className="eyebrow">오늘의 연결</p><h1>{reveal.theory}</h1>
    <p className="historical-line">{reveal.year} · {reveal.person}</p>
    {reveal.representativeThought ? <section className="result-card">
      <h2>{reveal.discoveryOutcome === "VERIFIED_FINAL_SYNTHESIS" ? "당신이 마지막으로 정리한 생각" : "당신이 먼저 적은 생각"}</h2>
      <blockquote>{reveal.representativeThought}</blockquote>
    </section> : null}
    {reveal.personalizedConnection ? <PersonalizedRevealSection reveal={reveal} /> : <section className="connection-card">
      <h2>어디에서 만났을까요?</h2><p>{reveal.connection}</p><p>{reveal.explanation}</p>
    </section>}
    {!reveal.personalizedConnection ? <p className="guidance-provenance">
      {reveal.discoveryOutcome === "UNVERIFIED_REVEAL" ? "잠금 없이 공개까지 살펴보았습니다." : reveal.substantialGuidanceUsed ? "도움을 통해 핵심 구조와 만났습니다." : "핵심 구조를 스스로 발견했습니다."}
    </p> : null}
    {sessionId ? <AuthControls key={sessionId} sessionId={sessionId} /> : null}
  </>;
}
