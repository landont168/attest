import { defineApp } from "convex/server";
import { v } from "convex/values";
import workflow from "@convex-dev/workflow/convex.config.js";
const app = defineApp({
  env: {
    CREAO_API_KEY: v.optional(v.string()),
    CREAO_AGENT_ID: v.optional(v.string()),
    CREAO_POLICY_AGENT_ID: v.optional(v.string()),
    CREAO_POLICY_API_KEY: v.optional(v.string()),
  },
});
app.use(workflow);
export default app;
