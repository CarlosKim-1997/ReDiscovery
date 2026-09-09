import type { LockEvidenceUnit, LockVerifierV2Input } from "@/ports/lock-verifier-v2";

const STRONG_SENTENCE_BOUNDARIES = new Set([".", "?", "!", "。", "？", "！"]);

export function buildLockEvidenceUnits(
  answers: LockVerifierV2Input["answers"],
): readonly LockEvidenceUnit[] {
  if (new Set(answers.map(({ answerId }) => answerId)).size !== answers.length) {
    throw new Error("Duplicate answer ID");
  }

  return answers.flatMap(({ answerId, text }) => segmentAnswer(answerId, text));
}

function segmentAnswer(answerId: string, text: string): LockEvidenceUnit[] {
  const units: LockEvidenceUnit[] = [];
  let segmentStart = 0;
  let cursor = 0;

  const append = (rawEnd: number) => {
    let start = segmentStart;
    let end = rawEnd;
    while (start < end && isWhitespace(text[start]!)) start += 1;
    while (end > start && isWhitespace(text[end - 1]!)) end -= 1;
    if (start < end) {
      units.push({
        unitId: `${answerId}:u${units.length + 1}`,
        answerId,
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

function isWhitespace(character: string): boolean {
  return /^\s$/u.test(character);
}
