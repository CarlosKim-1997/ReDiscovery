import { buildLockEvidenceUnits } from "@/application/play/lock-evidence-units";
import type {
  LockEvidenceUnit,
  LockVerifierV2FailureCategory,
  LockVerifierV2Input,
  UnvalidatedLockProof,
  UnvalidatedNodeProof,
} from "@/ports/lock-verifier-v2";

export type DerivedLockVerification = Readonly<{
  nodes: readonly (
    | Readonly<{ nodeId: string; support: "INSUFFICIENT" }>
    | Readonly<{
      nodeId: string;
      support: "VERIFIED";
      evidence: readonly Readonly<{ unitId: string; answerId: string; start: number; end: number }>[];
      antecedentEvidence: readonly Readonly<{ unitId: string; answerId: string; start: number; end: number }>[];
    }>
  )[];
}>;

export class LockProofV2ValidationError extends Error {
  constructor(readonly category: LockVerifierV2FailureCategory) {
    super(category);
  }
}

export function deriveLockVerificationFromProof(
  raw: UnvalidatedLockProof,
  input: LockVerifierV2Input,
): DerivedLockVerification {
  validateInputEvidenceUnits(input);
  validateNodeSet(raw, input);
  const units = new Map(input.evidenceUnits.map((unit) => [unit.unitId, unit]));

  return {
    nodes: raw.nodes.map((node) => deriveNode(node, units)),
  };
}

export function isDerivedLockVerificationApproved(verification: DerivedLockVerification): boolean {
  return verification.nodes.every(({ support }) => support === "VERIFIED");
}

function validateInputEvidenceUnits(input: LockVerifierV2Input) {
  const expected = buildLockEvidenceUnits(input.answers);
  if (JSON.stringify(expected) !== JSON.stringify(input.evidenceUnits)) fail("EVIDENCE_UNIT_INVALID");
}

function validateNodeSet(raw: UnvalidatedLockProof, input: LockVerifierV2Input) {
  const expected = input.requiredNodes.map(({ nodeId }) => nodeId);
  const actual = raw.nodes.map(({ nodeId }) => nodeId);
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) fail("NODE_SET_INVALID");
  if (actual.some((id) => !expected.includes(id)) || expected.some((id) => !actual.includes(id))) fail("NODE_SET_INVALID");
}

function deriveNode(
  node: UnvalidatedNodeProof,
  units: ReadonlyMap<string, LockEvidenceUnit>,
): DerivedLockVerification["nodes"][number] {
  if (new Set(node.evidenceUnitIds).size !== node.evidenceUnitIds.length) fail("PROOF_RECORD_INVALID");
  if (new Set(node.antecedentEvidenceUnitIds).size !== node.antecedentEvidenceUnitIds.length) fail("PROOF_RECORD_INVALID");
  const evidence = resolveUnits(node.evidenceUnitIds, units);
  const antecedentEvidence = resolveUnits(node.antecedentEvidenceUnitIds, units);

  if (node.referenceStatus === "UNIQUE_WITHIN_SUPPLIED_ANSWERS") {
    if (evidence.length === 0 || antecedentEvidence.length === 0) fail("PROOF_RECORD_INVALID");
    if (node.evidenceUnitIds.some((id) => node.antecedentEvidenceUnitIds.includes(id))) fail("PROOF_RECORD_INVALID");
    const referringAnswers = new Set(evidence.map(({ answerId }) => answerId));
    if (!antecedentEvidence.some(({ answerId }) => !referringAnswers.has(answerId))) fail("PROOF_RECORD_INVALID");
  } else if (antecedentEvidence.length > 0) {
    fail("PROOF_RECORD_INVALID");
  }

  if (node.semanticMatch === "COMPLETE_NODE_MATCH" && evidence.length === 0) fail("PROOF_RECORD_INVALID");
  const verified = node.endorsementStatus === "ENDORSED"
    && (node.referenceStatus === "SELF_CONTAINED" || node.referenceStatus === "UNIQUE_WITHIN_SUPPLIED_ANSWERS")
    && node.semanticMatch === "COMPLETE_NODE_MATCH";

  if (!verified) return { nodeId: node.nodeId, support: "INSUFFICIENT" };
  return {
    nodeId: node.nodeId,
    support: "VERIFIED",
    evidence: evidence.map(toEvidenceReference),
    antecedentEvidence: antecedentEvidence.map(toEvidenceReference),
  };
}

function resolveUnits(ids: readonly string[], units: ReadonlyMap<string, LockEvidenceUnit>): LockEvidenceUnit[] {
  return ids.map((id) => {
    const unit = units.get(id);
    if (!unit) fail("EVIDENCE_UNIT_INVALID");
    return unit;
  });
}

function toEvidenceReference(unit: LockEvidenceUnit) {
  return { unitId: unit.unitId, answerId: unit.answerId, start: unit.start, end: unit.end };
}

function fail(category: LockVerifierV2FailureCategory): never {
  throw new LockProofV2ValidationError(category);
}
