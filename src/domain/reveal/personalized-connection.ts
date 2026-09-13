import type { RevealContent, ServerPolicy } from "@/domain/content/schema";
import type { EvidenceRef, PlaySession } from "@/domain/play/session";

export interface PersonalizedConnectionItem {
  readonly label: string;
  readonly userExcerpt: string;
  readonly explanation: string;
}
export interface PersonalizedConnectionView {
  readonly items: readonly PersonalizedConnectionItem[];
  readonly canonicalInsight: string;
}
export interface PersonalizedEvidenceIssue {
  readonly reason: "MISSING_EVIDENCE" | "INVALID_EVIDENCE" | "EXCERPT_TOO_LONG";
}
export const MAX_PERSONALIZED_EXCERPT_CHARACTERS = 240;

export function projectPersonalizedConnection(
  session: Pick<PlaySession, "thoughts" | "discoveries">,
  reveal: RevealContent,
  policy: ServerPolicy,
): Readonly<{ view: PersonalizedConnectionView; issues: readonly PersonalizedEvidenceIssue[] }> | undefined {
  if (!("personalized_reveal" in reveal)) return undefined;
  const mapping = reveal.personalized_reveal;
  const issues: PersonalizedEvidenceIssue[] = [];
  const atBoundary = (text: string, offset: number) => !(offset > 0 && offset < text.length
    && /[\uD800-\uDBFF]/u.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/u.test(text[offset]!));
  function excerpt(evidence?: EvidenceRef): string | undefined {
    if (!evidence) { issues.push({ reason: "MISSING_EVIDENCE" }); return undefined; }
    const matches = session.thoughts.filter(thought => thought.id === evidence.answerId);
    const thought = matches.length === 1 ? matches[0] : undefined;
    const { spanStart: start, spanEnd: end } = evidence;
    if (!thought || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > thought.text.length
      || !atBoundary(thought.text, start) || !atBoundary(thought.text, end)) {
      issues.push({ reason: "INVALID_EVIDENCE" }); return undefined;
    }
    const text = thought.text.slice(start, end);
    if (!text.trim()) { issues.push({ reason: "INVALID_EVIDENCE" }); return undefined; }
    if (Array.from(text).length > MAX_PERSONALIZED_EXCERPT_CHARACTERS) { issues.push({ reason: "EXCERPT_TOO_LONG" }); return undefined; }
    return text;
  }
  const candidates = session.discoveries.flatMap(node => {
    const copy = mapping.by_node[node.nodeId];
    if (!copy || node.status === "ABSENT" || (node.status === "CONTRADICTED" && !policy.required_nodes.includes(node.nodeId))) return [];
    const text = excerpt(node.status === "CONTRADICTED" ? node.contradictionEvidence : node.evidence);
    if (text === undefined) return [];
    const rank = mapping.concept_order.indexOf(node.nodeId);
    const explanation = node.status === "DISCOVERED" ? copy.discovered : node.status === "PARTIAL" ? copy.partial : copy.contradicted;
    return [{ nodeId: node.nodeId, status: node.status, rank, item: { label: copy.label, userExcerpt: text, explanation } }];
  });
  const deeper = (a: typeof candidates[number], b: typeof candidates[number]) => b.rank - a.rank || a.nodeId.localeCompare(b.nodeId, "en");
  const positive = candidates.filter(node => node.status !== "CONTRADICTED")
    .sort((a, b) => (a.status === "DISCOVERED" ? 0 : 1) - (b.status === "DISCOVERED" ? 0 : 1) || deeper(a, b));
  const divergence = candidates.filter(node => node.status === "CONTRADICTED").sort(deeper);
  const items: PersonalizedConnectionItem[] = [];
  const used = new Set<string>();
  const add = (candidate: typeof candidates[number] | undefined) => {
    if (!candidate || used.has(candidate.item.userExcerpt)) return false;
    used.add(candidate.item.userExcerpt); items.push(candidate.item); return true;
  };
  add(positive[0]);
  // Preserve a positive item; reserve no more than one distinct divergence slot.
  const selectedDivergence = divergence.find(candidate => !used.has(candidate.item.userExcerpt));
  add(selectedDivergence);
  for (const candidate of positive) { if (items.length === 2) break; add(candidate); }
  return { view: { items, canonicalInsight: reveal.explanation }, issues };
}
