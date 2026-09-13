import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticationDependencies, authConfiguration } from "@/server/auth";
import { completeAuthentication } from "@/application/identity/authentication";
import { PENDING_CLAIM_COOKIE, readPendingClaim } from "@/server/auth";
import { currentDevice } from "../../api/_device";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const jar = await cookies(); const configuration = authConfiguration();
  try {
    if (!configuration) return Response.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
    const query = new URL(request.url).searchParams;
    if (query.has("error") || query.has("returnTo")) throw new Error("AUTH_CALLBACK_FAILED");
    const deps = await authenticationDependencies();
    const pending = readPendingClaim(jar.get(PENDING_CLAIM_COOKIE)?.value, deps.clock.now(), configuration.secret);
    const device = await currentDevice();
    const result = await completeAuthentication(deps, query.get("code") ?? undefined, pending, device.id);
    const destination = new URL(result.destination, configuration.origin);
    destination.searchParams.set("auth", result.claimRequested && !result.claimApplied ? "claim_not_applied" : "signed_in");
    return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return configuration ? NextResponse.redirect(`${configuration.origin}/?auth=failed`, { status: 303, headers: { "Cache-Control": "private, no-store" } }) : Response.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
  } finally { jar.delete(PENDING_CLAIM_COOKIE); }
}
