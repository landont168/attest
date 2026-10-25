import { v } from "convex/values";
import { workflow } from "./workflows";
import { internal } from "./_generated/api";
export const sync = workflow.define({
  args: { jobId: v.id("scheduleSyncs") },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    try {
      const runId = await step.runAction(internal.apify.submit, args, {
        retry: false,
      });
      if (!runId) return null;
      for (let i = 0; i < 45; i++) {
        const done = await step.runAction(internal.apify.poll, args, {
          retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
        });
        if (done) return null;
        await step.sleep(4000);
      }
      await step.runMutation(internal.schedules.note, {
        ...args,
        status: "failed",
        error:
          "Polling window expired. Resume this known run; do not submit another.",
      });
    } catch {
      const job = await step.runQuery(internal.schedules.readJob, args);
      if (job && job.status !== "completed")
        await step.runMutation(internal.schedules.note, {
          ...args,
          status: job.runId ? "failed" : "uncertain",
          error: job.runId
            ? "Provider response could not be verified or retrieved. No new financial decisions were made. Resume the recorded run after checking its output."
            : "Submission outcome needs reconciliation in Apify before another request.",
        });
    }
    return null;
  },
});
