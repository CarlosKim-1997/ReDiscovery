"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RevealView } from "./session-types";
import { createRevealChoreography, type RevealPhase } from "./reveal-choreography";
import { RevealResultContent } from "./reveal-result-content";

export function RevealPhaseContent({ phase, reveal, sessionId }: { readonly phase: RevealPhase; readonly reveal: RevealView; readonly sessionId?: string }) {
  if (phase === "COMPLETE") return <RevealResultContent reveal={reveal} {...(sessionId ? { sessionId } : {})} />;
  const excerpt = reveal.personalizedConnection?.items[0]?.userExcerpt;
  return <section key={phase} className="choreography-focal">
    {phase === "THOUGHT" ? <><p className="eyebrow">당신의 생각</p>{excerpt ? <blockquote>{excerpt}</blockquote> : <p>이제 원래 통찰과 연결해봅니다.</p>}</> : null}
    {phase === "TIME" ? <><p className="eyebrow">시간을 거슬러 올라갑니다</p><p className="reveal-year">{reveal.year}</p></> : null}
    {phase === "PERSON" ? <><p className="eyebrow">이 시기의 한 사람</p><h1>{reveal.person}</h1></> : null}
    {phase === "THEORY" ? <><p className="eyebrow">그 사람이 정리한 통찰</p><h1>{reveal.theory}</h1></> : null}
  </section>;
}
export function RevealChoreographyView({ reveal, sessionId, reducedMotion, onHome, onLegacyComplete }: { readonly reveal: RevealView; readonly sessionId: string; readonly reducedMotion: boolean; readonly onHome: () => void; readonly onLegacyComplete: () => void }) {
  const [controller] = useState(() => createRevealChoreography(reducedMotion));
  const phase = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.start(); return controller.stop; }, [controller]);
  useEffect(() => {
    if (phase === "COMPLETE" && !reveal.personalizedConnection && !controller.wasSkipped()) onLegacyComplete();
  }, [controller, onLegacyComplete, phase, reveal.personalizedConnection]);
  return <main className={`page-shell ${phase === "COMPLETE" ? "result-shell" : "reveal-shell"}`} data-reveal-phase={phase}>
    <div aria-live="polite" aria-atomic="true"><RevealPhaseContent phase={phase} reveal={reveal} sessionId={sessionId} /></div>
    {phase === "COMPLETE" ? <button className="secondary-button" onClick={onHome}>처음으로</button>
      : <button className="secondary-button choreography-skip" onClick={controller.skip}>바로 보기</button>}
  </main>;
}
