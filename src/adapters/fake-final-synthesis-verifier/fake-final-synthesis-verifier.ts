import {
  FinalSynthesisExecutionError,
  type FinalSynthesisExecution,
  type FinalSynthesisVerifierAttempt,
  type FinalSynthesisVerifierInput,
  type FinalSynthesisVerifierPort,
  type UnvalidatedFinalSynthesisProof,
} from "@/ports/final-synthesis-verifier";

export const FINAL_SYNTHESIS_FAKE_FIXTURES = Object.freeze({
  VERIFIED: "테스트 사용자는 조직의 경계가 소통을 가르고, 그 경계에 따라 결정과 결과물의 구조가 서로 닮는다고 정리한다.",
  INSUFFICIENT: "테스트 사용자는 서로 영향을 준다고만 정리한다.",
  OPERATIONAL_FAILURE: "테스트 전용 운영 실패 fixture",
});

export class FakeFinalSynthesisVerifierAdapter implements FinalSynthesisVerifierPort {
  async extractProof(input: FinalSynthesisVerifierInput): Promise<FinalSynthesisExecution> {
    if (input.submission.text === FINAL_SYNTHESIS_FAKE_FIXTURES.OPERATIONAL_FAILURE) {
      throw new FinalSynthesisExecutionError([attempt("PROVIDER_ERROR", false, "PROVIDER_UNAVAILABLE")]);
    }
    const verified = input.submission.text === FINAL_SYNTHESIS_FAKE_FIXTURES.VERIFIED;
    return {
      proof: proofFor(input, verified),
      attempts: [attempt("SUCCEEDED", true)],
    };
  }
}

function proofFor(input: FinalSynthesisVerifierInput, verified: boolean): UnvalidatedFinalSynthesisProof {
  const evidenceUnitId = input.evidenceUnits[0]?.unitId;
  return {
    nodes: input.requiredNodes.map((node) => ({
      nodeId: node.nodeId,
      components: node.requiredComponents.map((component) => ({
        componentId: component.componentId,
        endorsementStatus: verified ? "ENDORSED" : "MIXED_OR_UNRESOLVED",
        referenceStatus: "SELF_CONTAINED",
        componentMatch: verified ? "COMPLETE_COMPONENT_MATCH" : "NO_COMPONENT_SUPPORT",
        evidenceUnitIds: verified && evidenceUnitId ? [evidenceUnitId] : [],
        antecedentEvidenceUnitIds: [],
      })),
    })),
  };
}

function attempt(
  resultStatus: FinalSynthesisVerifierAttempt["resultStatus"],
  schemaValid: boolean,
  failureCategory?: FinalSynthesisVerifierAttempt["failureCategory"],
): FinalSynthesisVerifierAttempt {
  return {
    attempt: 1,
    provider: "fake",
    model: "fake-final-synthesis-fixture-v1",
    promptVersion: "fake-final-synthesis-fixture-v1",
    schemaValid,
    resultStatus,
    ...(failureCategory ? { failureCategory } : {}),
    latencyMs: 0,
  };
}
