import { app } from "./app";
import type { Env } from "./types";

// The Workflow class must be exported from the Worker entry so the runtime can
// instantiate it (see `workflows[].class_name` in wrangler.jsonc).
export { EpisodeWorkflow } from "./workflow/episode-workflow";

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
