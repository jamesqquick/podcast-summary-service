import { defineConfig } from "vitest/config";

// Pure-logic unit tests run in a plain Node environment. Modules under test are
// written to be binding-free (AI / R2 / Workflow bindings are injected as
// parameters), so they can be exercised without the Workers runtime.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    environment: "node",
  },
});
