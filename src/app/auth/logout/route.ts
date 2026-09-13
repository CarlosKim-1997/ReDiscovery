import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticationDependencies, authConfiguration, requireSameOrigin } from "@/server/auth";
import { PENDING_CLAIM_COOKIE } from "@/server/auth";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const configuration = authConfiguration();
  if (!configuration) return Response.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
  try {
    requireSameOrigin(request, configuration.origin);
    const deps = await authenticationDependencies(); await deps.auth.logout();
    (await cookies()).delete(PENDING_CLAIM_COOKIE);
    return NextResponse.redirect(configuration.origin, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "AUTH_LOGOUT_FAILED" }, { status: 400 }); }
}
