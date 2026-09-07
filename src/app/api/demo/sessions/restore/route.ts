import { z } from "zod";
import { restoreDemoSession } from "@/application/play/demo-game";
import { PUBLIC_DEMO_DAILY } from "@/application/play/demo-content";
import { services } from "@/server/container";
import { apiError, noStore } from "../../_shared";

const snapshotSchema = z.object({
  id: z.string().uuid(),
  thoughts: z.array(z.string().min(1).max(2_000)).max(2),
  status: z.enum(["THINKING", "LOCKABLE", "LOCKED", "REVEALED"]),
});

export async function POST(request: Request) {
  try {
    const snapshot = snapshotSchema.parse(await request.json());
    const session = await restoreDemoSession(services, snapshot);
    return noStore({ daily: PUBLIC_DEMO_DAILY, session });
  } catch (error) {
    return apiError(error);
  }
}
