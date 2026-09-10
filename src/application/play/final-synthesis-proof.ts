import { buildFinalSynthesisEvidenceUnits } from "@/application/play/final-synthesis-evidence-units";
import {
  FINAL_SYNTHESIS_PROOF_CONTRACT_VERSION,
  FinalSynthesisProofValidationError,
  validateFinalSynthesisProofStructure,
  type FinalSynthesisVerifierInput,
  type UnvalidatedFinalSynthesisComponentProof,
} from "@/ports/final-synthesis-verifier";

export { FinalSynthesisProofValidationError } from "@/ports/final-synthesis-verifier";

export interface DerivedFinalSynthesisVerification {
  readonly contractVersion: typeof FINAL_SYNTHESIS_PROOF_CONTRACT_VERSION;
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly support: "VERIFIED" | "INSUFFICIENT";
    readonly components: readonly {
      readonly componentId: string;
      readonly satisfied: boolean;
    }[];
  }[];
}

export function buildFinalSynthesisVerifierInput(
  requiredNodes: FinalSynthesisVerifierInput["requiredNodes"],
  text: string,
): FinalSynthesisVerifierInput {
  return {
    requiredNodes,
    submission: { text },
    evidenceUnits: buildFinalSynthesisEvidenceUnits(text),
  };
}

export function deriveFinalSynthesisVerification(
  proof: unknown,
  input: FinalSynthesisVerifierInput,
): DerivedFinalSynthesisVerification {
  const expectedUnits = buildFinalSynthesisEvidenceUnits(input.submission.text);
  if (JSON.stringify(expectedUnits) !== JSON.stringify(input.evidenceUnits)) {
    throw new FinalSynthesisProofValidationError("EVIDENCE_UNIT_INVALID", "EVIDENCE_UNIT_LIST_MISMATCH");
  }
  const validated = validateFinalSynthesisProofStructure(proof, input);
  return {
    contractVersion: FINAL_SYNTHESIS_PROOF_CONTRACT_VERSION,
    nodes: validated.nodes.map((node) => {
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

export function isFinalSynthesisEligible(verification: DerivedFinalSynthesisVerification): boolean {
  return verification.nodes.every(({ support }) => support === "VERIFIED");
}

function componentSatisfied(component: UnvalidatedFinalSynthesisComponentProof): boolean {
  return component.endorsementStatus === "ENDORSED"
    && (component.referenceStatus === "SELF_CONTAINED" || component.referenceStatus === "RESOLVED_WITHIN_SYNTHESIS")
    && component.componentMatch === "COMPLETE_COMPONENT_MATCH";
}
