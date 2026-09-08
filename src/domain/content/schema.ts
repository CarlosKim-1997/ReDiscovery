import { z } from "zod";

const nodeId = z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/);
const guidance = z.object({
  REFLECT: z.string().min(1), NUDGE: z.string().min(1),
  CORRECTION: z.string().min(1), RESCUE: z.string().min(1),
}).strict();

export const approvedContentSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  schema_version: z.number().int().positive(),
  status: z.literal("APPROVED"),
  approved_at: z.iso.datetime(),
  PUBLIC_PLAY: z.object({
    label: z.string().min(1), estimated_minutes: z.number().int().positive(),
    scenario: z.string().trim().min(1), question: z.string().trim().min(1),
  }).strict(),
  JUDGE_RUBRIC: z.object({
    discriminator: z.string().min(1),
    nodes: z.array(z.object({ id: nodeId, description: z.string().min(1) }).strict()).min(1),
    misconceptions: z.array(z.string().min(1)),
  }).strict(),
  SERVER_POLICY: z.object({
    max_turns: z.number().int().min(1).max(10),
    required_nodes: z.array(nodeId).min(1), blocking_nodes: z.array(nodeId),
    lock_threshold: z.number().int().positive(), guidance,
    recognition_aliases: z.array(z.string().min(1)).optional(),
  }).strict(),
  REVEAL_CONTENT: z.object({
    theory: z.string().min(1), person: z.string().min(1), year: z.string().min(1),
    explanation: z.string().min(1), connection: z.string().min(1),
    provenance: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  }).strict(),
  schedule: z.array(z.object({
    canonical_date: z.iso.date(), sequence_number: z.number().int().positive(), release_at: z.iso.datetime(),
  }).strict()).min(1),
}).strict().superRefine((content, context) => {
  const ids = content.JUDGE_RUBRIC.nodes.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["JUDGE_RUBRIC", "nodes"], message: "Duplicate node IDs" });
  for (const [field, values] of [["required_nodes", content.SERVER_POLICY.required_nodes], ["blocking_nodes", content.SERVER_POLICY.blocking_nodes]] as const) {
    for (const value of values) if (!ids.includes(value)) context.addIssue({ code: "custom", path: ["SERVER_POLICY", field], message: `Unknown node: ${value}` });
  }
  if (content.SERVER_POLICY.lock_threshold > content.SERVER_POLICY.required_nodes.length) {
    context.addIssue({ code: "custom", path: ["SERVER_POLICY", "lock_threshold"], message: "Threshold exceeds required node count" });
  }
  const forbidden = /conway|melvin|1968|콘웨이/i;
  if (forbidden.test(JSON.stringify(content.JUDGE_RUBRIC))) context.addIssue({ code: "custom", path: ["JUDGE_RUBRIC"], message: "Judge rubric leaks Reveal identity" });
});

export type ApprovedContent = Readonly<z.infer<typeof approvedContentSchema>>;
export type PublicPlay = ApprovedContent["PUBLIC_PLAY"];
export type JudgeRubric = ApprovedContent["JUDGE_RUBRIC"];
export type ServerPolicy = ApprovedContent["SERVER_POLICY"];
export type RevealContent = ApprovedContent["REVEAL_CONTENT"];

export interface ContentVersion {
  readonly id: string;
  readonly version: number;
  readonly schemaVersion: number;
  readonly contentHash: string;
  readonly publicPlay: PublicPlay;
  readonly judgeRubric: JudgeRubric;
  readonly serverPolicy: ServerPolicy;
  readonly revealContent: RevealContent;
}
