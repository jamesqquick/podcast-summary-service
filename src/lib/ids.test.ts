import { describe, expect, it } from "vitest";
import { encodeBase32, generateEpisodeId, isValidEpisodeId } from "./ids";

describe("encodeBase32", () => {
  it("encodes a single zero byte", () => {
    expect(encodeBase32(new Uint8Array([0]))).toBe("00");
  });

  it("uses only the Crockford alphabet", () => {
    const out = encodeBase32(new Uint8Array([255, 128, 1, 42, 200]));
    expect(out).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it("encodes 16 bytes to 26 characters", () => {
    expect(encodeBase32(new Uint8Array(16)).length).toBe(26);
  });
});

describe("generateEpisodeId", () => {
  it("produces an id matching the expected shape", () => {
    expect(generateEpisodeId()).toMatch(/^ep_[0-9a-z]{26}$/);
  });

  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateEpisodeId()));
    expect(ids.size).toBe(500);
  });
});

describe("isValidEpisodeId", () => {
  it("accepts generated ids", () => {
    expect(isValidEpisodeId(generateEpisodeId())).toBe(true);
  });

  it("rejects malformed ids", () => {
    expect(isValidEpisodeId("ep_")).toBe(false);
    expect(isValidEpisodeId("nope")).toBe(false);
    expect(isValidEpisodeId("ep_UPPER")).toBe(false);
    expect(isValidEpisodeId("../etc/passwd")).toBe(false);
  });
});
