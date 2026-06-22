/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  // Bindings
  RATE_KV: KVNamespace;

  // Vars
  API_URL: string;
  IP_DAILY_LIMIT: string;
  /** Non-empty string disables per-IP rate limiting. Local dev only via .dev.vars. */
  DISABLE_RATE_LIMIT: string;

  // Secrets
  API_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
}

type Runtime = import("@astrojs/cloudflare").Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
