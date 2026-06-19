import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";
import { UnauthorizedError } from "./errors";

/**
 * Constant-time string comparison to avoid leaking the token via timing.
 * Compares encoded bytes; returns false immediately only on length mismatch
 * (length is not secret here, and short-circuiting keeps the common path cheap).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let mismatch = 0;
  for (let i = 0; i < aBytes.length; i++) {
    mismatch |= aBytes[i]! ^ bBytes[i]!;
  }
  return mismatch === 0;
}

/** Extract a bearer token from an Authorization header value. */
export function parseBearer(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/**
 * Hono middleware enforcing `Authorization: Bearer <API_TOKEN>`.
 *
 * Fails closed: if `API_TOKEN` is not configured, every request is rejected
 * rather than silently allowing unauthenticated access.
 */
export const requireApiToken: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const expected = c.env.API_TOKEN;
  if (!expected) {
    throw new UnauthorizedError("Service is missing API_TOKEN configuration");
  }
  const provided = parseBearer(c.req.header("Authorization"));
  if (!provided || !timingSafeEqual(provided, expected)) {
    throw new UnauthorizedError();
  }
  await next();
};
