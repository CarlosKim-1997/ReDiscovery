import { z } from "zod";

export const FINAL_SYNTHESIS_PROOF_CONTRACT_VERSION = "final-synthesis-proof-v1" as const;

export const FINAL_SYNTHESIS_ENDORSEMENT_STATUSES = [
  "ENDORSED",
  "REJECTED_OR_QUOTED",
  "CONTRADICTED_OR_REPLACED",
  "MIXED_OR_UNRESOLVED",
] as const;
export type FinalSynthesisEndorsementStatus = (typeof FINAL_SYNTHESIS_ENDORSEMENT_STATUSES)[number];

export const FINAL_SYNTHESIS_REFERENCE_STATUSES = [
  "SELF_CONTAINED",
  "RESOLVED_WITHIN_SYNTHESIS",
  "UNRESOLVED",
  "AMBIGUOUS",
] as const;
export type FinalSynthesisReferenceStatus = (typeof FINAL_SYNTHESIS_REFERENCE_STATUSES)[number];

export const FINAL_SYNTHESIS_COMPONENT_MATCHES = [
  "COMPLETE_COMPONENT_MATCH",
  "WEAKER_THAN_COMPONENT_REQUIREMENT",
  "PARTIAL_COMPONENT_MATCH",
  "CONTRADICTS_COMPONENT",
  "NO_COMPONENT_SUPPORT",
] as const;
export type FinalSynthesisComponentMatch = (typeof FINAL_SYNTHESIS_COMPONENT_MATCHES)[number];

export interface FinalSynthesisEvidenceUnit {
  readonly unitId: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface FinalSynthesisVerifierInput {
  readonly requiredNodes: readonly {
    readonly nodeId: string;
    readonly requiredComponents: readonly {
      readonly componentId: string;
      readonly description: string;
    }[];
  }[];
  readonly submission: Readonly<{ text: string }>;
  readonly evidenceUnits: readonly FinalSynthesisEvidenceUnit[];
}

const componentProofSchema = z.object({
  componentId: z.string().min(1),
  endorsementStatus: z.enum(FINAL_SYNTHESIS_ENDORSEMENT_STATUSES),
  referenceStatus: z.enum(FINAL_SYNTHESIS_REFERENCE_STATUSES),
  componentMatch: z.enum(FINAL_SYNTHESIS_COMPONENT_MATCHES),
  evidenceUnitIds: z.array(z.string().min(1)),
  antecedentEvidenceUnitIds: z.array(z.string().min(1)),
}).strict();

const nodeProofSchema = z.object({
  nodeId: z.string().min(1),
  components: z.array(componentProofSchema),
}).strict();

export const finalSynthesisProofSchema = z.object({
  nodes: z.array(nodeProofSchema),
}).strict();

export type UnvalidatedFinalSynthesisComponentProof = z.infer<typeof componentProofSchema>;
export type UnvalidatedFinalSynthesisProof = z.infer<typeof finalSynthesisProofSchema>;

export const FINAL_SYNTHESIS_PROOF_FAILURE_CATEGORIES = [
  "PROOF_SHAPE_INVALID",
  "NODE_SET_INVALID",
  "PROOF_RECORD_INVALID",
  "EVIDENCE_UNIT_INVALID",
] as const;
export type FinalSynthesisProofFailureCategory = (typeof FINAL_SYNTHESIS_PROOF_FAILURE_CATEGORIES)[number];

export const FINAL_SYNTHESIS_PROOF_VALIDATION_REASONS = [
  "PROOF_SHAPE_INVALID",
  "DUPLICATE_REQUIRED_NODE_ID",
  "DUPLICATE_REQUIRED_COMPONENT_ID",
  "DUPLICATE_NODE_ID",
  "UNKNOWN_NODE",
  "MISSING_NODE",
  "DUPLICATE_COMPONENT_ID",
  "UNKNOWN_COMPONENT",
  "MISSING_COMPONENT",
  "DUPLICATE_INPUT_EVIDENCE_UNIT_ID",
  "DUPLICATE_EVIDENCE_UNIT_ID",
  "DUPLICATE_ANTECEDENT_EVIDENCE_UNIT_ID",
  "UNKNOWN_EVIDENCE_UNIT",
  "EVIDENCE_ANTECEDENT_OVERLAP",
  "COMPLETE_MATCH_EVIDENCE_REQUIRED",
  "SELF_CONTAINED_ANTECEDENT_FORBIDDEN",
  "NON_RESOLVED_ANTECEDENT_FORBIDDEN",
  "RESOLVED_EVIDENCE_REQUIRED",
  "RESOLVED_ANTECEDENT_REQUIRED",
  "ANTECEDENT_NOT_EARLIER",
  "EVIDENCE_UNIT_SPAN_MISMATCH",
  "EVIDENCE_UNIT_LIST_MISMATCH",
] as const;
export type FinalSynthesisProofValidationReason = (typeof FINAL_SYNTHESIS_PROOF_VALIDATION_REASONS)[number];

export class FinalSynthesisProofValidationError extends Error {
  constructor(
    readonly category: FinalSynthesisProofFailureCategory,
    readonly reason: FinalSynthesisProofValidationReason,
  ) {
    super(`${category}:${reason}`);
  }
}

export function validateFinalSynthesisProofStructure(
  candidate: unknown,
  input: FinalSynthesisVerifierInput,
): UnvalidatedFinalSynthesisProof {
  const parsed = finalSynthesisProofSchema.safeParse(candidate);
  if (!parsed.success) fail("PROOF_SHAPE_INVALID", "PROOF_SHAPE_INVALID");
  const proof = parsed.data;

  const requiredNodeIds = input.requiredNodes.map(({ nodeId }) => nodeId);
  if (new Set(requiredNodeIds).size !== requiredNodeIds.length) {
    fail("NODE_SET_INVALID", "DUPLICATE_REQUIRED_NODE_ID");
  }
  const expectedNodes = new Map(input.requiredNodes.map((node) => [node.nodeId, node]));
  for (const node of input.requiredNodes) {
    const componentIds = node.requiredComponents.map(({ componentId }) => componentId);
    if (new Set(componentIds).size !== componentIds.length) {
      fail("PROOF_RECORD_INVALID", "DUPLICATE_REQUIRED_COMPONENT_ID");
    }
  }

  const actualNodeIds = proof.nodes.map(({ nodeId }) => nodeId);
  if (new Set(actualNodeIds).size !== actualNodeIds.length) fail("NODE_SET_INVALID", "DUPLICATE_NODE_ID");
  if (actualNodeIds.some((id) => !expectedNodes.has(id))) fail("NODE_SET_INVALID", "UNKNOWN_NODE");
  if (requiredNodeIds.some((id) => !actualNodeIds.includes(id))) fail("NODE_SET_INVALID", "MISSING_NODE");

  const units = new Map(input.evidenceUnits.map((unit) => [unit.unitId, unit]));
  if (units.size !== input.evidenceUnits.length) {
    fail("EVIDENCE_UNIT_INVALID", "DUPLICATE_INPUT_EVIDENCE_UNIT_ID");
  }
  for (const unit of input.evidenceUnits) {
    if (input.submission.text.slice(unit.start, unit.end) !== unit.text) {
      fail("EVIDENCE_UNIT_INVALID", "EVIDENCE_UNIT_SPAN_MISMATCH");
    }
  }

  for (const node of proof.nodes) {
    const expectedNode = expectedNodes.get(node.nodeId)!;
    const expectedComponents = new Set(expectedNode.requiredComponents.map(({ componentId }) => componentId));
    const actualComponentIds = node.components.map(({ componentId }) => componentId);
    if (new Set(actualComponentIds).size !== actualComponentIds.length) fail("PROOF_RECORD_INVALID", "DUPLICATE_COMPONENT_ID");
    if (actualComponentIds.some((id) => !expectedComponents.has(id))) fail("PROOF_RECORD_INVALID", "UNKNOWN_COMPONENT");
    if ([...expectedComponents].some((id) => !actualComponentIds.includes(id))) fail("PROOF_RECORD_INVALID", "MISSING_COMPONENT");
    for (const component of node.components) validateComponent(component, units);
  }

  return proof;
}

function validateComponent(
  component: UnvalidatedFinalSynthesisComponentProof,
  units: ReadonlyMap<string, FinalSynthesisEvidenceUnit>,
) {
  if (new Set(component.evidenceUnitIds).size !== component.evidenceUnitIds.length) {
    fail("PROOF_RECORD_INVALID", "DUPLICATE_EVIDENCE_UNIT_ID");
  }
  if (new Set(component.antecedentEvidenceUnitIds).size !== component.antecedentEvidenceUnitIds.length) {
    fail("PROOF_RECORD_INVALID", "DUPLICATE_ANTECEDENT_EVIDENCE_UNIT_ID");
  }
  if (component.evidenceUnitIds.some((id) => component.antecedentEvidenceUnitIds.includes(id))) {
    fail("PROOF_RECORD_INVALID", "EVIDENCE_ANTECEDENT_OVERLAP");
  }
  const evidence = resolveUnits(component.evidenceUnitIds, units);
  const antecedents = resolveUnits(component.antecedentEvidenceUnitIds, units);
  if (component.componentMatch === "COMPLETE_COMPONENT_MATCH" && evidence.length === 0) {
    fail("PROOF_RECORD_INVALID", "COMPLETE_MATCH_EVIDENCE_REQUIRED");
  }

  if (component.referenceStatus === "SELF_CONTAINED") {
    if (antecedents.length > 0) fail("PROOF_RECORD_INVALID", "SELF_CONTAINED_ANTECEDENT_FORBIDDEN");
    return;
  }
  if (component.referenceStatus !== "RESOLVED_WITHIN_SYNTHESIS") {
    if (antecedents.length > 0) fail("PROOF_RECORD_INVALID", "NON_RESOLVED_ANTECEDENT_FORBIDDEN");
    return;
  }
  if (evidence.length === 0) fail("PROOF_RECORD_INVALID", "RESOLVED_EVIDENCE_REQUIRED");
  if (antecedents.length === 0) fail("PROOF_RECORD_INVALID", "RESOLVED_ANTECEDENT_REQUIRED");
  const firstReferring = [...evidence].sort(compareUnits)[0]!;
  if (antecedents.some((unit) => compareUnits(unit, firstReferring) >= 0)) {
    fail("PROOF_RECORD_INVALID", "ANTECEDENT_NOT_EARLIER");
  }
}

function compareUnits(left: FinalSynthesisEvidenceUnit, right: FinalSynthesisEvidenceUnit) {
  const byStart = left.start - right.start;
  return byStart !== 0 ? byStart : left.end - right.end;
}

function resolveUnits(
  ids: readonly string[],
  units: ReadonlyMap<string, FinalSynthesisEvidenceUnit>,
) {
  return ids.map((id) => {
    const unit = units.get(id);
    if (!unit) fail("EVIDENCE_UNIT_INVALID", "UNKNOWN_EVIDENCE_UNIT");
    return unit;
  });
}

function fail(
  category: FinalSynthesisProofFailureCategory,
  reason: FinalSynthesisProofValidationReason,
): never {
  throw new FinalSynthesisProofValidationError(category, reason);
}

export interface FinalSynthesisVerifierPort {
  extractProof(input: FinalSynthesisVerifierInput): Promise<UnvalidatedFinalSynthesisProof>;
}
