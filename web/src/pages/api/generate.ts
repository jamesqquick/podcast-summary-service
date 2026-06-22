/**
 * POST /api/generate
 *
 * Public entry point for episode creation. Runs two guards before forwarding
 * to the bearer-gated API Worker:
 *
 *   1. Turnstile siteverify  — rejects bots before any AI cost is incurred.
 *      Bypassed in local dev when TURNSTILE_SECRET_KEY is not set.
 *
 *   2. Per-IP daily rate limit — caps each client IP at IP_DAILY_LIMIT (3)
 *      generations per day via KV. Bypassed when DISABLE_RATE_LIMIT is set
 *      (use .dev.vars in local development).
 */
import type { APIRoute } from "astro";
import { verifyTurnstileToken } from "../../lib/turnstile";
import { checkAndIncrementIpLimit } from "../../lib/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const apiUrl = env.API_URL ?? import.meta.env.API_URL;
  const apiToken = env.API_TOKEN ?? import.meta.env.API_TOKEN;

  if (!apiUrl) {
    return Response.json({ error: "API_URL is not configured" }, { status: 500 });
  }

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

  // Strip the Turnstile token before forwarding — the API Worker doesn't know about it.
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
        {
          error: "Daily limit reached",
          limit,
          reset: tomorrow.toISOString().slice(0, 10),
        },
        { status: 429 },
      );
    }
  }

  // ── Forward to upstream API Worker ───────────────────────────────────────
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiToken) {
    headers["Authorization"] = `Bearer ${apiToken}`;
  }

  const upstream = await fetch(`${apiUrl}/episodes`, {
    method: "POST",
    headers,
    body: JSON.stringify(upstreamBody),
  });

  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
};
