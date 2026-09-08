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
}).strict().superRefine((content, context) => {
  const ids = content.JUDGE_RUBRIC.nodes.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["JUDGE_RUBRIC", "nodes"], message: "Duplicate node IDs" });
  for (const [field, values] of [["required_nodes", content.SERVER_POLICY.required_nodes], ["blocking_nodes", content.SERVER_POLICY.blocking_nodes]] as const) {
    for (const value of values) if (!ids.includes(value)) context.addIssue({ code: "custom", path: ["SERVER_POLICY", field], message: `Unknown node: ${value}` });
  }
  if (content.SERVER_POLICY.lock_threshold > content.SERVER_POLICY.required_nodes.length) {
    context.addIssue({ code: "custom", path: ["SERVER_POLICY", "lock_threshold"], message: "Threshold exceeds required node count" });
  }
  const forbidden = [content.REVEAL_CONTENT.theory, content.REVEAL_CONTENT.person, content.REVEAL_CONTENT.year, ...(content.SERVER_POLICY.recognition_aliases ?? [])];
  for (const [layer, value] of [["PUBLIC_PLAY", content.PUBLIC_PLAY], ["JUDGE_RUBRIC", content.JUDGE_RUBRIC]] as const) {
    const serialized = JSON.stringify(value).toLocaleLowerCase("en-US");
    for (const identity of forbidden) if (serialized.includes(identity.toLocaleLowerCase("en-US"))) {
      context.addIssue({ code: "custom", path: [layer], message: `${layer} leaks Reveal identity or recognition value` });
    }
  }
});

const scheduleEntrySchema = z.object({
  canonical_date: z.iso.date(), sequence_number: z.number().int().positive(), release_at: z.iso.datetime(),
  content: z.object({ slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/), version: z.number().int().positive() }).strict(),
}).strict();

export const dailyScheduleSchema = z.object({ schema_version: z.literal(1), entries: z.array(scheduleEntrySchema).min(1) }).strict().superRefine(({ entries }, context) => {
  const dates = entries.map((entry) => entry.canonical_date);
  const sequences = entries.map((entry) => entry.sequence_number);
  if (new Set(dates).size !== dates.length) context.addIssue({ code: "custom", path: ["entries"], message: "Duplicate canonical_date" });
  if (new Set(sequences).size !== sequences.length) context.addIssue({ code: "custom", path: ["entries"], message: "Duplicate sequence_number" });
});

export type ApprovedContent = Readonly<z.infer<typeof approvedContentSchema>>;
export type DailySchedule = Readonly<z.infer<typeof dailyScheduleSchema>>;
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
