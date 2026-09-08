import type { ServerPolicy } from "@/domain/content/schema";
import type { NodeStatus } from "./vocabulary";

export interface SemanticNodeState {
  readonly nodeId: string;
  readonly status: NodeStatus;
}

export function mergeSemanticNodeStatus(prior: NodeStatus, incoming: NodeStatus): NodeStatus {
  if (incoming === "ABSENT") return prior;
  if (incoming === "CONTRADICTED") return "CONTRADICTED";
  if (prior === "DISCOVERED") return "DISCOVERED";
  return incoming;
}

export function mergeSemanticNodeStates(
  prior: readonly SemanticNodeState[],
  incoming: readonly SemanticNodeState[],
): readonly SemanticNodeState[] {
  const priorById = new Map(prior.map((node) => [node.nodeId, node.status]));
  return incoming.map((node) => ({
    nodeId: node.nodeId,
    status: mergeSemanticNodeStatus(priorById.get(node.nodeId) ?? "ABSENT", node.status),
  }));
}

export function isSemanticLockEligible(
  states: readonly SemanticNodeState[],
  policy: Pick<ServerPolicy, "required_nodes" | "blocking_nodes" | "lock_threshold">,
): boolean {
  const discoveredRequired = states.filter(
    ({ nodeId, status }) => status === "DISCOVERED" && policy.required_nodes.includes(nodeId),
  ).length;
  const hasBlockingContradiction = states.some(
    ({ nodeId, status }) => status === "CONTRADICTED" && policy.blocking_nodes.includes(nodeId),
  );
  return discoveredRequired >= policy.lock_threshold && !hasBlockingContradiction;
}
