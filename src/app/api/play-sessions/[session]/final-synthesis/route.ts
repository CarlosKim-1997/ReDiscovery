import { FinalSynthesisApplicationError, submitFinalSynthesis } from "@/application/play/final-synthesis";
import { getOwned } from "@/application/play/daily-game";
import { FinalSynthesisExecutionError } from "@/ports/final-synthesis-verifier";
import { services } from "@/server/container";
import { currentDevice } from "../../../_device";
import { z } from "zod";

const body = z.object({ text: z.string().min(1), expectedStateVersion: z.number().int().nonnegative() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ session: string }> }) {
  try {
    const device = await currentDevice();
    const sessionId = (await params).session;
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.length > 200) return failure("INVALID_REQUEST", 400);
    const parsed = body.parse(await request.json());
    const deps = { ...services, verifier: services.finalSynthesisVerifier };
    await submitFinalSynthesis(deps, { deviceId: device.id, sessionId, idempotencyKey, ...parsed });
    const payload = await getOwned(services, device.id, sessionId);
    return Response.json(payload ?? { error: "SESSION_NOT_FOUND" }, { status: payload ? 200 : 404 });
  } catch (error) {
    return synthesisFailure(error);
  }
}

function synthesisFailure(error: unknown) {
  if (error instanceof FinalSynthesisExecutionError) return failure("FINAL_SYNTHESIS_UNAVAILABLE", 503);
  if (error instanceof FinalSynthesisApplicationError) {
    const status = error.code === "SESSION_NOT_FOUND" ? 404 : error.code === "INVALID_SYNTHESIS_TEXT" ? 400 : 409;
    return failure(error.code, status);
  }
  return failure("INVALID_REQUEST", 400);
}

function failure(error: string, status: number) { return Response.json({ error }, { status }); }
