import { SpeechSynthesisError } from "../errors";
import type { AuraVoice } from "./voices";

/** Deepgram Aura on Workers AI: natural pacing + 12 selectable voices. */
export const SPEECH_MODEL = "@cf/deepgram/aura-1";

/**
 * Minimal structural type for the binding's speech call. With
 * `returnRawResponse: true`, Aura returns a `Response` whose body is the audio.
 * The cast is isolated here so callers stay typed.
 */
type SpeechRunner = (
  model: string,
  input: Record<string, unknown>,
  options: { returnRawResponse: true },
) => Promise<Response>;

/**
 * Synthesize one segment of narration to MP3 bytes.
 *
 * `text` must already be within the model's per-request limit (see
 * {@link import("../script/segment").segmentScript}). Returns raw MP3 frame
 * bytes suitable for concatenation by the stitcher.
 */
export async function synthesizeSpeech(
  ai: Ai,
  text: string,
  voice: AuraVoice,
): Promise<Uint8Array> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new SpeechSynthesisError("Cannot synthesize empty text");
  }

  const run = ai.run as unknown as SpeechRunner;

  let response: Response;
  try {
    response = await run(
      SPEECH_MODEL,
      { text: trimmed, speaker: voice, encoding: "mp3" },
      { returnRawResponse: true },
    );
  } catch (cause) {
    throw new SpeechSynthesisError(`Aura request failed: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new SpeechSynthesisError(`Aura returned status ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new SpeechSynthesisError("Aura returned empty audio");
  }
  return bytes;
}
