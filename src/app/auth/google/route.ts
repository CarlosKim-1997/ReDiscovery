import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticationDependencies, authConfiguration, requireSameOrigin } from "@/server/auth";
import { validateClaimIntent } from "@/application/identity/authentication";
import { sealPendingClaim, PENDING_CLAIM_COOKIE, PENDING_CLAIM_MAX_AGE } from "@/server/auth";
import { currentDevice } from "../../api/_device";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const configuration = authConfiguration();
  if (!configuration) return Response.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
  const jar = await cookies();
  try {
    requireSameOrigin(request, configuration.origin);
    jar.delete(PENDING_CLAIM_COOKIE);
    const form = await request.formData();
    if (form.has("returnTo")) throw new Error("INVALID_RETURN_DESTINATION");
    const deps = await authenticationDependencies();
    const intent = form.get("sessionId");
    const device = intent === null ? undefined : await currentDevice();
    if (intent !== null && !device) throw new Error("INVALID_CURRENT_SESSION");
    const sessionId = intent === null ? undefined : await validateClaimIntent(deps, String(intent), device!.id);
    const destination = await deps.auth.startGoogleLogin(`${configuration.origin}/auth/callback`);
    const oauthUrl = new URL(destination);
    if (oauthUrl.origin !== new URL(configuration.url).origin || oauthUrl.pathname !== "/auth/v1/authorize" || oauthUrl.searchParams.get("provider") !== "google") throw new Error("AUTH_START_FAILED");
    if (sessionId) jar.set(PENDING_CLAIM_COOKIE, sealPendingClaim(sessionId, deps.clock.now(), configuration.secret), { httpOnly: true, sameSite: "lax", secure: configuration.origin.startsWith("https://"), path: "/", maxAge: PENDING_CLAIM_MAX_AGE });
    return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    jar.delete(PENDING_CLAIM_COOKIE);
    return Response.json({ error: "AUTH_START_REJECTED" }, { status: 400 });
  }
}
