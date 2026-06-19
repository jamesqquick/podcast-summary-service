import { describe, expect, it } from "vitest";
import { buildScriptPrompt, SCRIPT_JSON_SCHEMA, targetWordCount } from "./prompt";

const source = { url: "https://example.com/story", title: "Big News", text: "Something happened today." };

describe("targetWordCount", () => {
  it("scales with the number of sources", () => {
    expect(targetWordCount(1)).toBe(270);
    expect(targetWordCount(3)).toBe(550);
  });
});

describe("buildScriptPrompt", () => {
  it("includes a system and user message", () => {
    const { messages } = buildScriptPrompt([source]);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toMatch(/text-to-speech/i);
    expect(messages[1]!.role).toBe("user");
  });

  it("embeds source url and title in the user message", () => {
    const { messages } = buildScriptPrompt([source]);
    expect(messages[1]!.content).toContain("https://example.com/story");
    expect(messages[1]!.content).toContain("Big News");
    expect(messages[1]!.content).toContain("STORY 1");
  });

  it("instructs the model to use a requested title verbatim", () => {
    const { messages } = buildScriptPrompt([source], { requestedTitle: "My Title" });
    expect(messages[1]!.content).toContain('Use this exact episode title: "My Title"');
  });

  it("returns the JSON schema and a target word count", () => {
    const prompt = buildScriptPrompt([source]);
    expect(prompt.schema).toBe(SCRIPT_JSON_SCHEMA);
    expect(prompt.targetWords).toBe(270);
  });

  it("throws when there are no sources", () => {
    expect(() => buildScriptPrompt([])).toThrow(RangeError);
  });
});
