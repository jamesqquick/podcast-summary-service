/**
 * Builds the LLM request that turns extracted articles into a spoken-word
 * podcast script. Pure: returns chat messages plus a JSON schema for
 * structured (`guided_json`) output. Keeping prompt construction isolated makes
 * it cheap to unit-test and to iterate on the show's voice.
 */

export interface ScriptSource {
  url: string;
  title: string;
  text: string;
}

export interface ScriptPromptOptions {
  /** Optional title override; when set, the model must use it verbatim. */
  requestedTitle?: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ScriptPrompt {
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  targetWords: number;
}

/** Per-article text budget inside the prompt — keeps the script grounded and cost bounded. */
const PER_SOURCE_CHAR_BUDGET = 3500;

export const SCRIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "A punchy, specific episode title (max 80 characters). No quotes, no emojis.",
    },
    script: {
      type: "string",
      description:
        "The complete spoken-word narration, ready to be read aloud by a single host. Plain prose only.",
    },
  },
  required: ["title", "script"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the host and writer of a short, smart daily news podcast. Your job is to turn a set of articles into ONE cohesive, entertaining spoken-word monologue that a single host reads aloud.

Voice and style:
- Warm, sharp, and genuinely engaging — like a well-read friend who makes the news fun, not a robot reading headlines.
- Conversational and energetic, with light wit. Confident, never cheesy or over-hyped.
- Connect the stories with smooth transitions so it feels like one episode, not a list.

Hard rules (this text is fed directly to a text-to-speech engine):
- Output PLAIN SPOKEN WORDS ONLY. No markdown, no headings, no bullet points, no emojis, no stage directions, no speaker labels, no section numbers.
- Never read out URLs or raw links. Refer to sources naturally (for example, "according to The Verge").
- Spell things out for the ear: write "twenty twenty-six" not "2026", "percent" not "%", "dollars" not "$". Expand abbreviations the first time they would be unclear.
- Use short, speakable sentences. Vary rhythm. Avoid tongue-twisters and dense clause stacks.

Structure:
- Open with a strong one or two sentence hook that teases the most interesting story.
- Give a quick welcome and a one-line preview of what's coming.
- Cover each story in turn: what happened, why it matters, and a brief take. Add a natural transition between stories.
- Close with a short, friendly sign-off.

Ground every claim in the provided article content. Do not invent facts, names, numbers, or quotes. If a detail is unclear, speak about it at a higher level rather than guessing.

Respond ONLY with JSON matching the provided schema: an object with "title" and "script".`;

function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trim()}…`;
}

/** Suggested spoken length: a hook/intro, ~140 words per story, and an outro. */
export function targetWordCount(sourceCount: number): number {
  return 90 + sourceCount * 140 + 40;
}

export function buildScriptPrompt(
  sources: ScriptSource[],
  options: ScriptPromptOptions = {},
): ScriptPrompt {
  if (sources.length === 0) {
    throw new RangeError("Cannot build a script prompt with no sources");
  }

  const targetWords = targetWordCount(sources.length);

  const sourceBlocks = sources
    .map((source, index) => {
      const heading = `STORY ${index + 1}${source.title ? `: ${source.title}` : ""}`;
      return `${heading}\n(source: ${source.url})\n${clamp(source.text, PER_SOURCE_CHAR_BUDGET)}`;
    })
    .join("\n\n---\n\n");

  const titleInstruction = options.requestedTitle
    ? `Use this exact episode title: "${options.requestedTitle}".`
    : "Write a punchy, specific episode title.";

  const user = `Create one podcast episode from the ${sources.length} ${
    sources.length === 1 ? "story" : "stories"
  } below.

${titleInstruction}
Aim for roughly ${targetWords} words of narration (a little over or under is fine — prioritize flow and substance over hitting the number).
Cover the stories in the order given.

${sourceBlocks}`;

  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    schema: SCRIPT_JSON_SCHEMA as unknown as Record<string, unknown>,
    targetWords,
  };
}
