# Podcast Summary Service

Turn a list of links into an AI-generated audio podcast.

The backend Worker fetches each page, writes one spoken-word script with Workers AI, narrates it with Deepgram Aura, and stores the finished MP3 in R2. The web app provides a simple Dropcast UI for generating and listening to episodes.

## Stack

- Cloudflare Workers for the API
- Cloudflare Workflows for the generation pipeline
- Workers AI for script generation and text-to-speech
- R2 for episode metadata, segments, and final audio
- Astro for the Dropcast web app
- MCP for agent access to podcast generation

## Repo Layout

- `src/` - backend Worker, API, workflow, storage, TTS, and MCP agent
- `web/` - Dropcast frontend
- `scripts/` - provisioning helpers

## What It Does

- `POST /episodes` creates an episode from a list of URLs and starts the workflow
- `GET /episodes/:id` returns episode status and metadata
- `GET /episodes/:id/audio.mp3` streams the finished MP3 with Range support
- `/mcp` exposes a `generate_podcast` tool for agent clients
- The web app proxies browser requests to the backend through a Cloudflare service binding

## Requirements

- Node.js 20+
- `pnpm`
- A Cloudflare account with Workers, R2, Workflows, Workers AI, and KV available

## Setup

```bash
pnpm install
```

### Backend config

Set the API secret:

```bash
pnpm exec wrangler secret put API_TOKEN
```

Optional backend vars are configured in `wrangler.jsonc`:

- `PUBLIC_BASE_URL`
- `DEFAULT_VOICE`
- `AI_GATEWAY_ID`

### Web config

The web app uses:

- `PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY` (secret)
- `RATE_KV`
- `DISABLE_RATE_LIMIT`

## Local Development

Run the backend Worker:

```bash
pnpm dev
```

Run the web app in a second terminal:

```bash
pnpm --dir web dev
```

Useful checks:

```bash
pnpm test
pnpm typecheck
pnpm --dir web typecheck
```

## Deploy

One-shot provisioning:

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> ./scripts/provision.sh
```

That script creates the R2 buckets, deploys the backend, and sets `API_TOKEN`.

To deploy the web app:

```bash
pnpm --dir web deploy
```

When connected through Cloudflare Git integration, pushes to `main` will trigger the backend Worker and web app builds automatically.

## API

### `POST /episodes`

Create a new episode.

```jsonc
{
  "links": ["https://example.com/a", "https://example.com/b"],
  "title": "My Morning Rundown",
  "voice": "asteria"
}
```

Auth:

```bash
Authorization: Bearer <API_TOKEN>
```

### `GET /episodes/:id`

Poll episode status. Returns `queued`, `processing`, `ready`, or `failed`.

### `GET /episodes/:id/audio.mp3`

Streams the finished MP3. Supports `HEAD` and HTTP `Range` requests.

## Web App

- `/` - marketing homepage
- `/create` - link entry and generation form
- `/e/:id` - episode playback page
- `/api/generate` - public generation endpoint with Turnstile and rate limiting
- `/api/episodes/:id` - status proxy
- `/api/audio/:id` - same-origin audio proxy for the player
- `/og/:id.png` - share image for ready episodes

## MCP Tool

The backend also exposes a private MCP endpoint at `/mcp`.

Tool:

- `generate_podcast`

Inputs:

- `urls` - 1 to 25 URLs
- `title` - optional episode title
- `voice` - optional Aura voice

## Voices

Supported Aura voices:

`angus`, `asteria`, `arcas`, `orion`, `orpheus`, `athena`, `luna`, `zeus`, `perseus`, `helios`, `hera`, `stella`

## Notes

- Pages that cannot be read are skipped instead of failing the whole episode.
- The workflow persists progress in R2 so polling always reflects the latest state.
- The web app uses a service binding, so browser traffic does not need to talk to the backend Worker directly.
