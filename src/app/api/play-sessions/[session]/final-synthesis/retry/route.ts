import { FinalSynthesisApplicationError, retryCurrentFinalSynthesisEvaluation } from "@/application/play/final-synthesis";
import { getOwned } from "@/application/play/daily-game";
import { FinalSynthesisExecutionError } from "@/ports/final-synthesis-verifier";
import { services } from "@/server/container";
import { currentDevice } from "../../../../_device";
import { z } from "zod";

const body = z.object({ expectedStateVersion: z.number().int().nonnegative() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ session: string }> }) {
  try {
    const device = await currentDevice(); const sessionId = (await params).session; const parsed = body.parse(await request.json());
    await retryCurrentFinalSynthesisEvaluation({ ...services, verifier: services.finalSynthesisVerifier }, { deviceId: device.id, sessionId, ...parsed });
    const payload = await getOwned(services, device.id, sessionId);
    return Response.json(payload ?? { error: "SESSION_NOT_FOUND" }, { status: payload ? 200 : 404 });
  } catch (error) {
    if (error instanceof FinalSynthesisExecutionError) return Response.json({ error: "FINAL_SYNTHESIS_UNAVAILABLE" }, { status: 503 });
    if (error instanceof FinalSynthesisApplicationError) return Response.json({ error: error.code }, { status: error.code === "SESSION_NOT_FOUND" ? 404 : 409 });
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}
