/**
 * GET /api/episodes/:id
 *
 * Proxies episode status polling to the backend Worker via service binding.
 */
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const { id } = params;
  const env = locals.runtime.env;

  const upstream = await env.PODCAST_API.fetch(
    new Request(`http://podcast-api/episodes/${id}`),
  );
  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
};
