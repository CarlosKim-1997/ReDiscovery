/** Server time. Tests inject a fixed clock; callers never read the host clock. */
export interface ClockPort {
  now(): Date;
}
