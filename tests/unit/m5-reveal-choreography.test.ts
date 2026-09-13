import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRevealChoreography, REVEAL_TIMELINE_MS } from "@/app/_components/reveal-choreography";
import { RevealPhaseContent } from "@/app/_components/reveal-choreography-view";
import { RevealResultContent } from "@/app/_components/reveal-result-content";
import type { RevealView } from "@/app/_components/session-types";

const reveal: RevealView = { year: "1968", person: "Melvin Conway", theory: "Conway's Law", explanation: "원래 통찰의 설명", connection: "연결", provenance: {}, substantialGuidanceUsed: false, discoveryOutcome: "UNVERIFIED_REVEAL",
  revealOutcome: { code: "PARTIAL_CAPTURE", label: "핵심 일부 포착", explanation: "중요한 요소들을 스스로 발견했습니다." },
  personalizedConnection: { items: [{ label: "결과물의 구조", userExcerpt: "사람들 경계가 결과물에 남는다", explanation: "승인된 연결 설명" }], canonicalInsight: "원래 통찰의 설명" } };
const render = (phase: Parameters<typeof RevealPhaseContent>[0]["phase"], payload = reveal) => renderToStaticMarkup(createElement(RevealPhaseContent, { phase, reveal: payload }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("M5-C local Reveal choreography", () => {
  it("starts with the highest-priority exact user quote, with no future identity in DOM", () => {
    const controller = createRevealChoreography();
    expect(controller.getSnapshot()).toBe("THOUGHT");
    expect(render("THOUGHT")).toContain("사람들 경계가 결과물에 남는다");
    expect(render("THOUGHT")).not.toMatch(/1968|Melvin|Conway/);
  });
  it("does not fabricate or fall back to arbitrary wording when no evidence exists", () => {
    const html = render("THOUGHT", { ...reveal, representativeThought: "사용하지 않을 전체 답", personalizedConnection: { items: [], canonicalInsight: reveal.explanation } });
    expect(html).toContain("당신의 생각");
    expect(html).not.toMatch(/blockquote|사용하지 않을 전체 답|1968|Conway/);
  });
  it("moves thought -> time -> person -> theory -> complete at the canonical 3000ms", () => {
    expect(REVEAL_TIMELINE_MS).toEqual({ THOUGHT: 0, TIME: 750, PERSON: 1450, THEORY: 2200, COMPLETE: 3000 });
    const controller = createRevealChoreography();
    const phases: string[] = [];
    controller.subscribe(() => phases.push(controller.getSnapshot()));
    controller.start(); controller.start();
    vi.advanceTimersByTime(750);
    expect(controller.getSnapshot()).toBe("TIME");
    expect(render("TIME")).toContain("1968");
    expect(render("TIME")).not.toMatch(/Melvin|Conway/);
    vi.advanceTimersByTime(700);
    expect(controller.getSnapshot()).toBe("PERSON");
    expect(render("PERSON")).toContain("Melvin Conway");
    expect(render("PERSON")).not.toContain("Conway&#x27;s Law");
    vi.advanceTimersByTime(750);
    expect(controller.getSnapshot()).toBe("THEORY");
    vi.advanceTimersByTime(800);
    expect(controller.getSnapshot()).toBe("COMPLETE");
    expect(phases).toEqual(["TIME", "PERSON", "THEORY", "COMPLETE"]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("skip cancels all timers, is idempotent and performs no server call", () => {
    const server = vi.spyOn(globalThis, "fetch");
    const controller = createRevealChoreography();
    const listener = vi.fn(); controller.subscribe(listener); controller.start();
    controller.skip(); controller.skip(); controller.start();
    vi.advanceTimersByTime(3000);
    expect(controller.getSnapshot()).toBe("COMPLETE");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.wasSkipped()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(server).not.toHaveBeenCalled(); server.mockRestore();
  });
  it("reduced motion starts complete with zero timed waiting", () => {
    const controller = createRevealChoreography(true); controller.start();
    expect(controller.getSnapshot()).toBe("COMPLETE");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("effect/unmount cleanup cancels timers and produces no later update", () => {
    const controller = createRevealChoreography();
    const listener = vi.fn(); const unsubscribe = controller.subscribe(listener);
    controller.start(); controller.stop(); unsubscribe();
    vi.advanceTimersByTime(3000);
    expect(listener).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("supports effect setup/cleanup/setup without stale callbacks or backwards progression", () => {
    const controller = createRevealChoreography();
    controller.start(); controller.stop(); controller.start();
    vi.advanceTimersByTime(3000);
    expect(controller.getSnapshot()).toBe("COMPLETE");
    controller.stop(); controller.start();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("complete and stable Result retain outcome/personalization without a new choreography", () => {
    const html = render("COMPLETE");
    expect(html).toContain("핵심 일부 포착"); expect(html).toContain("당신이 짚은 부분"); expect(html).toContain("승인된 연결 설명");
    expect(renderToStaticMarkup(createElement(RevealResultContent, { reveal }))).toBe(html);
    expect(vi.getTimerCount()).toBe(0);
  });
});
