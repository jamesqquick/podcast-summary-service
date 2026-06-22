import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // All pages are SSR by default so the share page can fetch episode data
  // and set per-episode OG tags. Static pages opt out with `export const prerender = true`.
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
