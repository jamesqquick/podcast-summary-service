/** Result of a rate-limit check. */
export interface RateLimitResult {
  allowed: boolean;
  count: number;
}

/**
 * Check and increment the per-IP daily generation counter in KV.
 *
 * Key pattern: `rate:ip:<ip>:<YYYY-MM-DD>`
 * Value:       integer stored as a string (KV is string-only)
 * TTL:         86400 seconds (auto-expires; no cleanup needed)
 *
 * Note: this is a read-then-write — not atomic. Two concurrent requests from
 * the same IP can both read count=limit-1 and both be allowed. At demo scale
 * this race window is negligible. Swap for a Durable Object counter if strict
 * enforcement is needed later.
 */
export async function checkAndIncrementIpLimit(
  kv: KVNamespace,
  ip: string,
  limit: number,
): Promise<RateLimitResult> {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `rate:ip:${ip}:${date}`;

  const raw = await kv.get(key);
  const count = raw === null ? 0 : parseInt(raw, 10);

  if (count >= limit) {
    return { allowed: false, count };
  }

  await kv.put(key, String(count + 1), { expirationTtl: 86400 });
  return { allowed: true, count: count + 1 };
}
