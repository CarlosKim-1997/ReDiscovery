import type { FinalSynthesisEvidenceUnit } from "@/ports/final-synthesis-verifier";

export const FINAL_SYNTHESIS_MAX_CHARS = 500 as const;

const STRONG_SENTENCE_BOUNDARIES = new Set([".", "?", "!", "。", "？", "！"]);

export function buildFinalSynthesisEvidenceUnits(text: string): readonly FinalSynthesisEvidenceUnit[] {
  validateFinalSynthesisText(text);
  const units: FinalSynthesisEvidenceUnit[] = [];
  let segmentStart = 0;
  let cursor = 0;

  const append = (rawEnd: number) => {
    let start = segmentStart;
    let end = rawEnd;
    while (start < end && isWhitespace(text[start]!)) start += 1;
    while (end > start && isWhitespace(text[end - 1]!)) end -= 1;
    if (start < end) {
      units.push({
        unitId: `synthesis:u${units.length + 1}`,
        start,
        end,
        text: text.slice(start, end),
      });
    }
  };

  while (cursor < text.length) {
    const character = text[cursor]!;
    if (STRONG_SENTENCE_BOUNDARIES.has(character)) {
      cursor += 1;
      while (cursor < text.length && STRONG_SENTENCE_BOUNDARIES.has(text[cursor]!)) cursor += 1;
      append(cursor);
      segmentStart = cursor;
      continue;
    }
    if (character === "\r" || character === "\n") {
      append(cursor);
      cursor += 1;
      if (character === "\r" && text[cursor] === "\n") cursor += 1;
      while (text[cursor] === "\r" || text[cursor] === "\n") cursor += 1;
      segmentStart = cursor;
      continue;
    }
    cursor += 1;
  }
  append(text.length);
  return units;
}

export function validateFinalSynthesisText(text: string): void {
  if (!text.trim()) throw new Error("FINAL_SYNTHESIS_EMPTY");
  if (text.length > FINAL_SYNTHESIS_MAX_CHARS) throw new Error("FINAL_SYNTHESIS_TOO_LONG");
}

function isWhitespace(character: string): boolean {
  return /^\s$/u.test(character);
}
