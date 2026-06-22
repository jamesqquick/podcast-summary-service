import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env, EpisodeRecord } from "../types";
import { AURA_VOICES, resolveVoice } from "../lib/tts/voices";
import { EpisodeStore } from "../lib/storage/episodes";
import { generateEpisodeId } from "../lib/ids";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 36; // 36 × 5 s = 3 min

export class PodcastMCP extends McpAgent<Env> {
  server = new McpServer({ name: "Podcast Generator", version: "1.0.0" });

  async init() {
    this.server.tool(
      "generate_podcast",
      "Generate an audio podcast episode from a list of URLs. Scrapes each page, writes a cohesive spoken-word script, and synthesises MP3 audio. Returns a playable URL when complete (30–90 s).",
      {
        urls: z
          .array(z.string().url())
          .min(1)
          .max(25)
          .describe("1–25 URLs to summarise into the podcast"),
        title: z.string().max(200).optional().describe("Episode title (AI-generated if omitted)"),
        voice: z.enum(AURA_VOICES).optional().describe("Deepgram Aura voice (default: asteria)"),
      },
      async ({ urls, title, voice }) => {
        const store = new EpisodeStore(this.env.EPISODES_BUCKET);
        const resolvedVoice = resolveVoice(voice, this.env.DEFAULT_VOICE);
        const episodeId = generateEpisodeId();
        const now = new Date().toISOString();

        const record: EpisodeRecord = {
          id: episodeId,
          status: "queued",
          stage: "queued",
          title: title ?? "Untitled episode",
          requestedTitle: title,
          voice: resolvedVoice,
          links: dedupeUrls(urls),
          sources: [],
          createdAt: now,
          updatedAt: now,
        };
        await store.create(record);

        const instance = await this.env.EPISODE_WORKFLOW.create({
          id: episodeId,
          params: { episodeId, links: record.links, requestedTitle: title, voice: resolvedVoice },
        });
        if (instance.id !== episodeId) {
          await store.patch(episodeId, { workflowInstanceId: instance.id });
        }

        // Poll R2 meta.json until the workflow finishes
        for (let i = 0; i < MAX_POLLS; i++) {
          await sleep(POLL_INTERVAL_MS);
          const current = await store.get(episodeId);
          if (!current) throw new Error("Episode record disappeared unexpectedly");

          if (current.status === "ready") {
            const base = this.env.PUBLIC_BASE_URL?.trim() ?? "";
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      episodeId,
                      title: current.title,
                      audioUrl: `${base}/episodes/${episodeId}/audio.mp3`,
                      durationEstimateSeconds: current.durationEstimateSeconds,
                      voice: current.voice,
                      sourceCount: current.sources.filter((s) => s.ok).length,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          if (current.status === "failed") {
            throw new Error(`Podcast generation failed: ${current.error ?? "unknown error"}`);
          }
        }

        throw new Error(
          `Timed out after ${(POLL_INTERVAL_MS * MAX_POLLS) / 1000}s. ` +
            `Poll status manually: GET /episodes/${episodeId}`,
        );
      },
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((u) => {
    const n = u.trim();
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}
