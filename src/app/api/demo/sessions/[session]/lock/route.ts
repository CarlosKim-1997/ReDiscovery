import { lockThought } from "@/application/play/demo-game";
import { services } from "@/server/container";
import { apiError, noStore } from "../../../_shared";

export async function POST(_request: Request, { params }: { params: Promise<{ session: string }> }) {
  try {
    const { session: id } = await params;
    const session = await lockThought(services, id);
    return session ? noStore({ session }) : noStore({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
