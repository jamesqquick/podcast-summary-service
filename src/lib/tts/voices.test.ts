import { describe, expect, it } from "vitest";
import { FALLBACK_VOICE, isAuraVoice, resolveVoice } from "./voices";

describe("isAuraVoice", () => {
  it("recognizes valid voices", () => {
    expect(isAuraVoice("asteria")).toBe(true);
    expect(isAuraVoice("zeus")).toBe(true);
  });

  it("rejects unknown voices", () => {
    expect(isAuraVoice("morgan")).toBe(false);
    expect(isAuraVoice("")).toBe(false);
  });
});

describe("resolveVoice", () => {
  it("prefers a valid requested voice", () => {
    expect(resolveVoice("zeus", "luna")).toBe("zeus");
  });

  it("falls back to the env default when the request is invalid or absent", () => {
    expect(resolveVoice("invalid", "luna")).toBe("luna");
    expect(resolveVoice(undefined, "luna")).toBe("luna");
  });

  it("falls back to the hardcoded default when nothing valid is provided", () => {
    expect(resolveVoice(undefined, undefined)).toBe(FALLBACK_VOICE);
    expect(resolveVoice("invalid", "alsoinvalid")).toBe(FALLBACK_VOICE);
  });
});
