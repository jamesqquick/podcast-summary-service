import type { AuraVoice } from "./lib/tts/voices";

/**
 * Worker environment. `Cloudflare.Env` is generated from `wrangler.jsonc` by
 * `wrangler types` (AI, EPISODES_BUCKET, EPISODE_WORKFLOW, PUBLIC_BASE_URL,
 * DEFAULT_VOICE). Secrets are not generated, so they are declared here.
 */
export interface Env extends Cloudflare.Env {
  /** Shared bearer token guarding the control API. Set via `wrangler secret put API_TOKEN`. */
  API_TOKEN: string;
}

export type EpisodeStatus = "queued" | "processing" | "ready" | "failed";

/** Coarse pipeline phase, surfaced for progress visibility. */
export type EpisodeStage =
  | "queued"
  | "extracting"
  | "writing_script"
  | "synthesizing"
  | "stitching"
  | "done";

/** Per-link extraction outcome recorded on the episode. */
export interface EpisodeSource {
  url: string;
  title?: string;
  /** Whether usable readable content was extracted from this link. */
  ok: boolean;
}

/**
 * The canonical episode record, persisted as JSON in R2 at
 * `episodes/{id}/meta.json` and updated as the Workflow progresses.
 */
export interface EpisodeRecord {
  id: string;
  status: EpisodeStatus;
  stage: EpisodeStage;
  /** Final title (requested title if provided, otherwise AI-generated). */
  title: string;
  requestedTitle?: string;
  voice: AuraVoice;
  links: string[];
  sources: EpisodeSource[];
  createdAt: string;
  updatedAt: string;
  segmentCount?: number;
  durationEstimateSeconds?: number;
  audioKey?: string;
  audioByteLength?: number;
  workflowInstanceId?: string;
  /** Present only when status is "failed". */
  error?: string;
}

/** Parameters passed to the EpisodeWorkflow instance. */
export interface EpisodeWorkflowParams {
  episodeId: string;
  links: string[];
  requestedTitle?: string;
  voice: AuraVoice;
}

/** Public projection of an episode returned by the API (no internal keys). */
export interface EpisodeView {
  id: string;
  status: EpisodeStatus;
  stage: EpisodeStage;
  title: string;
  voice: AuraVoice;
  links: string[];
  sources: EpisodeSource[];
  createdAt: string;
  updatedAt: string;
  segmentCount?: number;
  durationEstimateSeconds?: number;
  /** Absolute URL to the finished MP3, present once status is "ready". */
  audioUrl?: string;
  error?: string;
}
