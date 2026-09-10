import { z } from "zod";

const nodeId = z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/);
const guidance = z.object({
  REFLECT: z.string().min(1), NUDGE: z.string().min(1),
  CORRECTION: z.string().min(1), RESCUE: z.string().min(1),
}).strict();

const lockVerifierPolicy = z.object({
  contract_version: z.literal("proof-components-v1"),
  nodes: z.array(z.object({
    node_id: nodeId,
    required_components: z.array(z.object({
      id: nodeId,
      description: z.string().trim().min(1),
    }).strict()).min(1),
  }).strict()).min(1),
}).strict();

const finalSynthesisPolicy = z.object({
  contract_version: z.literal("final-synthesis-v1"),
  max_chars: z.literal(500),
  max_submissions: z.literal(2),
}).strict();

const serverPolicyBase = {
  max_turns: z.number().int().min(1).max(10),
  required_nodes: z.array(nodeId).min(1),
  blocking_nodes: z.array(nodeId),
  lock_threshold: z.number().int().positive(),
  guidance,
  recognition_aliases: z.array(z.string().min(1)).optional(),
};

const commonContent = {
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
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
  REVEAL_CONTENT: z.object({
    theory: z.string().min(1), person: z.string().min(1), year: z.string().min(1),
    explanation: z.string().min(1), connection: z.string().min(1),
    provenance: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  }).strict(),
};

const historicalContentSchema = z.object({
  ...commonContent,
  schema_version: z.literal(1),
  SERVER_POLICY: z.object(serverPolicyBase).strict(),
}).strict();

const componentProofContentSchema = z.object({
  ...commonContent,
  schema_version: z.literal(2),
  SERVER_POLICY: z.object({ ...serverPolicyBase, lock_verifier: lockVerifierPolicy }).strict(),
}).strict();

const finalSynthesisContentSchema = z.object({
  ...commonContent,
  schema_version: z.literal(3),
  SERVER_POLICY: z.object({
    ...serverPolicyBase,
    lock_verifier: lockVerifierPolicy,
    final_synthesis: finalSynthesisPolicy,
  }).strict(),
}).strict();

export const approvedContentSchema = z.union([
  historicalContentSchema,
  componentProofContentSchema,
  finalSynthesisContentSchema,
]).superRefine((content, context) => {
  const ids = content.JUDGE_RUBRIC.nodes.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["JUDGE_RUBRIC", "nodes"], message: "Duplicate node IDs" });
  for (const [field, values] of [["required_nodes", content.SERVER_POLICY.required_nodes], ["blocking_nodes", content.SERVER_POLICY.blocking_nodes]] as const) {
    for (const value of values) if (!ids.includes(value)) context.addIssue({ code: "custom", path: ["SERVER_POLICY", field], message: `Unknown node: ${value}` });
  }
  if (content.SERVER_POLICY.lock_threshold > content.SERVER_POLICY.required_nodes.length) {
    context.addIssue({ code: "custom", path: ["SERVER_POLICY", "lock_threshold"], message: "Threshold exceeds required node count" });
  }
  if (content.schema_version === 2 || content.schema_version === 3) {
    const verifierNodes = content.SERVER_POLICY.lock_verifier.nodes;
    const verifierNodeIds = verifierNodes.map(({ node_id }) => node_id);
    if (new Set(verifierNodeIds).size !== verifierNodeIds.length) {
      context.addIssue({ code: "custom", path: ["SERVER_POLICY", "lock_verifier", "nodes"], message: "Duplicate verifier node IDs" });
    }
    for (const verifierNode of verifierNodes) {
      if (!ids.includes(verifierNode.node_id)) {
        context.addIssue({ code: "custom", path: ["SERVER_POLICY", "lock_verifier", "nodes"], message: `Unknown verifier node: ${verifierNode.node_id}` });
      }
      const componentIds = verifierNode.required_components.map(({ id }) => id);
      if (new Set(componentIds).size !== componentIds.length) {
        context.addIssue({ code: "custom", path: ["SERVER_POLICY", "lock_verifier", "nodes"], message: `Duplicate verifier component IDs for ${verifierNode.node_id}` });
      }
    }
    for (const requiredNode of content.SERVER_POLICY.required_nodes) {
      if (!verifierNodeIds.includes(requiredNode)) {
        context.addIssue({ code: "custom", path: ["SERVER_POLICY", "lock_verifier", "nodes"], message: `Missing verifier coverage: ${requiredNode}` });
      }
    }
    for (const verifierNode of verifierNodeIds) {
      if (!content.SERVER_POLICY.required_nodes.includes(verifierNode)) {
        context.addIssue({ code: "custom", path: ["SERVER_POLICY", "lock_verifier", "nodes"], message: `Verifier coverage is not required: ${verifierNode}` });
      }
    }
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
