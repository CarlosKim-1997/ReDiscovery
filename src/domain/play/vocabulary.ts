/** Canonical wire/storage vocabulary from G1 Master Packet §9. No transitions. */
export const ATTEMPT_TYPES = Object.freeze([
  "OFFICIAL",
  "REPLAY",
  "PRACTICE",
] as const);
export type AttemptType = (typeof ATTEMPT_TYPES)[number];

export const PLAY_STATUSES = Object.freeze([
  "CREATED",
  "THINKING",
  "EVALUATING",
  "LOCKABLE",
  "SYNTHESIZING",
  "REVEAL_READY",
  "LOCKED",
  "REVEALED",
  "ERROR_RECOVERABLE",
  "ABUSE_BLOCKED",
] as const);
export type PlayStatus = (typeof PLAY_STATUSES)[number];

export const PLAY_STAGES = Object.freeze([
  "BLIND",
  "REFLECT",
  "NUDGE",
  "CORRECTION",
  "RESCUE",
] as const);
export type PlayStage = (typeof PLAY_STAGES)[number];

export const NODE_STATUSES = Object.freeze([
  "DISCOVERED",
  "PARTIAL",
  "ABSENT",
  "CONTRADICTED",
] as const);
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const ANSWER_TYPES = Object.freeze([
  "REASONING",
  "OFF_TOPIC",
  "ASKING_FOR_ANSWER",
  "META",
  "EMPTY",
] as const);
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const AMBIGUITIES = Object.freeze([
  "NONE",
  "TOO_SHORT",
  "UNCLEAR_REFERENCE",
  "CONFLICTING_CLAIMS",
  "SEMANTIC_BOUNDARY",
] as const);
export type Ambiguity = (typeof AMBIGUITIES)[number];
