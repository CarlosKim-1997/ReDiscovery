import type { JudgePort } from "@/ports/judge";
import type { PrimaryStorePort } from "@/ports/primary-store";
import { PlayRuleError } from "@/domain/play/errors";
import { applyJudgeVerdict, beginEvaluation, completeReveal, lockPlaySession } from "@/domain/play/policy";
import { createPlaySession } from "@/domain/play/session";
import { toPublicSessionView } from "./session-view";

export interface DemoGameDependencies {
  readonly judge: JudgePort;
  readonly store: PrimaryStorePort;
}

export async function startDemoSession(deps: DemoGameDependencies, id: string) {
  const existing = await deps.store.getSession(id);
  if (existing) return toPublicSessionView(existing);
  const session = createPlaySession(id);
  await deps.store.saveSession(session);
  return toPublicSessionView(session);
}

export async function getDemoSession(deps: DemoGameDependencies, id: string) {
  const session = await deps.store.getSession(id);
  return session ? toPublicSessionView(session) : undefined;
}

export async function submitThought(deps: DemoGameDependencies, id: string, text: string) {
  const session = await deps.store.getSession(id);
  if (!session) return undefined;
  if (text.length > 2_000) throw new Error("ANSWER_TOO_LONG");
  const thought = {
    id: `${session.id}:thought:${session.turnCount + 1}`,
    turn: session.turnCount + 1,
    stage: session.stage,
    text,
  } as const;
  const evaluating = beginEvaluation(session, thought);
  await deps.store.saveSession(evaluating);
  const lastGuidance = session.guidance.at(-1)?.text;
  const verdict = await deps.judge.evaluate({
    currentAnswer: text,
    priorConfirmedState: session.discoveries,
    ...(lastGuidance ? { lastGuidance } : {}),
  });
  for (const node of verdict.nodes) {
    if (node.status !== "ABSENT" && node.status !== "CONTRADICTED") {
      const evidence = node.evidence;
      if (!evidence || evidence.start < 0 || evidence.end > text.length || evidence.start >= evidence.end) {
        throw new Error("INVALID_JUDGE_EVIDENCE");
      }
    }
  }
  const result = applyJudgeVerdict(evaluating, verdict);
  await deps.store.saveSession(result.session);
  return { outcome: result.outcome, session: toPublicSessionView(result.session) };
}

export async function lockThought(deps: DemoGameDependencies, id: string) {
  const session = await deps.store.getSession(id);
  if (!session) return undefined;
  const locked = lockPlaySession(session);
  await deps.store.saveSession(locked);
  return toPublicSessionView(locked);
}

export async function completeDemoReveal(deps: DemoGameDependencies, id: string) {
  const session = await deps.store.getSession(id);
  if (!session) return undefined;
  const revealed = completeReveal(session);
  await deps.store.saveSession(revealed);
  return toPublicSessionView(revealed);
}

export async function restoreDemoSession(
  deps: DemoGameDependencies,
  snapshot: { readonly id: string; readonly thoughts: readonly string[]; readonly status: "THINKING" | "LOCKABLE" | "LOCKED" | "REVEALED" },
) {
  const existing = await deps.store.getSession(snapshot.id);
  if (existing) return toPublicSessionView(existing);
  await startDemoSession(deps, snapshot.id);
  for (const thought of snapshot.thoughts) {
    const current = await deps.store.getSession(snapshot.id);
    if (!current || current.status !== "THINKING") break;
    await submitThought(deps, snapshot.id, thought);
  }
  let current = await deps.store.getSession(snapshot.id);
  if (!current) return undefined;
  if ((snapshot.status === "LOCKED" || snapshot.status === "REVEALED") && current.status === "LOCKABLE") {
    await lockThought(deps, snapshot.id);
    current = await deps.store.getSession(snapshot.id) ?? current;
  }
  if (snapshot.status === "REVEALED" && current.status === "LOCKED") {
    await completeDemoReveal(deps, snapshot.id);
  }
  return getDemoSession(deps, snapshot.id);
}

export function isPlayRuleError(error: unknown): error is PlayRuleError {
  return error instanceof PlayRuleError;
}
