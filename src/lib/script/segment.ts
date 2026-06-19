/**
 * Split a spoken-word script into TTS-sized segments.
 *
 * Aura (and most TTS models) cap input length per request, so a multi-minute
 * episode must be synthesized in chunks and stitched back together. We pack
 * whole sentences greedily up to `maxChars`, never splitting a word; an
 * oversized sentence is hard-wrapped on whitespace as a last resort. Pure and
 * deterministic so the same script always yields the same segments.
 */

/** Conservative per-request character budget for Deepgram Aura. */
export const DEFAULT_SEGMENT_CHARS = 1500;

const SENTENCE_BOUNDARY = /[^.!?…]+[.!?…]+(?:["'”’)\]]+)?|\S[^.!?…]*$/g;

export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = normalized.match(SENTENCE_BOUNDARY);
  return matches ? matches.map((s) => s.trim()).filter(Boolean) : [normalized];
}

/** Hard-wrap a string longer than `maxChars` on whitespace boundaries. */
function hardWrap(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars; // single token longer than the budget
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

export function segmentScript(
  script: string,
  maxChars: number = DEFAULT_SEGMENT_CHARS,
): string[] {
  if (maxChars <= 0) throw new RangeError("maxChars must be positive");

  const segments: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) segments.push(trimmed);
    current = "";
  };

  for (const sentence of splitIntoSentences(script)) {
    if (sentence.length > maxChars) {
      flush();
      segments.push(...hardWrap(sentence, maxChars));
      continue;
    }
    if (current.length + sentence.length + 1 > maxChars) {
      flush();
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  flush();

  return segments;
}

/** Rough spoken-duration estimate (~165 wpm) for display purposes. */
export function estimateDurationSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 165) * 60);
}
