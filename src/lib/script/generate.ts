import { ScriptGenerationError } from "../errors";
import { buildScriptPrompt, type ScriptPromptOptions, type ScriptSource } from "./prompt";

/** Llama 4 Scout: 131k context (fits many articles) + guided_json structured output. */
export const SCRIPT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const MAX_OUTPUT_TOKENS = 8000;
const MIN_SCRIPT_CHARS = 200;

export interface GeneratedScript {
  title: string;
  script: string;
}

/**
 * Minimal structural type for the Workers AI binding's text call. We narrow to
 * just what we use and isolate the cast here so callers stay fully typed.
 */
type TextRunner = (
  model: string,
  input: Record<string, unknown>,
) => Promise<{ response?: unknown }>;

export async function generateScript(
  ai: Ai,
  sources: ScriptSource[],
  options: ScriptPromptOptions = {},
): Promise<GeneratedScript> {
  const { messages, schema, targetWords } = buildScriptPrompt(sources, options);
  const maxTokens = Math.min(MAX_OUTPUT_TOKENS, Math.ceil(targetWords * 2) + 400);

  const run = ai.run as unknown as TextRunner;

  let raw: { response?: unknown };
  try {
    raw = await run(SCRIPT_MODEL, {
      messages,
      guided_json: schema,
      max_tokens: maxTokens,
      temperature: 0.7,
    });
  } catch (cause) {
    throw new ScriptGenerationError(
      `Workers AI text generation failed: ${(cause as Error).message}`,
    );
  }

  const parsed = parseScriptResponse(raw.response);
  const title = parsed.title.trim();
  const script = sanitizeSpokenText(parsed.script);

  if (script.length < MIN_SCRIPT_CHARS) {
    throw new ScriptGenerationError("Model returned an empty or too-short script");
  }

  return { title, script };
}

/** Parse the model output, tolerating either a JSON object or a JSON string. */
export function parseScriptResponse(response: unknown): GeneratedScript {
  const candidate =
    typeof response === "string" ? extractJsonObject(response) : (response as unknown);

  if (!candidate || typeof candidate !== "object") {
    throw new ScriptGenerationError("Model response was not valid JSON");
  }

  const { title, script } = candidate as Record<string, unknown>;
  if (typeof script !== "string" || script.trim().length === 0) {
    throw new ScriptGenerationError("Model response did not include a script");
  }

  return {
    title: typeof title === "string" ? title : "",
    script,
  };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Strip any stray formatting the model may have emitted so the text reads
 * cleanly through TTS: markdown emphasis, headings, list markers, code ticks.
 */
export function sanitizeSpokenText(text: string): string {
  const withoutFences = text.replace(/```[\s\S]*?```/g, " ");
  const withoutMarkers = withoutFences
    .split("\n")
    // Strip line-level markers (headings, bullets) before removing emphasis
    // characters, otherwise a bullet like "* item" loses its marker early.
    .map((line) => line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*•]\s+/, ""))
    .join("\n");
  return withoutMarkers
    .replace(/[`*_]+/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
