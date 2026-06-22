import { app } from "./app";
import type { Env } from "./types";
import { parseBearer, timingSafeEqual } from "./lib/auth";
import { PodcastMCP } from "./mcp/agent";

// The Workflow class must be exported from the Worker entry so the runtime can
// instantiate it (see `workflows[].class_name` in wrangler.jsonc).
export { EpisodeWorkflow } from "./workflow/episode-workflow";

// The McpAgent class must be a named top-level export so the Workers runtime
// can instantiate it as a Durable Object (see `durable_objects` in wrangler.jsonc).
export { PodcastMCP } from "./mcp/agent";

const mcpHandler = PodcastMCP.serve("/mcp", { binding: "PodcastMCP" });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith("/mcp")) {
      if (!env.API_TOKEN) {
        return Response.json({ error: "api_token_not_configured" }, { status: 401 });
      }
      const token = parseBearer(request.headers.get("Authorization"));
      if (!token || !timingSafeEqual(token, env.API_TOKEN)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return mcpHandler.fetch(request, env, ctx);
    }

    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
