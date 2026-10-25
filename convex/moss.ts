"use node";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { searchMoss } from "../src/lib/integrations/moss";
import type { Doc } from "./_generated/dataModel";

export const search = internalAction({
  args: { id: v.id("retrievals") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const record: Doc<"retrievals"> | null = await ctx.runQuery(
      internal.retrievalRecords.read,
      { id },
    );
    if (!record || record.status === "completed") return null;
    if (!env.MOSS_PROJECT_ID || !env.MOSS_PROJECT_KEY) {
      await ctx.runMutation(internal.retrievalRecords.finish, {
        id,
        outcome: "disabled",
        hits: [],
      });
      return null;
    }
    if (!record.documents.length) {
      await ctx.runMutation(internal.retrievalRecords.finish, {
        id,
        outcome: "empty",
        hits: [],
      });
      return null;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        searchMoss(
          { projectId: env.MOSS_PROJECT_ID, projectKey: env.MOSS_PROJECT_KEY },
          `attest-${id}`,
          record.documents,
          record.query,
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), 45000);
        }),
      ]);
      await ctx.runMutation(internal.retrievalRecords.finish, {
        id,
        outcome: "moss",
        ...result,
      });
    } catch {
      // SDK diagnostics can contain configuration or tokens. Persist a safe operational message only.
      await ctx.runMutation(internal.retrievalRecords.finish, {
        id,
        outcome: "unavailable",
        hits: [],
        error:
          "Moss search failed or exceeded 45 seconds. Structured Convex evidence remains available; check the project credentials and native runtime.",
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    return null;
  },
});
