/**
 * GET /api/episodes/:id
 *
 * Proxies episode status polling from the Generator island to the Worker API.
 * Keeps API_TOKEN server-side. Once GET /episodes/:id is made public on the
 * Worker (Phase 1), the Authorization header can be removed here.
 */
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  const apiUrl = import.meta.env.API_URL;
  const apiToken = import.meta.env.API_TOKEN;

  if (!apiUrl) {
    return Response.json({ error: "API_URL is not configured" }, { status: 500 });
  }

  const headers: Record<string, string> = {};
  if (apiToken) {
    headers["Authorization"] = `Bearer ${apiToken}`;
  }

  const upstream = await fetch(`${apiUrl}/episodes/${id}`, { headers });
  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
};
