import { describe, expect, it } from "vitest";
import { parseScriptResponse, sanitizeSpokenText } from "./generate";
import { ScriptGenerationError } from "../errors";

describe("parseScriptResponse", () => {
  it("accepts an object response", () => {
    expect(parseScriptResponse({ title: "T", script: "S" })).toEqual({ title: "T", script: "S" });
  });

  it("accepts a JSON string response", () => {
    expect(parseScriptResponse('{"title":"T","script":"Hello"}')).toEqual({
      title: "T",
      script: "Hello",
    });
  });

  it("extracts a JSON object embedded in surrounding text", () => {
    const raw = 'Sure! {"title":"T","script":"Hello world"} hope that helps';
    expect(parseScriptResponse(raw)).toEqual({ title: "T", script: "Hello world" });
  });

  it("defaults the title to an empty string when missing", () => {
    expect(parseScriptResponse({ script: "only script" })).toEqual({ title: "", script: "only script" });
  });

  it("recovers title and script from truncated JSON (token cap hit mid-script)", () => {
    const truncated = '{"title":"My Episode","script":"Hello there. This is the start of a long script that got cut off mid-sentence because the model ran out of';
    const result = parseScriptResponse(truncated);
    expect(result.title).toBe("My Episode");
    expect(result.script).toContain("Hello there.");
    expect(result.script).toContain("ran out of");
  });

  it("unescapes embedded quotes and newlines when recovering", () => {
    const truncated = '{"title":"T","script":"She said \\"hi\\".\\nThen left';
    const result = parseScriptResponse(truncated);
    expect(result.script).toContain('She said "hi".');
    expect(result.script).toContain("\n");
  });

  it("throws when no script is present", () => {
    expect(() => parseScriptResponse({ title: "T" })).toThrow(ScriptGenerationError);
    expect(() => parseScriptResponse("not json at all")).toThrow(ScriptGenerationError);
    expect(() => parseScriptResponse(42)).toThrow(ScriptGenerationError);
  });
});

describe("sanitizeSpokenText", () => {
  it("strips markdown emphasis and code ticks", () => {
    expect(sanitizeSpokenText("This is **bold** and `code` and _italic_.")).toBe(
      "This is bold and code and italic.",
    );
  });

  it("removes heading and list markers", () => {
    expect(sanitizeSpokenText("# Heading\n- item one\n* item two")).toBe(
      "Heading\nitem one\nitem two",
    );
  });

  it("removes fenced code blocks", () => {
    expect(sanitizeSpokenText("Before\n```\ncode();\n```\nAfter")).toContain("Before");
    expect(sanitizeSpokenText("Before\n```\ncode();\n```\nAfter")).not.toContain("code();");
  });

  it("collapses excessive blank lines", () => {
    expect(sanitizeSpokenText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});
