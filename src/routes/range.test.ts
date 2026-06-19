import { describe, expect, it } from "vitest";
import { resolveRange } from "./episodes";

const TOTAL = 1000;

describe("resolveRange", () => {
  it("returns null when no Range header is present", () => {
    expect(resolveRange(null, TOTAL)).toBeNull();
  });

  it("resolves an open-ended range", () => {
    expect(resolveRange("bytes=200-", TOTAL)).toEqual({ offset: 200, length: 800 });
  });

  it("resolves a closed range", () => {
    expect(resolveRange("bytes=0-99", TOTAL)).toEqual({ offset: 0, length: 100 });
  });

  it("clamps an end that exceeds the total", () => {
    expect(resolveRange("bytes=900-5000", TOTAL)).toEqual({ offset: 900, length: 100 });
  });

  it("resolves a suffix range to the last N bytes", () => {
    expect(resolveRange("bytes=-150", TOTAL)).toEqual({ offset: 850, length: 150 });
  });

  it("clamps a suffix larger than the object to the whole object", () => {
    expect(resolveRange("bytes=-5000", TOTAL)).toEqual({ offset: 0, length: 1000 });
  });

  it("flags an offset beyond the object as unsatisfiable", () => {
    expect(resolveRange("bytes=1000-", TOTAL)).toBe("unsatisfiable");
    expect(resolveRange("bytes=2000-3000", TOTAL)).toBe("unsatisfiable");
  });

  it("ignores malformed or multi-range headers (serve full body)", () => {
    expect(resolveRange("bytes=abc", TOTAL)).toBeNull();
    expect(resolveRange("bytes=0-10,20-30", TOTAL)).toBeNull();
    expect(resolveRange("bytes=-", TOTAL)).toBeNull();
  });
});
