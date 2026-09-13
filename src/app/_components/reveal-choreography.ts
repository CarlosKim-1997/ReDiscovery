export type RevealPhase = "THOUGHT" | "TIME" | "PERSON" | "THEORY" | "COMPLETE";
export const REVEAL_TIMELINE_MS = Object.freeze({ THOUGHT: 0, TIME: 750, PERSON: 1450, THEORY: 2200, COMPLETE: 3000 });

/** Local-only Reveal transition; no server, persistence or semantic work. */
export function createRevealChoreography(reducedMotion = false) {
  let phase: RevealPhase = reducedMotion ? "COMPLETE" : "THOUGHT";
  let running = false;
  let skipped = false;
  let generation = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  const stop = () => { generation++; running = false; for (const timer of timers) clearTimeout(timer); timers.clear(); };
  const publish = (next: RevealPhase) => {
    if (REVEAL_TIMELINE_MS[next] <= REVEAL_TIMELINE_MS[phase]) return;
    phase = next;
    if (next === "COMPLETE") stop();
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => phase,
    wasSkipped: () => skipped,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (running || phase === "COMPLETE") return;
      running = true;
      const currentGeneration = generation;
      for (const next of ["TIME", "PERSON", "THEORY", "COMPLETE"] as const) {
        if (REVEAL_TIMELINE_MS[next] <= REVEAL_TIMELINE_MS[phase]) continue;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (running && generation === currentGeneration) publish(next);
        }, REVEAL_TIMELINE_MS[next]);
        timers.add(timer);
      }
    },
    skip: () => { if (phase !== "COMPLETE") skipped = true; publish("COMPLETE"); },
    stop,
  };
}
