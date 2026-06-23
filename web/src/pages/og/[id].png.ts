import type { APIRoute } from "astro";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import type { EpisodeView } from "../../lib/api";

export const prerender = false;

// ── WASM init (once per CF Workers isolate) ──────────────────────────────────
let resvgReady = false;
let resvgInitPromise: Promise<void> | null = null;

function fetchStaticAsset(env: CloudflareEnv, requestUrl: URL, path: string): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL(path, requestUrl)));
}

function ensureResvg(): Promise<void> {
  if (resvgReady) return Promise.resolve();
  if (!resvgInitPromise) {
    resvgInitPromise = initWasm(resvgWasm)
      .then(() => {
        resvgReady = true;
      })
      .catch((err) => {
        // Allow retry on next request
        resvgInitPromise = null;
        throw err;
      });
  }
  return resvgInitPromise;
}

function fallbackImage(requestUrl: URL): Response {
  return Response.redirect(new URL("/og-default.png", requestUrl).href, 302);
}

// ── Waveform (deterministic per episode ID) ──────────────────────────────────
function seededWaveform(id: string, count: number): number[] {
  // djb2 hash
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i);
  return Array.from({ length: count }, (_, i) => {
    const v = Math.abs(
      Math.sin((h + i) * 0.7) * 0.75 + Math.sin((h * 1.3 + i) * 0.4) * 0.25,
    );
    return 0.15 + v * 0.85; // 0.15 – 1.0
  });
}

function fmtDuration(seconds?: number): string {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// ── Design tokens (match global.css) ─────────────────────────────────────────
const C = {
  BG: "#08080f",
  SURFACE: "#0f0f1a",
  DEEP: "#1a0f2e",
  ACCENT: "#7c3aed",
  ACCENT_LIGHT: "#a78bfa",
  TEXT: "#f0eff9",
  MUTED: "#8b8a9b",
  FAINT: "#4a4960",
} as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── OG card layout (1200 × 630) ───────────────────────────────────────────────
function buildCard(title: string, meta: string, bars: number[]): string {
  const BAR_W = 9;
  const BAR_GAP = 5;
  const BAR_MAX_H = 68;

  // Truncate long titles to two visual lines
  const displayTitle = escapeXml(title.length > 82 ? title.slice(0, 80) + "..." : title);
  const displayMeta = escapeXml(meta);
  const waveBars = bars
    .map((barH, i) => {
      const height = Math.max(4, Math.round(barH * BAR_MAX_H));
      const x = 72 + i * (BAR_W + BAR_GAP);
      const y = 534 - height;
      const opacity = (0.25 + barH * 0.75).toFixed(3);
      return `<rect x="${x}" y="${y}" width="${BAR_W}" height="${height}" rx="3" fill="${C.ACCENT}" opacity="${opacity}" />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${C.BG}" />
      <stop offset="0.55" stop-color="${C.SURFACE}" />
      <stop offset="1" stop-color="${C.DEEP}" />
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.ACCENT}" stop-opacity="0.20" />
      <stop offset="1" stop-color="${C.ACCENT}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <circle cx="180" cy="160" r="260" fill="url(#glow)" />
  <rect x="72" y="56" width="44" height="44" rx="12" fill="${C.ACCENT}" />
  <rect x="86" y="67" width="16" height="22" rx="5" fill="#fff" />
  <text x="130" y="89" fill="${C.TEXT}" font-family="Lato" font-size="26" font-weight="700" letter-spacing="-0.5">Drop</text>
  <text x="190" y="89" fill="${C.ACCENT_LIGHT}" font-family="Lato" font-size="26" font-weight="700" letter-spacing="-0.5">cast</text>
  <text x="72" y="282" fill="${C.TEXT}" font-family="Lato" font-size="54" font-weight="800" letter-spacing="-1.5">${displayTitle}</text>
  <text x="72" y="331" fill="${C.MUTED}" font-family="Lato" font-size="21" font-weight="400">${displayMeta}</text>
  ${waveBars}
  <text x="72" y="575" fill="${C.FAINT}" font-family="Lato" font-size="16" font-weight="400" letter-spacing="0.4">dropcast.app</text>
</svg>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export const GET: APIRoute = async (context) => {
  const { id } = context.params;
  if (!id) return new Response("Not found", { status: 404 });

  const env = context.locals.runtime.env;
  let episode: EpisodeView | null = null;
  try {
    const upstream = await env.PODCAST_API.fetch(
      new Request(`http://podcast-api/episodes/${id}`),
    );
    if (!upstream.ok) return new Response("Not found", { status: upstream.status });
    episode = await upstream.json() as EpisodeView;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  if (!episode || episode.status !== "ready") {
    // Non-ready episodes: redirect to the default static card
    return context.redirect(new URL("/og-default.png", context.url).href, 302);
  }

  // Build meta string
  const sourceCount = episode.sources.filter((s) => s.ok).length;
  const duration = fmtDuration(episode.durationEstimateSeconds);
  const meta = [
    `${sourceCount} source${sourceCount !== 1 ? "s" : ""}`,
    duration || null,
    episode.voice,
  ]
    .filter(Boolean)
    .join(" · ");

  const bars = seededWaveform(id, 48);
  const card = buildCard(episode.title, meta, bars);

  // Initialize resvg WASM
  try {
    await ensureResvg();
  } catch (err) {
    console.error("[og] resvg init failed:", err);
    return fallbackImage(context.url);
  }

  // Resvg accepts raw TTF buffers for SVG text rendering.
  let regularFontData: ArrayBuffer;
  let boldFontData: ArrayBuffer;
  try {
    const [regularFontRes, boldFontRes] = await Promise.all([
      fetchStaticAsset(env, context.url, "/fonts/lato-regular.ttf"),
      fetchStaticAsset(env, context.url, "/fonts/lato-extrabold.ttf"),
    ]);
    if (!regularFontRes.ok) throw new Error(`Regular font fetch failed: ${regularFontRes.status}`);
    if (!boldFontRes.ok) throw new Error(`Bold font fetch failed: ${boldFontRes.status}`);
    [regularFontData, boldFontData] = await Promise.all([
      regularFontRes.arrayBuffer(),
      boldFontRes.arrayBuffer(),
    ]);
  } catch (err) {
    console.error("[og] font load failed:", err);
    return fallbackImage(context.url);
  }

  // Render: element tree → SVG → PNG
  let png: Uint8Array;
  try {
    const resvg = new Resvg(card, {
      fitTo: { mode: "width", value: 1200 },
      font: {
        defaultFontFamily: "Lato",
        loadSystemFonts: false,
        fontBuffers: [new Uint8Array(regularFontData), new Uint8Array(boldFontData)],
      },
    });
    const rendered = resvg.render();
    png = rendered.asPng();
  } catch (err) {
    console.error("[og] render failed:", err);
    return fallbackImage(context.url);
  }
  // Slice to a plain ArrayBuffer so it satisfies BodyInit across all type environments
  const body = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);

  return new Response(body as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      // Immutable: episode content never changes once ready
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
};
