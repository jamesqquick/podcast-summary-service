import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Env, EpisodeSource, EpisodeWorkflowParams } from "../types";
import { resolveGatewayId } from "../lib/ai-gateway";
import { EpisodeStore } from "../lib/storage/episodes";
import { FetchLinkExtractor, type ExtractedLink, type LinkExtractor } from "../lib/links/extractor";
import { generateScript } from "../lib/script/generate";
import { estimateDurationSeconds, segmentScript } from "../lib/script/segment";
import { synthesizeSpeech } from "../lib/tts/aura";
import { concatenateMp3 } from "../lib/tts/stitch";

/** Retry profiles tuned per step type. */
const EXTRACT_RETRY = { limit: 2, delay: "2 seconds", backoff: "exponential" } as const;
const SCRIPT_RETRY = { limit: 2, delay: "3 seconds", backoff: "exponential" } as const;
const SPEECH_RETRY = { limit: 3, delay: "2 seconds", backoff: "exponential" } as const;
const STITCH_RETRY = { limit: 2, delay: "2 seconds", backoff: "exponential" } as const;

/**
 * EpisodeWorkflow turns a list of links into a finished MP3 through durable,
 * independently-retryable steps:
 *
 *   1. extract    — fetch + read each link (failures are skipped, not fatal)
 *   2. script     — write one cohesive spoken-word script (Llama 4 Scout)
 *   3. synthesize — render each script segment to MP3 (Deepgram Aura)
 *   4. stitch     — concatenate segments into the final episode audio
 *
 * Every step persists progress to the episode record in R2 so `GET /episodes/:id`
 * always reflects the latest state, and large audio blobs are stored in R2
 * rather than returned from steps.
 */
export class EpisodeWorkflow extends WorkflowEntrypoint<Env, EpisodeWorkflowParams> {
  private readonly extractor: LinkExtractor = new FetchLinkExtractor();

  async run(event: WorkflowEvent<EpisodeWorkflowParams>, step: WorkflowStep): Promise<void> {
    const { episodeId, links, requestedTitle, voice } = event.payload;
    const store = new EpisodeStore(this.env.EPISODES_BUCKET);
    const gatewayId = resolveGatewayId(this.env.AI_GATEWAY_ID);

    try {
      await step.do("mark-processing", async () => {
        await store.patch(episodeId, {
          status: "processing",
          stage: "extracting",
          workflowInstanceId: event.instanceId,
        });
        return { ok: true };
      });

      // 1. Extract each link. Transient failures retry inside the step; a link
      // that ultimately can't be read is recorded as failed and skipped.
      const extracted: ExtractedLink[] = [];
      const sources: EpisodeSource[] = [];
      for (let i = 0; i < links.length; i++) {
        const url = links[i]!;
        try {
          const result = await step.do(
            `extract-${i}`,
            { retries: EXTRACT_RETRY, timeout: "30 seconds" },
            () => this.extractor.extract(url),
          );
          extracted.push(result);
          sources.push({ url, title: result.title, ok: true });
        } catch {
          sources.push({ url, ok: false });
        }
      }

      await step.do("record-extraction", async () => {
        await store.patch(episodeId, {
          sources,
          stage: extracted.length > 0 ? "writing_script" : "extracting",
        });
        return { read: extracted.length, total: links.length };
      });

      if (extracted.length === 0) {
        throw new NonRetryableError("None of the provided links could be read");
      }

      // 2. Generate one cohesive script from the readable sources.
      const { title, script } = await step.do(
        "generate-script",
        { retries: SCRIPT_RETRY, timeout: "2 minutes" },
        () =>
          generateScript(
            this.env.AI,
            extracted.map((e) => ({ url: e.url, title: e.title, text: e.text })),
            { requestedTitle, gatewayId },
          ),
      );

      const finalTitle = resolveTitle(requestedTitle, title, extracted.length);
      const segments = segmentScript(script);

      await step.do("record-script", async () => {
        await store.patch(episodeId, {
          title: finalTitle,
          segmentCount: segments.length,
          durationEstimateSeconds: estimateDurationSeconds(script),
          // Cap at 10 000 chars — enough for any practical episode length (~10 min).
          transcript: script.slice(0, 10_000),
          stage: "synthesizing",
        });
        return { segments: segments.length };
      });

      // 3. Synthesize each segment to its own R2 object (keeps step results tiny).
      for (let i = 0; i < segments.length; i++) {
        const text = segments[i]!;
        await step.do(
          `synthesize-${i}`,
          { retries: SPEECH_RETRY, timeout: "1 minute" },
          async () => {
            const bytes = await synthesizeSpeech(this.env.AI, text, voice, gatewayId);
            await store.putSegment(episodeId, i, bytes);
            return { index: i, byteLength: bytes.byteLength };
          },
        );
      }

      // 4. Stitch segments into the final episode and mark it ready.
      await step.do("stitch", { retries: STITCH_RETRY, timeout: "1 minute" }, async () => {
        const parts: Uint8Array[] = [];
        for (let i = 0; i < segments.length; i++) {
          parts.push(await store.getSegment(episodeId, i));
        }
        const audio = concatenateMp3(parts);
        const { key, byteLength } = await store.putAudio(episodeId, audio);
        await store.patch(episodeId, {
          status: "ready",
          stage: "done",
          audioKey: key,
          audioByteLength: byteLength,
        });
        return { byteLength };
      });

      // Best-effort cleanup of intermediate segments; never fails the episode.
      await step.do("cleanup-segments", async () => {
        try {
          await store.deleteSegments(episodeId, segments.length);
          return { deleted: segments.length };
        } catch {
          return { deleted: 0 };
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await step.do("mark-failed", async () => {
        try {
          await store.patch(episodeId, { status: "failed", error: message });
        } catch {
          // The record may be unreadable; surface the original error regardless.
        }
        return { ok: true };
      });
      throw error;
    }
  }
}

function resolveTitle(requested: string | undefined, generated: string, sourceCount: number): string {
  const candidate = requested?.trim() || generated.trim();
  if (candidate) return candidate.slice(0, 200);
  return `News Rundown — ${sourceCount} ${sourceCount === 1 ? "story" : "stories"}`;
}
