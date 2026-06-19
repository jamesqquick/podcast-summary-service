import { describe, expect, it } from "vitest";
import { concatenateMp3 } from "./stitch";

describe("concatenateMp3", () => {
  it("concatenates buffers in order", () => {
    const out = concatenateMp3([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns an empty buffer for no parts", () => {
    expect(concatenateMp3([]).byteLength).toBe(0);
  });

  it("preserves total byte length", () => {
    const parts = [new Uint8Array(10), new Uint8Array(25), new Uint8Array(5)];
    expect(concatenateMp3(parts).byteLength).toBe(40);
  });
});
