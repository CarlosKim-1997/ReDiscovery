import { createHmac, timingSafeEqual } from "node:crypto";
import { identityIdSchema } from "@/domain/identity/account";

export const PENDING_CLAIM_COOKIE = "g1_pending_claim";
export const PENDING_CLAIM_MAX_AGE = 600;
export function sealPendingClaim(sessionId: string, at: Date, secret: string) {
  const payload = Buffer.from(JSON.stringify({ sessionId: identityIdSchema.parse(sessionId), expiresAt: at.getTime() + PENDING_CLAIM_MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function readPendingClaim(value: string | undefined, at: Date, secret: string): string | undefined {
  if (!value || value.length > 512) return undefined;
  try {
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra) return undefined;
    const expected = createHmac("sha256", secret).update(payload).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return undefined;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= at.getTime() || parsed.expiresAt > at.getTime() + PENDING_CLAIM_MAX_AGE * 1000) return undefined;
    return identityIdSchema.parse(parsed.sessionId);
  } catch { return undefined; }
}
