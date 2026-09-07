import { getHealth } from "@/application/system/get-health";
import { services } from "@/server/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getHealth(services.clock), {
    headers: { "Cache-Control": "no-store" },
  });
}
