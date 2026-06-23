/**
 * GET|HEAD /api/audio/:id
 *
 * Proxies audio from the backend Worker to the browser on the same origin,
 * forwarding Range headers so seeking works correctly in the AudioPlayer.
 */
import type { APIRoute } from "astro";

export const prerender = false;

async function proxyAudio(
  id: string,
  request: Request,
  headOnly: boolean,
  env: App.Locals["runtime"]["env"],
): Promise<Response> {
  const upstreamHeaders: Record<string, string> = {};
  const range = request.headers.get("Range");
  if (range) upstreamHeaders["Range"] = range;

  const upstream = await env.PODCAST_API.fetch(
    new Request(`http://podcast-api/episodes/${id}/audio.mp3`, {
      method: headOnly ? "HEAD" : "GET",
      headers: upstreamHeaders,
    }),
  );

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

export const GET: APIRoute = ({ params, request, locals }) =>
  proxyAudio(params.id!, request, false, locals.runtime.env);

export const HEAD: APIRoute = ({ params, request, locals }) =>
  proxyAudio(params.id!, request, true, locals.runtime.env);
