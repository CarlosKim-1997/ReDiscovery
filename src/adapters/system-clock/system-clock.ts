import type { ClockPort } from "@/ports/clock";

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
