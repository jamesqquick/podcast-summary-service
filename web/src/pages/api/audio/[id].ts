/**
 * GET|HEAD /api/audio/:id
 *
 * Proxies audio from the Worker to the browser on the same origin, which
 * avoids two problems in local dev:
 *
 *   1. The Worker returns an audioUrl based on PUBLIC_BASE_URL (set to the
 *      production domain in wrangler.jsonc), not localhost, so the browser
 *      would try to fetch audio from the wrong host.
 *   2. The Worker sends no CORS headers, so the browser rejects cross-origin
 *      audio responses when Astro (4321) and the Worker (8787) are on
 *      different ports.
 *
 * Forwards Range headers so seeking works correctly in the AudioPlayer.
 * The audio endpoint on the Worker is already public (no auth required).
 */
import type { APIRoute } from "astro";

export const prerender = false;

async function proxyAudio(id: string, request: Request, headOnly: boolean): Promise<Response> {
  const apiUrl = import.meta.env.API_URL;

  if (!apiUrl) {
    return new Response("API_URL is not configured", { status: 500 });
  }

  const upstreamHeaders: Record<string, string> = {};
  const range = request.headers.get("Range");
  if (range) upstreamHeaders["Range"] = range;

  const upstream = await fetch(`${apiUrl}/episodes/${id}/audio.mp3`, {
    method: headOnly ? "HEAD" : "GET",
    headers: upstreamHeaders,
  });

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", upstream.headers.get("Content-Type") ?? "audio/mpeg");
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "public, max-age=3600");

  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  const contentRange = upstream.headers.get("Content-Range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  const etag = upstream.headers.get("ETag");
  if (etag) responseHeaders.set("ETag", etag);

  return new Response(headOnly ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET: APIRoute = ({ params, request }) =>
  proxyAudio(params.id!, request, false);

export const HEAD: APIRoute = ({ params, request }) =>
  proxyAudio(params.id!, request, true);
