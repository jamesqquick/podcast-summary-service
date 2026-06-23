/**
 * POST /api/generate
 *
 * Public entry point for episode creation. Runs two guards before forwarding
 * to the backend Worker via service binding (no public HTTP, no shared token):
 *
 *   1. Turnstile siteverify  — rejects bots before any AI cost is incurred.
 *      Bypassed in local dev when TURNSTILE_SECRET_KEY is not set.
 *
 *   2. Per-IP daily rate limit — caps each client IP at IP_DAILY_LIMIT (3)
 *      generations per day via KV. Bypassed when DISABLE_RATE_LIMIT is set.
 */
import type { APIRoute } from "astro";
import { verifyTurnstileToken } from "../../lib/turnstile";
import { checkAndIncrementIpLimit } from "../../lib/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  // ── Guard 1: Turnstile siteverify ────────────────────────────────────────
  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const token = typeof body.cfTurnstileToken === "string" ? body.cfTurnstileToken : "";
    if (!token) {
      return Response.json({ error: "Verification required" }, { status: 403 });
    }
    const valid = await verifyTurnstileToken(token, turnstileSecret);
    if (!valid) {
      return Response.json({ error: "Verification failed" }, { status: 403 });
    }
  }

  // Strip the Turnstile token before forwarding — the backend doesn't know about it.
  const { cfTurnstileToken: _stripped, ...upstreamBody } = body;

  // ── Guard 2: Per-IP daily rate limit ─────────────────────────────────────
  const disableRateLimit = env.DISABLE_RATE_LIMIT;
  if (!disableRateLimit) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const limit = parseInt(env.IP_DAILY_LIMIT ?? "3", 10);
    const result = await checkAndIncrementIpLimit(env.RATE_KV, ip, limit);
    if (!result.allowed) {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      return Response.json(
        { error: "Daily limit reached", limit, reset: tomorrow.toISOString().slice(0, 10) },
        { status: 429 },
      );
    }
  }

  // ── Forward to backend via service binding ────────────────────────────────
  const upstream = await env.PODCAST_API.fetch(
    new Request("http://podcast-api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamBody),
    }),
  );

  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
};
