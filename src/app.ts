import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "./types";
import { HttpError, ValidationError } from "./lib/errors";
import { episodes } from "./routes/episodes";

export const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.json({
    service: "podcast-summary-service",
    status: "ok",
    endpoints: {
      createEpisode: "POST /episodes",
      getEpisode: "GET /episodes/:id",
      episodeAudio: "GET /episodes/:id/audio.mp3",
    },
  }),
);

app.route("/episodes", episodes);

app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    const issues = err instanceof ValidationError ? err.issues : undefined;
    return c.json(
      { error: { code: err.code, message: err.message, ...(issues ? { issues } : {}) } },
      err.status as ContentfulStatusCode,
    );
  }
  console.error("Unhandled error:", err instanceof Error ? (err.stack ?? err.message) : err);
  return c.json({ error: { code: "internal_error", message: "Internal server error" } }, 500);
});
