# Podcast Summary Service

A headless service that turns a list of links into an **entertaining, AI-generated audio podcast summary**.

Give it a few URLs, it reads each page, writes one cohesive spoken-word script, narrates it with a natural-sounding voice, and hands back an MP3 you can listen to on the go.

Built entirely on Cloudflare: a [Workers](https://developers.cloudflare.com/workers/) HTTP API, a durable [Workflow](https://developers.cloudflare.com/workflows/) for the generation pipeline, [Workers AI](https://developers.cloudflare.com/workers-ai/) for the script (Llama 4 Scout) and the voice (Deepgram Aura), and [R2](https://developers.cloudflare.com/r2/) for audio storage. No external API keys.

---

## How it works

```
POST /episodes ──▶ create episode record (R2) ──▶ start EpisodeWorkflow
                                                        │
                 ┌──────────────────────────────────────┴───────────────────────────┐
                 ▼                  ▼                    ▼                  ▼
            1. extract        2. write script      3. synthesize        4. stitch
          (fetch + read       (Llama 4 Scout,      (Deepgram Aura,      (concat MP3
           each link)          guided JSON)         one call/segment)    → audio.mp3)
                 │                  │                    │                  │
                 └─────────── progress + results persisted to R2 meta.json ┘

GET /episodes/:id ──▶ status + audioUrl       GET /episodes/:id/audio.mp3 ──▶ the MP3
```

Each stage is a durable, independently-retryable Workflow step. Transient failures (a flaky fetch, a model hiccup) retry just that step instead of regenerating the whole episode, and progress is written to R2 so status polling always reflects the latest state. A link that can't be read is skipped rather than failing the episode.

## Why these choices

- **Workflows** over a queue or cron: the pipeline is multi-step, externally-dependent, and benefits from per-step checkpointing, retries, and built-in status — exactly what Workflows provides. Large audio blobs are written to R2 and steps pass only small keys, sidestepping the 1 MiB step-result limit.
- **Llama 4 Scout** (`@cf/meta/llama-4-scout-17b-16e-instruct`): 131k-token context comfortably fits many full articles, and `guided_json` gives reliable structured output.
- **Deepgram Aura** (`@cf/deepgram/aura-1`): natural pacing and 12 voices, all on Workers AI — no third-party key. Swapping to a two-host format later is just alternating speakers.

## API

All control endpoints require `Authorization: Bearer <API_TOKEN>`. The audio URL is public but unguessable (the episode id is a 128-bit random token), so it can be shared or dropped straight into a player.

### `POST /episodes`

Create an episode and start generation.

```jsonc
// Request body
{
  "links": ["https://example.com/a", "https://example.com/b"], // 1–25 http(s) URLs
  "title": "My Morning Rundown",   // optional; otherwise the model writes one
  "voice": "asteria"               // optional Aura voice (see list below)
}
```

```jsonc
// 202 Accepted
{
  "id": "ep_8x1k...",
  "status": "queued",
  "stage": "queued",
  "title": "My Morning Rundown",
  "voice": "asteria",
  "links": ["https://example.com/a", "https://example.com/b"],
  "sources": [],
  "createdAt": "2026-06-19T13:00:00.000Z",
  "updatedAt": "2026-06-19T13:00:00.000Z"
}
```

### `GET /episodes/:id`

Poll status. `status` moves `queued → processing → ready` (or `failed`); `stage` gives finer progress (`extracting`, `writing_script`, `synthesizing`, `stitching`, `done`).

```jsonc
// 200 OK (once ready)
{
  "id": "ep_8x1k...",
  "status": "ready",
  "stage": "done",
  "title": "Your AI News Rundown",
  "voice": "asteria",
  "links": ["https://example.com/a", "https://example.com/b"],
  "sources": [
    { "url": "https://example.com/a", "title": "Headline A", "ok": true },
    { "url": "https://example.com/b", "title": "Headline B", "ok": true }
  ],
  "segmentCount": 4,
  "durationEstimateSeconds": 312,
  "audioUrl": "https://<your-worker>/episodes/ep_8x1k.../audio.mp3",
  "createdAt": "2026-06-19T13:00:00.000Z",
  "updatedAt": "2026-06-19T13:02:10.000Z"
}
```

### `GET /episodes/:id/audio.mp3`

Streams the finished MP3 from R2. Supports `HEAD` and HTTP `Range` requests for seeking and progressive playback. No auth (capability URL).

### Example

```bash
# Kick off an episode
curl -X POST https://<your-worker>/episodes \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "links": ["https://blog.cloudflare.com/workflows-ga/"] }'

# Poll until status is "ready", then open the audioUrl
curl https://<your-worker>/episodes/ep_8x1k... -H "Authorization: Bearer $API_TOKEN"
```

## Configuration

| Name              | Type     | Where            | Purpose                                                        |
| ----------------- | -------- | ---------------- | -------------------------------------------------------------- |
| `API_TOKEN`       | secret   | `wrangler secret`| Bearer token for the control API. Generate: `openssl rand -hex 32`. |
| `EPISODES_BUCKET` | R2       | `wrangler.jsonc` | Stores episode metadata, segments, and final audio.            |
| `AI`              | Workers AI | `wrangler.jsonc` | Script generation + text-to-speech.                          |
| `EPISODE_WORKFLOW`| Workflow | `wrangler.jsonc` | The generation pipeline.                                       |
| `PUBLIC_BASE_URL` | var      | `wrangler.jsonc` | Base URL for absolute audio links. Empty = use request origin. |
| `DEFAULT_VOICE`   | var      | `wrangler.jsonc` | Default Aura voice when a request omits one.                   |

**Aura voices:** `angus`, `asteria`, `arcas`, `orion`, `orpheus`, `athena`, `luna`, `zeus`, `perseus`, `helios`, `hera`, `stella`.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set API_TOKEN
pnpm dev                          # wrangler dev (R2 + Workflows run locally via Miniflare)
```

Generate binding types after changing `wrangler.jsonc`:

```bash
pnpm cf-typegen
```

## Deploy

```bash
# One-time: create the R2 buckets referenced in wrangler.jsonc
wrangler r2 bucket create podcast-summary-episodes
wrangler r2 bucket create podcast-summary-episodes-preview

# Set the API token secret
wrangler secret put API_TOKEN

pnpm run deploy
```

## Testing

Pure logic (validation, HTML extraction, segmentation, prompt building, response parsing, stitching, range resolution, ids, auth) is covered by fast Node unit tests. Modules that touch bindings keep those bindings injectable so the logic stays testable without the Workers runtime.

```bash
pnpm test         # run once
pnpm test:watch   # watch mode
pnpm typecheck    # regenerate types + tsc
```

## Project structure

```
src/
  index.ts                 Worker entry: exports the Workflow + fetch handler
  app.ts                   Hono app: routing + error handling
  types.ts                 Env + domain types (EpisodeRecord, EpisodeView, ...)
  routes/episodes.ts       POST /episodes, GET /episodes/:id, audio streaming
  workflow/
    episode-workflow.ts    EpisodeWorkflow: extract → script → synthesize → stitch
  lib/
    auth.ts                Bearer-token middleware (constant-time compare)
    validation.ts          Zod request schema
    ids.ts                 Unguessable episode ids
    errors.ts              Typed domain + HTTP errors
    links/                 LinkExtractor interface + fetch impl + HTML→text
    script/                Prompt building, LLM call, TTS segmentation
    tts/                   Aura synthesis, voices, MP3 stitching
    storage/episodes.ts    R2-backed episode persistence
```

## Extending

- **JavaScript-heavy pages:** the workflow depends only on the `LinkExtractor` interface (`src/lib/links/extractor.ts`). Add a [Browser Rendering](https://developers.cloudflare.com/browser-rendering/)-backed implementation and swap it in without touching the pipeline.
- **Two-host banter:** Aura exposes multiple voices; alternate speakers per segment and tweak the prompt to produce a dialogue script.
- **Agentic Inbox integration:** this service is intentionally headless. A future caller (e.g. an email inbox that collects links) just `POST`s a list of links and polls for the audio URL.

## Known trade-offs

- **MP3 stitching** concatenates per-segment MP3 frame data. Standard players decode this seamlessly; a future enhancement could re-mux for perfectly clean frame boundaries.
- **Extraction** uses fetch + a heuristic HTML reader, which covers static and server-rendered pages. Sites that require JavaScript are best handled by adding the Browser Rendering extractor above.
