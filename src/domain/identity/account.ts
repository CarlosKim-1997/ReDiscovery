import { z } from "zod";

export const externalSubjectSchema = z.string().min(1).max(255).refine(value => value.trim().length > 0 && !value.includes("\u0000"));
export const identityIdSchema = z.uuid();

export interface Account {
  readonly id: string;
  readonly externalSubject: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SessionAccountOwnership {
  readonly sessionId: string;
  readonly anonymousDeviceId: string;
  readonly attemptType: string;
  readonly accountId?: string;
  readonly accountClaimedAt?: Date;
}

export type SessionClaimRejection = "SESSION_NOT_FOUND" | "NOT_CURRENT_DEVICE_SESSION" | "NOT_OFFICIAL" | "OWNED_BY_ANOTHER_ACCOUNT";
export type SessionClaimResult =
  | { readonly kind: "CLAIMED" | "ALREADY_CLAIMED_BY_ACCOUNT"; readonly ownership: SessionAccountOwnership }
  | { readonly kind: SessionClaimRejection | "ACCOUNT_NOT_FOUND" };

// Status is intentionally irrelevant: possession of the explicit official session
// permits claiming before, during or after Reveal, never historical discovery.
export function sessionClaimDecision(session: SessionAccountOwnership | undefined, accountId: string, deviceId: string): SessionClaimRejection | "CLAIMED" | "ALREADY_CLAIMED_BY_ACCOUNT" {
  if (!session) return "SESSION_NOT_FOUND";
  if (session.anonymousDeviceId !== deviceId) return "NOT_CURRENT_DEVICE_SESSION";
  if (session.attemptType !== "OFFICIAL") return "NOT_OFFICIAL";
  if (session.accountId && session.accountId !== accountId) return "OWNED_BY_ANOTHER_ACCOUNT";
  return session.accountId ? "ALREADY_CLAIMED_BY_ACCOUNT" : "CLAIMED";
}
