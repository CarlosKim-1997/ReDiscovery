/** Canonical wire/storage vocabulary from G1 Master Packet §9. */
export const COMPARISON_STATUSES = Object.freeze([
  "NOT_REQUESTED",
  "PENDING",
  "READY",
  "FALLBACK_USED",
  "FAILED",
] as const);
export type ComparisonStatus = (typeof COMPARISON_STATUSES)[number];
