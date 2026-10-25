import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "convex/**/*.test.ts"],
    environment: "edge-runtime",
    server: {
      deps: {
        inline: ["convex-test", "@convex-dev/workflow", "@convex-dev/workpool"],
      },
    },
  },
});
