import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
export const workflow = new WorkflowManager(components.workflow);
export const investigate = workflow.define({
  args: { caseId: v.id("cases") },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const context = await step.runMutation(internal.investigations.begin, args);
    if (!context) return null;
    try {
      for (const kind of ["contract", "payment"] as const) {
        const ok = await step.runMutation(internal.team.runSpecialist, {
          caseId: args.caseId,
          attempt: context.attempt,
          revision: context.revision,
          kind,
        });
        if (!ok)
          throw new Error(
            `${kind} specialist failed or returned a stale result.`,
          );
      }
      const agentContext: typeof context & { evidenceSearch?: unknown } =
        context;
      if (!context.runId) {
        const retrievalId = await step.runMutation(
          internal.retrievalRecords.prepare,
          {
            target: {
              kind: "case",
              caseId: args.caseId,
              attempt: context.attempt,
              revision: context.revision,
            },
          },
        );
        try {
          await step.runAction(
            internal.moss.search,
            { id: retrievalId },
            { retry: false },
          );
        } catch {
          await step.runMutation(internal.retrievalRecords.finish, {
            id: retrievalId,
            outcome: "unavailable",
            hits: [],
            error:
              "Retrieval runtime unavailable; continuing with structured Convex evidence.",
          });
        }
        const retrieval = await step.runMutation(
          internal.retrievalRecords.consume,
          { id: retrievalId },
        );
        if (retrieval) {
          agentContext.evidenceSearch = retrieval.evidenceSearch;
          if (retrieval.precedentCodes)
            context.precedents = retrieval.precedentCodes.flatMap(
              (code: string) =>
                context.precedents.filter(
                  (p: { code: string }) => p.code === code,
                ),
            );
        }
      }
      if (context.mode === "deterministic") {
        await step.runMutation(internal.investigations.complete, {
          caseId: args.caseId,
          attempt: context.attempt,
          revision: context.revision,
        });
        return null;
      }
      const runId =
        context.runId ??
        (await step.runAction(
          internal.creao.submit,
          {
            caseId: args.caseId,
            attempt: context.attempt,
            context: agentContext,
          },
          { retry: false },
        ));
      for (let i = 0; i < 90; i++) {
        const response = await step.runAction(
          internal.creao.poll,
          { caseId: args.caseId, attempt: context.attempt, runId },
          { retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 } },
        );
        if (response.done) {
          await step.runMutation(internal.investigations.complete, {
            caseId: args.caseId,
            attempt: context.attempt,
            revision: context.revision,
            raw: response.output,
          });
          return null;
        }
        await step.sleep(10000);
      }
      throw new Error(
        "CREAO is still running after 15 minutes. Retry resumes polling the existing run.",
      );
    } catch (error) {
      await step.runMutation(internal.investigations.fail, {
        caseId: args.caseId,
        attempt: context.attempt,
        message:
          error instanceof Error ? error.message : "Investigation failed.",
      });
    }
    return null;
  },
});
export const inferPolicy = workflow.define({
  args: { jobId: v.id("policyRuns") },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    try {
      let context = await step.runQuery(internal.policies.context, args);
      if (!context.job.runId && !context.job.submissionStatus) {
        const retrievalId = await step.runMutation(
          internal.retrievalRecords.prepare,
          { target: { kind: "policy", jobId: args.jobId } },
        );
        try {
          await step.runAction(
            internal.moss.search,
            { id: retrievalId },
            { retry: false },
          );
        } catch {
          await step.runMutation(internal.retrievalRecords.finish, {
            id: retrievalId,
            outcome: "unavailable",
            hits: [],
            error:
              "Retrieval runtime unavailable; continuing with structured Convex evidence.",
          });
        }
        await step.runMutation(internal.retrievalRecords.consume, {
          id: retrievalId,
        });
        context = await step.runQuery(internal.policies.context, args);
      }
      if (context.job.mode === "deterministic") {
        await step.runMutation(internal.policies.finish, args);
        return null;
      }
      if (
        context.job.submissionStatus === "submission_pending" &&
        !context.job.runId
      )
        throw new Error(
          "Policy submission outcome is unknown; inspect provider history.",
        );
      const runId =
        context.job.runId ??
        (await step.runAction(
          internal.creao.submitPolicy,
          { jobId: args.jobId, context: context.context },
          { retry: false },
        ));
      for (let i = 0; i < 90; i++) {
        const result = await step.runAction(
          internal.creao.pollPolicy,
          { jobId: args.jobId, runId },
          { retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 } },
        );
        if (result.done) {
          await step.runMutation(internal.policies.finish, {
            ...args,
            raw: result.output,
            runId,
          });
          return null;
        }
        await step.sleep(10000);
      }
      throw new Error("Policy investigation timed out.");
    } catch (e) {
      await step.runMutation(internal.policies.finish, {
        ...args,
        error: e instanceof Error ? e.message : "Policy investigation failed.",
      });
    }
    return null;
  },
});
