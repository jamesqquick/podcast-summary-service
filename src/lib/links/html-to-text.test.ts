import { describe, expect, it } from "vitest";
import { clampText, decodeEntities, extractReadable, extractTitle, htmlToText } from "./html-to-text";

describe("decodeEntities", () => {
  it("decodes named, decimal, and hex entities", () => {
    expect(decodeEntities("a &amp; b &#65; &#x42; &nbsp;c")).toBe("a & b A B  c");
  });

  it("leaves unknown entities untouched", () => {
    expect(decodeEntities("&unknownentity;")).toBe("&unknownentity;");
  });
});

describe("extractTitle", () => {
  it("prefers og:title over <title>", () => {
    const html = `<head><meta property="og:title" content="OG Title"><title>Doc Title</title></head>`;
    expect(extractTitle(html)).toBe("OG Title");
  });

  it("falls back to <title>", () => {
    expect(extractTitle("<title>Just Title</title>")).toBe("Just Title");
  });

  it("returns empty string when no title is present", () => {
    expect(extractTitle("<p>no title here</p>")).toBe("");
  });
});

describe("htmlToText", () => {
  it("strips script and style content", () => {
    const html = `<body><script>evil()</script><style>.a{}</style><p>Hello there</p></body>`;
    const text = htmlToText(html);
    expect(text).toContain("Hello there");
    expect(text).not.toContain("evil");
    expect(text).not.toContain(".a{}");
  });

  it("prefers the article region and breaks on block elements", () => {
    const html = `<body><nav>menu junk</nav><article><h1>Title</h1><p>First para.</p><p>Second para.</p></article></body>`;
    const text = htmlToText(html);
    expect(text).toContain("First para.");
    expect(text).toContain("Second para.");
    expect(text).not.toContain("menu junk");
    expect(text.split("\n").length).toBeGreaterThanOrEqual(3);
  });
});

describe("extractReadable", () => {
  it("returns both title and text", () => {
    const page = extractReadable(`<title>T</title><article><p>Body content here.</p></article>`);
    expect(page.title).toBe("T");
    expect(page.text).toContain("Body content here.");
  });
});

describe("clampText", () => {
  it("returns text unchanged when within budget", () => {
    expect(clampText("short", 100)).toBe("short");
  });

  it("clamps to the budget", () => {
    const long = "a".repeat(500);
    expect(clampText(long, 100).length).toBeLessThanOrEqual(100);
  });

  it("prefers a line boundary when one is reasonably placed", () => {
    const text = `${"x".repeat(80)}\n${"y".repeat(80)}`;
    expect(clampText(text, 100)).toBe("x".repeat(80));
  });
});
