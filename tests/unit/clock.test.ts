import { describe, expect, it } from "vitest";
import { FixedClock } from "@/adapters/fixed-clock/fixed-clock";
import { SystemClock } from "@/adapters/system-clock/system-clock";
import { makeClock } from "@/server/clock";

describe("server clock selection", () => {
  it("returns stable defensive copies of a fixed instant", () => {
    const instant = "2026-09-09T03:00:00.000Z";
    const clock = new FixedClock(new Date(instant));

    const first = clock.now();
    expect(first.toISOString()).toBe(instant);
    expect(clock.now().toISOString()).toBe(instant);

    first.setUTCFullYear(2030);
    expect(clock.now().toISOString()).toBe(instant);
  });

  it("selects the system clock when no fixed instant is configured", () => {
    expect(makeClock({ APP_ENV: "test" })).toBeInstanceOf(SystemClock);
    expect(makeClock({ APP_ENV: "production" })).toBeInstanceOf(SystemClock);
  });

  it("selects the fixed clock for an explicit test instant", () => {
    const clock = makeClock({
      APP_ENV: "test",
      TEST_FIXED_NOW: "2026-09-09T03:00:00.000Z",
    });

    expect(clock).toBeInstanceOf(FixedClock);
    expect(clock.now().toISOString()).toBe("2026-09-09T03:00:00.000Z");
  });
});
