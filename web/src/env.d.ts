/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  // Bindings
  RATE_KV: KVNamespace;
  /** Service binding to the jqq-podcast-generator backend Worker. */
  PODCAST_API: Fetcher;

  // Vars
  IP_DAILY_LIMIT: string;
  /** Non-empty string disables per-IP rate limiting. Local dev only via .dev.vars. */
  DISABLE_RATE_LIMIT: string;

  // Secrets
  TURNSTILE_SECRET_KEY: string;
}

type Runtime = import("@astrojs/cloudflare").Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
