import type { ClockPort } from "@/ports/clock";

export class FixedClock implements ClockPort {
  private readonly fixedTime: number;

  constructor(fixed: Date) {
    this.fixedTime = fixed.getTime();
  }

  now(): Date {
    return new Date(this.fixedTime);
  }
}
