import { authenticatedAccount, optionalCurrentSessionId } from "@/application/identity/authentication";
import { authenticationDependencies, authConfiguration } from "@/server/auth";
import { currentDevice } from "../../_device";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!authConfiguration()) return Response.json({ configured: false, authenticated: false, error: "AUTH_NOT_CONFIGURED" }, { headers });
  try {
    const deps = await authenticationDependencies(); const account = await authenticatedAccount(deps);
    if (!account) return Response.json({ configured: true, authenticated: false }, { headers });
    const id = optionalCurrentSessionId(new URL(request.url).searchParams.get("sessionId"));
    const device = id.success ? await currentDevice() : undefined;
    const session = id.success && device ? await deps.store.getOwnedSession(id.data, device.id) : undefined;
    return Response.json({ configured: true, authenticated: true, account: { id: account.id }, currentSessionClaimed: session?.accountId === account.id }, { headers });
  } catch { return Response.json({ error: "AUTH_STATUS_UNAVAILABLE" }, { status: 503, headers }); }
}
