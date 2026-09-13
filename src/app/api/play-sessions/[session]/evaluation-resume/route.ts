import { z } from "zod";
import { AdaptiveEvaluationPausedError, resumeAdaptiveEvaluation, SemanticAiUnavailableError } from "@/application/play/adaptive-evaluation";
import { services } from "@/server/container";
import { currentDevice } from "../../../_device";

export const runtime = "nodejs";
const body = z.object({ submissionId: z.uuid(), expectedStateVersion: z.number().int().nonnegative() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ session: string }> }) {
  try {
    const device = await currentDevice();if (!device) return Response.json({error:"SESSION_NOT_FOUND"},{status:404,headers:{"Cache-Control":"no-store"}});
    const input = body.parse(await request.json());
    const result = await resumeAdaptiveEvaluation(services, device.id, (await params).session, input.submissionId,input.expectedStateVersion);
    return Response.json(result ?? { error: "SESSION_NOT_FOUND" }, { status: result ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AdaptiveEvaluationPausedError) return Response.json({ error: error.message, session: error.session }, { status: 503 });
    if (error instanceof SemanticAiUnavailableError) return Response.json({ error: "SEMANTIC_AI_UNAVAILABLE" }, { status: 503 });
    const code = error instanceof Error && ["INVALID_SESSION_STATE", "STALE_STATE_VERSION","RECOVERY_EXHAUSTED","STALE_JUDGE_EXECUTION"].includes(error.message) ? error.message : "INVALID_REQUEST";
    return Response.json({ error: code }, { status: 409 });
  }
}
