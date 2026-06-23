import type { APIRoute } from "astro";
import type { ReactNode } from "react";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { EpisodeView } from "../../lib/api";

export const prerender = false;

// ── WASM init (once per CF Workers isolate) ──────────────────────────────────
let resvgReady = false;
let resvgInitPromise: Promise<void> | null = null;

function ensureResvg(requestUrl: URL): Promise<void> {
  if (resvgReady) return Promise.resolve();
  if (!resvgInitPromise) {
    resvgInitPromise = fetch(new URL("/wasm/resvg.wasm", requestUrl))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch resvg.wasm: ${res.status}`);
        return initWasm(res);
      })
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

// ── Satori element helpers ────────────────────────────────────────────────────
type SatoriChild = SatoriNode | string | null | undefined;
interface SatoriNode {
  type: string;
  props: Record<string, unknown> & { children?: SatoriChild | SatoriChild[] };
}

function h(
  type: string,
  style: Record<string, unknown>,
  ...children: SatoriChild[]
): SatoriNode {
  const kids = children.filter((c) => c != null);
  return {
    type,
    props: {
      style,
      children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids,
    },
  };
}

// ── OG card layout (1200 × 630) ───────────────────────────────────────────────
function buildCard(title: string, meta: string, bars: number[]): SatoriNode {
  const BAR_W = 9;
  const BAR_GAP = 5;
  const BAR_MAX_H = 68;

  // Truncate long titles to two visual lines
  const displayTitle = title.length > 82 ? title.slice(0, 80) + "…" : title;

  return h(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "56px 72px 52px",
      background: `linear-gradient(135deg, ${C.BG} 0%, ${C.SURFACE} 55%, ${C.DEEP} 100%)`,
      position: "relative",
      overflow: "hidden",
    },

    // Background glow blob
    h("div", {
      position: "absolute",
      top: "-100px",
      left: "-80px",
      width: "520px",
      height: "520px",
      background: `radial-gradient(circle, rgba(124,58,237,0.20) 0%, transparent 70%)`,
      borderRadius: "50%",
    }),

    // Top row — Dropcast brand mark
    h(
      "div",
      {
        display: "flex",
        alignItems: "center",
        gap: "14px",
        marginBottom: "auto",
      },
      // Purple square mark
      h(
        "div",
        {
          width: "44px",
          height: "44px",
          background: C.ACCENT,
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
        h("div", {
          width: "16px",
          height: "22px",
          background: "white",
          borderRadius: "3px 9px 9px 3px",
        }),
      ),
      // Wordmark: "Drop" + "cast"
      h(
        "div",
        { display: "flex", alignItems: "center", gap: "0px" },
        h(
          "span",
          { color: C.TEXT, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" },
          "Drop",
        ),
        h(
          "span",
          { color: C.ACCENT_LIGHT, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" },
          "cast",
        ),
      ),
    ),

    // Episode title + meta
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        marginTop: "32px",
        flex: 1,
        justifyContent: "center",
      },
      h(
        "div",
        {
          fontSize: "54px",
          fontWeight: 800,
          color: C.TEXT,
          lineHeight: 1.08,
          letterSpacing: "-1.5px",
          maxWidth: "940px",
        },
        displayTitle,
      ),
      h("div", { fontSize: "21px", color: C.MUTED }, meta),
    ),

    // Waveform bars
    h(
      "div",
      {
        display: "flex",
        alignItems: "flex-end",
        gap: `${BAR_GAP}px`,
        height: `${BAR_MAX_H}px`,
        marginTop: "28px",
        marginBottom: "26px",
      },
      ...bars.map((barH) =>
        h("div", {
          width: `${BAR_W}px`,
          height: `${Math.max(4, Math.round(barH * BAR_MAX_H))}px`,
          background: C.ACCENT,
          borderRadius: "3px",
          opacity: 0.25 + barH * 0.75,
        }),
      ),
    ),

    // Footer — domain
    h("div", { fontSize: "16px", color: C.FAINT, letterSpacing: "0.4px" }, "dropcast.app"),
  );
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
    await ensureResvg(context.url);
  } catch (err) {
    console.error("[og] resvg init failed:", err);
    return new Response("Image renderer unavailable", { status: 500 });
  }

  // Load Inter Bold font from static assets
  let fontData: ArrayBuffer;
  try {
    const fontRes = await fetch(new URL("/fonts/inter-bold.ttf", context.url));
    if (!fontRes.ok) throw new Error(`Font fetch failed: ${fontRes.status}`);
    fontData = await fontRes.arrayBuffer();
  } catch (err) {
    console.error("[og] font load failed:", err);
    return new Response("Font unavailable", { status: 500 });
  }

  // Render: element tree → SVG → PNG
  const svg = await satori(card as unknown as ReactNode, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Inter", data: fontData, weight: 700, style: "normal" }],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  const rendered = resvg.render();
  const png = rendered.asPng();
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
