import { ScriptGenerationError } from "../errors";
import { gatewayRunOptions, type GatewayRunOptions } from "../ai-gateway";
import { buildScriptPrompt, type ScriptPromptOptions, type ScriptSource } from "./prompt";

/** Llama 4 Scout: 131k context (fits many articles) + guided_json structured output. */
export const SCRIPT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const MAX_OUTPUT_TOKENS = 8000;
const MIN_OUTPUT_TOKENS = 2048;
const MIN_SCRIPT_CHARS = 200;

export interface GeneratedScript {
  title: string;
  script: string;
}

export interface GenerateScriptOptions extends ScriptPromptOptions {
  /** Optional AI Gateway id to route this call through. */
  gatewayId?: string;
}

/**
 * Minimal structural type for the Workers AI binding's text call. We narrow to
 * just what we use and isolate the cast here so callers stay fully typed.
 */
type TextRunner = (
  model: string,
  input: Record<string, unknown>,
  options?: GatewayRunOptions,
) => Promise<{ response?: unknown }>;

export async function generateScript(
  ai: Ai,
  sources: ScriptSource[],
  options: GenerateScriptOptions = {},
): Promise<GeneratedScript> {
  const { messages, schema, targetWords } = buildScriptPrompt(sources, {
    requestedTitle: options.requestedTitle,
  });
  // Budget generously: spoken words run ~1.4 tokens each, plus JSON overhead,
  // and the model often writes past the target. Under-budgeting truncates the
  // JSON mid-string. Floor at MIN to keep short episodes safe.
  const maxTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(MIN_OUTPUT_TOKENS, Math.ceil(targetWords * 3) + 800),
  );

  // Bind to `ai`: the binding's `run` relies on `this`, so a detached
  // reference would throw at call time.
  const run = ai.run.bind(ai) as unknown as TextRunner;

  let raw: { response?: unknown };
  try {
    raw = await run(
      SCRIPT_MODEL,
      {
        messages,
        guided_json: schema,
        max_tokens: maxTokens,
        temperature: 0.7,
      },
      gatewayRunOptions(options.gatewayId),
    );
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

/**
 * Parse the model output into a script. Tolerates three cases, in order:
 *   1. an object response (already parsed by the binding),
 *   2. a JSON string (whole, or embedded in surrounding prose),
 *   3. a truncated/partial JSON string — recover `title`/`script` by regex so a
 *      slightly-cut-off response still yields a usable episode.
 */
export function parseScriptResponse(response: unknown): GeneratedScript {
  if (response && typeof response === "object") {
    return coerceScript(response as Record<string, unknown>);
  }

  if (typeof response === "string") {
    const parsed = extractJsonObject(response);
    if (parsed) return coerceScript(parsed);

    const recovered = recoverScriptFields(response);
    if (recovered) return recovered;
  }

  throw new ScriptGenerationError(`Model response was not usable (type=${typeof response})`);
}

function coerceScript(obj: Record<string, unknown>): GeneratedScript {
  const { title, script } = obj;
  if (typeof script !== "string" || script.trim().length === 0) {
    throw new ScriptGenerationError("Model response did not include a script");
  }
  return { title: typeof title === "string" ? title : "", script };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Best-effort recovery from a partial/truncated JSON string. Extracts the
 * `title` and `script` field values directly, even if the closing quote/brace
 * never arrived (e.g. the model hit the token cap mid-script).
 */
function recoverScriptFields(text: string): GeneratedScript | null {
  const scriptMatch = /"script"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text);
  if (!scriptMatch) return null;
  const script = jsonUnescape(scriptMatch[1]!);
  if (script.trim().length === 0) return null;

  const titleMatch = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  const title = titleMatch ? jsonUnescape(titleMatch[1]!) : "";
  return { title, script };
}

/** Unescape a captured JSON string body, tolerating a dangling backslash. */
function jsonUnescape(body: string): string {
  const safe = body.replace(/\\$/, "");
  try {
    return JSON.parse(`"${safe}"`);
  } catch {
    return safe
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
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
