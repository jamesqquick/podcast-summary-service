import { Hono } from "hono";
import type { Env, EpisodeRecord, EpisodeView } from "../types";
import { CreateEpisodeSchema } from "../lib/validation";
import { requireApiToken } from "../lib/auth";
import { NotFoundError, ValidationError } from "../lib/errors";
import { generateEpisodeId, isValidEpisodeId } from "../lib/ids";
import { resolveVoice } from "../lib/tts/voices";
import { EpisodeStore } from "../lib/storage/episodes";

export const episodes = new Hono<{ Bindings: Env }>();

/** POST /episodes — accept links and kick off generation. */
episodes.post("/", requireApiToken, async (c) => {
  const body = await readJson(c.req.raw);
  const parsed = CreateEpisodeSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid request body", parsed.error.flatten());
  }

  const { links, title, voice } = parsed.data;
  const resolvedVoice = resolveVoice(voice, c.env.DEFAULT_VOICE);
  const episodeId = generateEpisodeId();
  const now = new Date().toISOString();

  const record: EpisodeRecord = {
    id: episodeId,
    status: "queued",
    stage: "queued",
    title: title ?? "Untitled episode",
    requestedTitle: title,
    voice: resolvedVoice,
    links,
    sources: [],
    createdAt: now,
    updatedAt: now,
  };

  const store = new EpisodeStore(c.env.EPISODES_BUCKET);
  await store.create(record);

  // Use the episode id as the Workflow instance id for a 1:1 mapping.
  const instance = await c.env.EPISODE_WORKFLOW.create({
    id: episodeId,
    params: { episodeId, links, requestedTitle: title, voice: resolvedVoice },
  });
  if (instance.id !== episodeId) {
    await store.patch(episodeId, { workflowInstanceId: instance.id });
  }

  return c.json(toView(record, baseUrl(c.req.raw, c.env)), 202);
});

/** GET /episodes/:id — current status and (when ready) the audio URL. */
episodes.get("/:id", requireApiToken, async (c) => {
  const id = c.req.param("id");
  if (!isValidEpisodeId(id)) throw new ValidationError("Malformed episode id");

  const store = new EpisodeStore(c.env.EPISODES_BUCKET);
  const record = await store.get(id);
  if (!record) throw new NotFoundError(`Episode ${id} not found`);

  const reconciled = await reconcileWithWorkflow(c.env, record, store);
  return c.json(toView(reconciled, baseUrl(c.req.raw, c.env)));
});

/** GET/HEAD /episodes/:id/audio.mp3 — public, capability-gated by the id. */
episodes.on(["GET", "HEAD"], "/:id/audio.mp3", async (c) => {
  const id = c.req.param("id");
  if (!isValidEpisodeId(id)) throw new NotFoundError("Episode not found");

  const store = new EpisodeStore(c.env.EPISODES_BUCKET);
  const record = await store.get(id);
  if (!record || record.status !== "ready" || !record.audioKey) {
    throw new NotFoundError("Episode audio is not available");
  }

  return serveAudio(c.req.raw, store, id);
});

// ── Helpers ─────────────────────────────────────────────────────────

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

function baseUrl(request: Request, env: Env): string {
  const configured = env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

function toView(record: EpisodeRecord, base: string): EpisodeView {
  return {
    id: record.id,
    status: record.status,
    stage: record.stage,
    title: record.title,
    voice: record.voice,
    links: record.links,
    sources: record.sources,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    segmentCount: record.segmentCount,
    durationEstimateSeconds: record.durationEstimateSeconds,
    audioUrl:
      record.status === "ready" ? `${base}/episodes/${record.id}/audio.mp3` : undefined,
    transcript: record.transcript,
    error: record.error,
  };
}

/**
 * If the stored record is still mid-flight but the Workflow instance has
 * errored or been terminated, persist and reflect a failed status so callers
 * are never left polling a dead job. Defensive: any lookup error is ignored.
 */
async function reconcileWithWorkflow(
  env: Env,
  record: EpisodeRecord,
  store: EpisodeStore,
): Promise<EpisodeRecord> {
  if (record.status === "ready" || record.status === "failed") return record;
  try {
    const instance = await env.EPISODE_WORKFLOW.get(record.workflowInstanceId ?? record.id);
    const { status, error } = await instance.status();
    if (status === "errored" || status === "terminated") {
      return store.patch(record.id, {
        status: "failed",
        error: error?.message ?? `Workflow ${status}`,
      });
    }
  } catch {
    // No instance or transient error — keep the stored record as-is.
  }
  return record;
}

interface ResolvedRange {
  offset: number;
  length: number;
}

/** Serve the episode MP3 from R2 with HTTP Range support for seeking. */
async function serveAudio(request: Request, store: EpisodeStore, id: string): Promise<Response> {
  const head = await store.headAudio(id);
  if (!head) throw new NotFoundError("Episode audio is not available");

  const total = head.size;
  const baseHeaders = new Headers();
  baseHeaders.set("Content-Type", "audio/mpeg");
  baseHeaders.set("Accept-Ranges", "bytes");
  baseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
  baseHeaders.set("ETag", head.httpEtag);

  if (request.method === "HEAD") {
    baseHeaders.set("Content-Length", String(total));
    return new Response(null, { status: 200, headers: baseHeaders });
  }

  const resolved = resolveRange(request.headers.get("Range"), total);
  if (resolved === "unsatisfiable") {
    baseHeaders.set("Content-Range", `bytes */${total}`);
    return new Response(null, { status: 416, headers: baseHeaders });
  }

  if (resolved) {
    const object = await store.getAudioObject(id, resolved);
    if (!object) throw new NotFoundError("Episode audio is not available");
    baseHeaders.set("Content-Range", `bytes ${resolved.offset}-${resolved.offset + resolved.length - 1}/${total}`);
    baseHeaders.set("Content-Length", String(resolved.length));
    return new Response(object.body, { status: 206, headers: baseHeaders });
  }

  const object = await store.getAudioObject(id);
  if (!object) throw new NotFoundError("Episode audio is not available");
  baseHeaders.set("Content-Length", String(total));
  return new Response(object.body, { status: 200, headers: baseHeaders });
}

/**
 * Resolve a single `bytes=` Range header against the known object size.
 * Returns a concrete offset/length, `null` to serve the full body, or
 * "unsatisfiable" for a 416. Multi-range and malformed headers fall back to null.
 */
export function resolveRange(
  header: string | null,
  total: number,
): ResolvedRange | null | "unsatisfiable" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  if (startRaw === "" && endRaw === "") return null;

  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (suffix <= 0) return "unsatisfiable";
    const offset = Math.max(0, total - suffix);
    return { offset, length: total - offset };
  }

  const offset = Number(startRaw);
  if (offset >= total) return "unsatisfiable";
  const end = endRaw === "" ? total - 1 : Math.min(Number(endRaw), total - 1);
  if (end < offset) return "unsatisfiable";
  return { offset, length: end - offset + 1 };
}
