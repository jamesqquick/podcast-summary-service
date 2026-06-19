import { describe, expect, it } from "vitest";
import { CreateEpisodeSchema, MAX_LINKS } from "./validation";

describe("CreateEpisodeSchema", () => {
  it("accepts a valid request and preserves link order", () => {
    const result = CreateEpisodeSchema.safeParse({
      links: ["https://a.com/1", "http://b.com/2"],
      title: "  My Episode  ",
      voice: "orion",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.links).toEqual(["https://a.com/1", "http://b.com/2"]);
      expect(result.data.title).toBe("My Episode");
      expect(result.data.voice).toBe("orion");
    }
  });

  it("de-duplicates links while preserving order", () => {
    const result = CreateEpisodeSchema.safeParse({
      links: ["https://a.com", "https://b.com", "https://a.com"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.links).toEqual(["https://a.com", "https://b.com"]);
  });

  it("rejects an empty link list", () => {
    expect(CreateEpisodeSchema.safeParse({ links: [] }).success).toBe(false);
  });

  it("rejects more than the maximum number of links", () => {
    const links = Array.from({ length: MAX_LINKS + 1 }, (_, i) => `https://a.com/${i}`);
    expect(CreateEpisodeSchema.safeParse({ links }).success).toBe(false);
  });

  it("rejects non-http(s) and malformed urls", () => {
    expect(CreateEpisodeSchema.safeParse({ links: ["not-a-url"] }).success).toBe(false);
    expect(CreateEpisodeSchema.safeParse({ links: ["ftp://a.com/x"] }).success).toBe(false);
  });

  it("rejects an unknown voice", () => {
    expect(
      CreateEpisodeSchema.safeParse({ links: ["https://a.com"], voice: "morgan" }).success,
    ).toBe(false);
  });

  it("rejects unknown top-level keys", () => {
    expect(
      CreateEpisodeSchema.safeParse({ links: ["https://a.com"], extra: true }).success,
    ).toBe(false);
  });
});
