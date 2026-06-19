import { describe, expect, it } from "vitest";
import { parseBearer, timingSafeEqual } from "./auth";

describe("parseBearer", () => {
  it("extracts the token from a Bearer header", () => {
    expect(parseBearer("Bearer abc123")).toBe("abc123");
    expect(parseBearer("bearer  spaced ")).toBe("spaced");
  });

  it("returns null for missing or non-bearer headers", () => {
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer("")).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("hunter2", "hunter2")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(timingSafeEqual("aaaa", "aaab")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqual("short", "longer-token")).toBe(false);
  });

  it("handles unicode", () => {
    expect(timingSafeEqual("tök€n", "tök€n")).toBe(true);
    expect(timingSafeEqual("tök€n", "token")).toBe(false);
  });
});
