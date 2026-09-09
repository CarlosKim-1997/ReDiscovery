import { buildLockEvidenceUnits } from "@/application/play/lock-evidence-units";
import type {
  LockEvidenceUnit,
  LockVerifierV2Input,
  UnvalidatedLockProof,
  UnvalidatedNodeProof,
} from "@/ports/lock-verifier-v2";
import {
  LockProofV2ValidationError,
  validateLockProofV2Structure,
} from "@/ports/lock-verifier-v2";

export { LockProofV2ValidationError } from "@/ports/lock-verifier-v2";

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

export function deriveLockVerificationFromProof(
  raw: UnvalidatedLockProof,
  input: LockVerifierV2Input,
): DerivedLockVerification {
  validateInputEvidenceUnits(input);
  validateLockProofV2Structure(raw, input);
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
  if (JSON.stringify(expected) !== JSON.stringify(input.evidenceUnits)) {
    throw new LockProofV2ValidationError("EVIDENCE_UNIT_INVALID");
  }
}

function deriveNode(
  node: UnvalidatedNodeProof,
  units: ReadonlyMap<string, LockEvidenceUnit>,
): DerivedLockVerification["nodes"][number] {
  const evidence = resolveUnits(node.evidenceUnitIds, units);
  const antecedentEvidence = resolveUnits(node.antecedentEvidenceUnitIds, units);
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
  return ids.map((id) => units.get(id)!);
}

function toEvidenceReference(unit: LockEvidenceUnit) {
  return { unitId: unit.unitId, answerId: unit.answerId, start: unit.start, end: unit.end };
}
