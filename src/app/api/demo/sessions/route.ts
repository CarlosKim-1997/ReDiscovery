import { randomUUID } from "node:crypto";
import { startDemoSession } from "@/application/play/demo-game";
import { PUBLIC_DEMO_DAILY } from "@/application/play/demo-content";
import { services } from "@/server/container";
import { apiError, noStore } from "../_shared";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await startDemoSession(services, randomUUID());
    return noStore({ daily: PUBLIC_DEMO_DAILY, session }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
