import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  apifyRequest,
  ApifyHttpError,
  runSchema,
} from "../src/lib/integrations/apify";
import { validateInput } from "../integrations/apify-actor/src/normalize.mjs";

export const submit = internalAction({
  args: { jobId: v.id("scheduleSyncs") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { jobId }): Promise<string | null> => {
    const job: Doc<"scheduleSyncs"> | null = await ctx.runQuery(
      internal.schedules.readJob,
      { jobId },
    );
    if (!job || job.status === "completed") return null;
    if (job.runId) return job.runId;
    if (job.status !== "queued") {
      await ctx.runMutation(internal.schedules.note, {
        jobId,
        status: "uncertain",
        error:
          "Submission may already exist. Reconcile the run ID in Apify before resuming.",
      });
      return null;
    }
    if (!env.APIFY_API_TOKEN) {
      await ctx.runMutation(internal.schedules.note, {
        jobId,
        status: "failed",
        terminalFailure: true,
        error: "Apify token is not configured.",
      });
      return null;
    }
    const claimed: boolean = await ctx.runMutation(
      internal.schedules.claimSubmission,
      { jobId },
    );
    if (!claimed) return null;
    try {
      const response = await apifyRequest(
        env.APIFY_API_TOKEN,
        `acts/${encodeURIComponent(job.actorId)}/runs?timeout=120&memory=256`,
        {
          schemaVersion: 1,
          requestKey: jobId,
          trackedEventIds: job.trackedEventIds,
        },
      );
      const run = runSchema.parse(response).data;
      if (run.actId !== job.actorId) throw new Error("Unexpected Actor.");
      await ctx.runMutation(internal.schedules.note, {
        jobId,
        status: "running",
        runId: run.id,
        buildId: run.buildId,
        datasetId: run.defaultDatasetId,
      });
      return run.id;
    } catch (error) {
      const rejected =
        error instanceof ApifyHttpError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      await ctx.runMutation(internal.schedules.note, {
        jobId,
        status: rejected ? "failed" : "uncertain",
        terminalFailure: rejected,
        error: rejected
          ? `Apify rejected submission (HTTP ${error.status}). Check token and Actor configuration.`
          : "Apify submission outcome is uncertain. Inspect the Actor runs for this request key; do not submit again.",
      });
      return null;
    }
  },
});
export const poll = internalAction({
  args: { jobId: v.id("scheduleSyncs") },
  returns: v.boolean(),
  handler: async (ctx, { jobId }): Promise<boolean> => {
    const job: Doc<"scheduleSyncs"> | null = await ctx.runQuery(
      internal.schedules.readJob,
      { jobId },
    );
    if (!job || job.status === "completed") return true;
    if (!job.runId || !env.APIFY_API_TOKEN)
      throw new Error("Known run and Apify token required.");
    const run = runSchema.parse(
      await apifyRequest(
        env.APIFY_API_TOKEN,
        `actor-runs/${encodeURIComponent(job.runId)}`,
      ),
    ).data;
    if (run.id !== job.runId || run.actId !== job.actorId)
      throw new Error("Run does not match this Actor.");
    const input = validateInput(
      await apifyRequest(
        env.APIFY_API_TOKEN,
        `key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT`,
      ),
    );
    if (
      input.requestKey !== jobId ||
      JSON.stringify(input.trackedEventIds) !==
        JSON.stringify(job.trackedEventIds)
    )
      throw new Error("Run input does not match this workspace request.");
    await ctx.runMutation(internal.schedules.note, {
      jobId,
      status: "running",
      runId: run.id,
      buildId: run.buildId,
      datasetId: run.defaultDatasetId,
    });
    if (["FAILED", "TIMED-OUT", "ABORTED"].includes(run.status)) {
      await ctx.runMutation(internal.schedules.note, {
        jobId,
        status: "failed",
        terminalFailure: true,
        error: `Apify run ended ${run.status}. No schedule records were imported.`,
      });
      return true;
    }
    if (run.status !== "SUCCEEDED") return false;
    const items = await apifyRequest(
      env.APIFY_API_TOKEN,
      `datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=2`,
    );
    if (!Array.isArray(items) || items.length !== 1)
      throw new Error("Actor must produce exactly one schedule envelope.");
    await ctx.runMutation(internal.schedules.finish, {
      jobId,
      batch: items[0],
    });
    return true;
  },
});
