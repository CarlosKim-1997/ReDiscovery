import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IdentityPort } from "@/ports/identity";

export class NodeIdentityAdapter implements IdentityPort {
  randomToken() { return randomBytes(32).toString("base64url"); }
  randomId() { return randomUUID(); }
  hashToken(token: string) { return createHash("sha256").update(token, "utf8").digest("hex"); }
}
