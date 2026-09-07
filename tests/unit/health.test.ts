import { expect, it } from "vitest";
import { getHealth } from "@/application/system/get-health";
import { SystemClock } from "@/adapters/system-clock/system-clock";
import type { ClockPort } from "@/ports/clock";

it("uses injected server time across a Seoul midnight boundary", () => {
  const instants = ["2026-09-07T14:59:59.000Z", "2026-09-07T15:00:00.000Z"];
  for (const instant of instants) {
    const clock: ClockPort = { now: () => new Date(instant) };
    expect(getHealth(clock)).toEqual({ status: "ok", checkedAt: instant });
  }
});

it("system adapter supplies a valid timestamp", () => {
  expect(Number.isFinite(new SystemClock().now().getTime())).toBe(true);
});
