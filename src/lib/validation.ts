import { z } from "zod";
import { AURA_VOICES } from "./tts/voices";

/** Hard ceiling on links per episode — bounds fan-out, cost, and runtime. */
export const MAX_LINKS = 25;
export const MAX_TITLE_LENGTH = 200;

/**
 * Request body for `POST /episodes`.
 *
 * - `links`: 1–25 absolute http(s) URLs, de-duplicated, order preserved.
 * - `title`: optional override; otherwise the model writes one.
 * - `voice`: optional Aura speaker override.
 */
export const CreateEpisodeSchema = z
  .object({
    links: z
      .array(z.url({ protocol: /^https?$/ }))
      .min(1, "Provide at least one link")
      .max(MAX_LINKS, `Provide at most ${MAX_LINKS} links`)
      .transform(dedupePreservingOrder),
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
    voice: z.enum(AURA_VOICES).optional(),
  })
  .strict();

export type CreateEpisodeInput = z.infer<typeof CreateEpisodeSchema>;

function dedupePreservingOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const normalized = url.trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}
