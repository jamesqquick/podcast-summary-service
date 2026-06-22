/**
 * Typed wrapper for the Dropcast API Worker.
 *
 * The GET /episodes/:id endpoint is currently auth-gated. Once Phase 1
 * (public endpoints + Turnstile) ships, the `token` param can be removed
 * from `getEpisode` and `createEpisode` will use a Turnstile token instead.
 */

export type EpisodeStatus = "queued" | "processing" | "ready" | "failed";

export type EpisodeStage =
  | "queued"
  | "extracting"
  | "writing_script"
  | "synthesizing"
  | "stitching"
  | "done";

export interface EpisodeSource {
  url: string;
  title?: string;
  ok: boolean;
}

/** Public shape returned by GET /episodes/:id */
export interface EpisodeView {
  id: string;
  status: EpisodeStatus;
  stage: EpisodeStage;
  title: string;
  voice: string;
  links: string[];
  sources: EpisodeSource[];
  createdAt: string;
  updatedAt: string;
  segmentCount?: number;
  durationEstimateSeconds?: number;
  /** Absolute URL to the MP3. Present once status === "ready". */
  audioUrl?: string;
  /**
   * The spoken-word script/transcript.
   * NOTE: not yet stored by the Worker — add `transcript` to EpisodeRecord
   * and surface it in the EpisodeView projection as part of Phase 1 backend work.
   */
  transcript?: string;
  error?: string;
}

export interface CreateEpisodeInput {
  links: string[];
  title?: string;
  voice?: string;
  /** Cloudflare Turnstile token. Required once Phase 1 backend lands. */
  cfTurnstileToken?: string;
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let message = `Request failed: ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    message = body.message ?? body.error ?? message;
  } catch {
    // ignore parse error, use status message
  }
  throw new ApiError(res.status, message);
}

/** Fetch episode metadata. Pass token until GET /episodes/:id is made public. */
export async function getEpisode(
  baseUrl: string,
  id: string,
  token?: string,
): Promise<EpisodeView> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/episodes/${id}`, { headers });
  return handleResponse<EpisodeView>(res);
}

/**
 * Create a new episode.
 * In dev: uses the bearer token.
 * In production (Phase 1): passes cfTurnstileToken, no bearer.
 */
export async function createEpisode(
  baseUrl: string,
  input: CreateEpisodeInput,
  token?: string,
): Promise<EpisodeView> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/episodes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      links: input.links,
      ...(input.title ? { title: input.title } : {}),
      ...(input.voice ? { voice: input.voice } : {}),
    }),
  });
  return handleResponse<EpisodeView>(res);
}
