import { getDemoSession } from "@/application/play/demo-game";
import { PUBLIC_DEMO_DAILY } from "@/application/play/demo-content";
import { services } from "@/server/container";
import { apiError, noStore } from "../../_shared";

export async function GET(_request: Request, { params }: { params: Promise<{ session: string }> }) {
  try {
    const { session: id } = await params;
    const session = await getDemoSession(services, id);
    return session ? noStore({ daily: PUBLIC_DEMO_DAILY, session }) : noStore({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
