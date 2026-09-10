import { FixedClock } from "@/adapters/fixed-clock/fixed-clock";
import { SystemClock } from "@/adapters/system-clock/system-clock";
import type { ServerConfig } from "@/config/schema";
import type { ClockPort } from "@/ports/clock";

type ClockConfig = Pick<ServerConfig, "APP_ENV" | "TEST_FIXED_NOW">;

export function makeClock(config: ClockConfig): ClockPort {
  if (config.APP_ENV === "test" && config.TEST_FIXED_NOW) {
    return new FixedClock(new Date(config.TEST_FIXED_NOW));
  }

  return new SystemClock();
}
