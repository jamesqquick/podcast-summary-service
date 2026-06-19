import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEGMENT_CHARS,
  estimateDurationSeconds,
  segmentScript,
  splitIntoSentences,
} from "./segment";

describe("splitIntoSentences", () => {
  it("splits on sentence-ending punctuation", () => {
    expect(splitIntoSentences("Hello world. How are you? Great!")).toEqual([
      "Hello world.",
      "How are you?",
      "Great!",
    ]);
  });

  it("returns the whole string when there is no terminal punctuation", () => {
    expect(splitIntoSentences("no punctuation here")).toEqual(["no punctuation here"]);
  });

  it("returns an empty array for blank input", () => {
    expect(splitIntoSentences("   ")).toEqual([]);
  });
});

describe("segmentScript", () => {
  it("packs whole sentences without exceeding the budget", () => {
    const script = "One two three. Four five six. Seven eight nine. Ten eleven twelve.";
    const segments = segmentScript(script, 30);
    for (const seg of segments) expect(seg.length).toBeLessThanOrEqual(30);
    expect(segments.join(" ")).toContain("Ten eleven twelve.");
  });

  it("hard-wraps a single oversized sentence", () => {
    const longSentence = `${"word ".repeat(100).trim()}.`;
    const segments = segmentScript(longSentence, 50);
    expect(segments.length).toBeGreaterThan(1);
    for (const seg of segments) expect(seg.length).toBeLessThanOrEqual(50);
  });

  it("returns a single segment for short scripts under the default budget", () => {
    const segments = segmentScript("A short and sweet episode.");
    expect(segments).toEqual(["A short and sweet episode."]);
  });

  it("preserves all words across segments", () => {
    const script = Array.from({ length: 60 }, (_, i) => `token${i}.`).join(" ");
    const rejoined = segmentScript(script, 40).join(" ");
    for (let i = 0; i < 60; i++) expect(rejoined).toContain(`token${i}`);
  });

  it("throws on a non-positive budget", () => {
    expect(() => segmentScript("hi", 0)).toThrow(RangeError);
  });

  it("uses a sensible default budget", () => {
    expect(DEFAULT_SEGMENT_CHARS).toBeGreaterThan(500);
  });
});

describe("estimateDurationSeconds", () => {
  it("estimates roughly one minute for ~165 words", () => {
    const script = Array.from({ length: 165 }, () => "word").join(" ");
    expect(estimateDurationSeconds(script)).toBe(60);
  });
});
