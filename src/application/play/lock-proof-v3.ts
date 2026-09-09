import { buildLockEvidenceUnits } from "@/application/play/lock-evidence-units";
import {
  LockProofV3ValidationError,
  validateLockProofV3Structure,
  type LockEvidenceUnitV3,
  type LockVerifierV3Input,
  type UnvalidatedComponentProof,
  type UnvalidatedLockProofV3,
} from "@/ports/lock-verifier-v3";

export { LockProofV3ValidationError } from "@/ports/lock-verifier-v3";

export interface DerivedComponentVerification {
  readonly componentId: string;
  readonly satisfied: boolean;
}

export interface DerivedLockVerificationV3 {
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly support: "VERIFIED" | "INSUFFICIENT";
    readonly components: readonly DerivedComponentVerification[];
  }[];
}

export function deriveLockVerificationFromProofV3(
  proof: UnvalidatedLockProofV3,
  input: LockVerifierV3Input,
): DerivedLockVerificationV3 {
  const expected = buildLockEvidenceUnits(input.answers);
  if (JSON.stringify(expected) !== JSON.stringify(input.evidenceUnits)) {
    throw new LockProofV3ValidationError("EVIDENCE_UNIT_INVALID", "EVIDENCE_UNIT_LIST_MISMATCH");
  }
  validateLockProofV3Structure(proof, input);
  return {
    nodes: proof.nodes.map((node) => {
      const components = node.components.map((component) => ({
        componentId: component.componentId,
        satisfied: componentSatisfied(component),
      }));
      return {
        nodeId: node.nodeId,
        support: components.every(({ satisfied }) => satisfied) ? "VERIFIED" as const : "INSUFFICIENT" as const,
        components,
      };
    }),
  };
}

export function isDerivedLockVerificationV3Approved(verification: DerivedLockVerificationV3) {
  return verification.nodes.every(({ support }) => support === "VERIFIED");
}

function componentSatisfied(component: UnvalidatedComponentProof) {
  return component.endorsementStatus === "ENDORSED"
    && (component.referenceStatus === "SELF_CONTAINED" || component.referenceStatus === "UNIQUE_WITHIN_SUPPLIED_EVIDENCE")
    && component.componentMatch === "COMPLETE_COMPONENT_MATCH";
}

export function toV3EvidenceUnits(units: ReturnType<typeof buildLockEvidenceUnits>): readonly LockEvidenceUnitV3[] {
  return units;
}
