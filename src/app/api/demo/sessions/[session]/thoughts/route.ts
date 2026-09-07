import { z } from "zod";
import { submitThought } from "@/application/play/demo-game";
import { services } from "@/server/container";
import { apiError, noStore } from "../../../_shared";

const bodySchema = z.object({ thought: z.string().trim().min(1).max(2_000) });

export async function POST(request: Request, { params }: { params: Promise<{ session: string }> }) {
  try {
    const { session: id } = await params;
    const { thought } = bodySchema.parse(await request.json());
    const result = await submitThought(services, id, thought);
    return result ? noStore(result) : noStore({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
