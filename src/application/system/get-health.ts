import type { ClockPort } from "@/ports/clock";

/** Process liveness only. This does not claim vendor or database readiness. */
export function getHealth(clock: ClockPort) {
  return {
    status: "ok" as const,
    checkedAt: clock.now().toISOString(),
  };
}
