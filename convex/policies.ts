import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { profile, denyWorkspaceAction } from "./lib";
import { workflow } from "./workflows";
import { receipt } from "./validators";
import {
  compareProcedures,
  EVALUATION_SUITE,
  LEARNING_VENDOR,
  simulateLearning,
  validatePolicyOutput,
  type LearningContext,
} from "../src/lib/finance/learning";
import {
  createLearningJob,
  learningAudit,
  learningContext,
} from "./learningRecords";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const propose = mutation({
  args: { caseId: v.optional(v.id("cases")) },
  returns: receipt,
  handler: async (ctx, args) => {
    const p = await profile(ctx);
    const denied = await denyWorkspaceAction(ctx, p, "propose_policy");
    if (denied) return denied;
    const deny = async (message: string) => {
      await learningAudit(
        ctx,
        p.sandboxId,
        "learning_request_denied",
        message,
        "unchanged",
        "unchanged",
        {},
        p.actorId,
        p.role,
        false,
      );
      return { ok: false, message };
    };
    if ((await ctx.db.get(p.sandboxId))?.archived)
      return deny("Archived simulations cannot learn.");
    if (args.caseId) {
      const c = await ctx.db.get(args.caseId);
      if (!c || c.sandboxId !== p.sandboxId) return deny("Case not found.");
      const corrections = await ctx.db
        .query("corrections")
        .withIndex("by_caseId_and_responseRevision", (q) =>
          q.eq("caseId", c._id),
        )
        .order("desc")
        .take(12);
      for (const correction of corrections) {
        const accepted = await ctx.db
          .query("precedents")
          .withIndex("by_correctionId", (q) =>
            q.eq("correctionId", correction._id),
          )
          .unique();
        if (accepted?.active) {
          await createLearningJob(ctx, p.sandboxId, correction._id);
          return {
            ok: true,
            message: "Accepted correction's learning job retained.",
          };
        }
      }
      await learningAudit(
        ctx,
        p.sandboxId,
        "learning_request_denied",
        "An accepted structured correction is required.",
        "none",
        "none",
        { caseId: c._id },
        p.actorId,
        p.role,
        false,
      );
      return {
        ok: false,
        message:
          "Record an evidence-backed correction and approve its revised proposal first.",
      };
    }
    const jobs = await ctx.db
      .query("policyRuns")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .order("desc")
      .take(30);
    if (jobs.some((j) => ["queued", "running"].includes(j.status)))
      return deny("A learning investigation is already queued or running.");
    await createLearningJob(ctx, p.sandboxId);
    return { ok: true, message: "Historical policy investigation queued." };
  },
});
export const launch = internalMutation({
  args: { jobId: v.id("policyRuns") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== "queued") return null;
    if ((await ctx.db.get(job.sandboxId))?.archived) {
      await ctx.db.patch(jobId, {
        status: "failed",
        error: "Sandbox archived.",
      });
      return null;
    }
    await ctx.db.patch(jobId, { status: "running" });
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.inferPolicy,
      { jobId },
    );
    await ctx.db.patch(jobId, { workflowId });
    await learningAudit(
      ctx,
      job.sandboxId,
      "learning_started",
      "Policy investigation started.",
      "queued",
      "running",
      { jobId },
    );
    return null;
  },
});
export const context = internalQuery({
  args: { jobId: v.id("policyRuns") },
  returns: v.any(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job?.contextJson)
      throw new Error(
        "Legacy learning job has no versioned context; request a new investigation.",
      );
    return {
      job: {
        mode: job.mode,
        runId: job.runId ?? null,
        submissionStatus: job.submissionStatus ?? null,
      },
      context: JSON.parse(job.proposalContextJson ?? job.contextJson),
    };
  },
});
export const noteRun = internalMutation({
  args: {
    jobId: v.id("policyRuns"),
    status: v.string(),
    runId: v.optional(v.string()),
    raw: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return null;
    if (args.runId) {
      const search = await ctx.db
        .query("retrievals")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .unique();
      if (search && !search.passedToAgent)
        await ctx.db.patch(search._id, { passedToAgent: true });
    }
    await ctx.db.patch(job._id, {
      submissionStatus: args.status,
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.raw ? { raw: args.raw.slice(0, 100000) } : {}),
    });
    return null;
  },
});
export const finish = internalMutation({
  args: {
    jobId: v.id("policyRuns"),
    raw: v.optional(v.any()),
    runId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return null;
    const saved = {
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.raw !== undefined
        ? { outputJson: JSON.stringify(args.raw).slice(0, 100000) }
        : {}),
      completedAt: Date.now(),
    };
    try {
      if (args.error) throw new Error(args.error);
      if (!job.contextJson) throw new Error("Missing versioned context.");
      const context: LearningContext = JSON.parse(job.contextJson);
      const out =
        job.mode === "creao"
          ? validatePolicyOutput(
              args.raw,
              job.proposalContextJson
                ? JSON.parse(job.proposalContextJson)
                : context,
            )
          : simulateLearning(context);
      if (out.outcome !== "candidate") {
        await ctx.db.patch(job._id, {
          ...saved,
          outputJson: JSON.stringify(out),
          status: "completed",
          outcome: out.outcome,
        });
        await learningAudit(
          ctx,
          job.sandboxId,
          `learning_${out.outcome}`,
          out.description,
          "running",
          out.outcome,
          { jobId: job._id, correctionId: job.correctionId },
        );
        return null;
      }
      const procedure = out.procedure!;
      const report = compareProcedures(
        context.currentPolicy?.procedure ?? null,
        procedure,
        !!job.correctionId,
      );
      const versions = await ctx.db
        .query("policies")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", job.sandboxId))
        .order("desc")
        .take(100);
      const policyId = await ctx.db.insert("policies", {
        sandboxId: job.sandboxId,
        version: Math.max(0, ...versions.map((p) => p.version)) + 1,
        vendor: LEARNING_VENDOR,
        status: "candidate",
        procedure,
        description: out.description,
        precedentIds: out.precedentCodes,
        title:
          procedure === "controller_confirmation"
            ? "Block extension evidence review"
            : "Signed schedule before escalation",
        createdAt: Date.now(),
        checks: report.checks,
        origin:
          job.mode === "creao"
            ? `CREAO policy learner ${args.runId ?? job.runId}`
            : "Deterministic learning simulation",
        jobId: job._id,
        proposedBy: "attest-policy-learner",
      });
      const evaluationId = await ctx.db.insert("evaluations", {
        sandboxId: job.sandboxId,
        jobId: job._id,
        policyId,
        suiteVersion: EVALUATION_SUITE,
        reportJson: JSON.stringify(report),
        contextJson: job.contextJson,
        passed: report.passed,
        createdAt: Date.now(),
      });
      await ctx.db.patch(policyId, { evaluationId });
      await ctx.db.patch(job._id, {
        ...saved,
        outputJson: JSON.stringify(out),
        status: "completed",
        outcome: "candidate",
        policyId,
      });
      await learningAudit(
        ctx,
        job.sandboxId,
        "policy_proposed",
        out.description,
        "running",
        "candidate",
        { jobId: job._id, policyId, correctionId: job.correctionId },
        undefined,
        undefined,
        true,
        out.precedentCodes,
      );
      await learningAudit(
        ctx,
        job.sandboxId,
        "policy_evaluated",
        `${report.improved} improved; ${report.regressed} regressed; ${report.sampleCount} deterministic scenarios.`,
        "candidate",
        report.passed ? "evaluation_passed" : "evaluation_failed",
        { jobId: job._id, policyId },
      );
    } catch (e) {
      const error =
        e instanceof Error ? e.message : "Policy investigation failed.";
      await ctx.db.patch(job._id, {
        ...saved,
        status: "failed",
        error: error.slice(0, 2000),
      });
      await learningAudit(
        ctx,
        job.sandboxId,
        "learning_failed",
        error.slice(0, 2000),
        "running",
        "failed",
        { jobId: job._id, correctionId: job.correctionId },
      );
    }
    return null;
  },
});
async function ownedPolicy(
  ctx: MutationCtx,
  id: Doc<"policies">["_id"],
  action: string,
) {
  const p = await profile(ctx),
    policy = await ctx.db.get(id);
  if (!policy || policy.sandboxId !== p.sandboxId) {
    await learningAudit(
      ctx,
      p.sandboxId,
      action,
      "Policy not found or not owned.",
      "unknown",
      "unknown",
      {},
      p.actorId,
      p.role,
      false,
    );
    return null;
  }
  return { p, policy };
}
export const activate = mutation({
  args: { id: v.id("policies") },
  returns: receipt,
  handler: async (ctx, { id }) => {
    const owned = await ownedPolicy(ctx, id, "policy_activation_denied");
    if (!owned) return { ok: false, message: "Policy not found." };
    const { p, policy } = owned;
    const deny = async (message: string) => {
      await learningAudit(
        ctx,
        p.sandboxId,
        "policy_activation_denied",
        message,
        policy.status,
        policy.status,
        { policyId: id },
        p.actorId,
        p.role,
        false,
      );
      return { ok: false, message };
    };
    if (
      p.role !== "human_controller" ||
      p.actorId === policy.proposedBy ||
      policy.status !== "candidate"
    )
      return deny(
        "Controller approval of an inactive agent proposal is required.",
      );
    if ((await ctx.db.get(p.sandboxId))?.archived)
      return deny("Archived simulations cannot activate policies.");
    const evaluation = policy.evaluationId
      ? await ctx.db.get(policy.evaluationId)
      : null;
    const job = policy.jobId ? await ctx.db.get(policy.jobId) : null;
    if (
      !evaluation ||
      !job ||
      evaluation.policyId !== id ||
      !evaluation.passed ||
      evaluation.suiteVersion !== EVALUATION_SUITE
    )
      return deny("A current passing comparison evaluation is required.");
    let current;
    try {
      current = await learningContext(ctx, p.sandboxId, job.correctionId);
    } catch {
      return deny(
        "Supporting correction is no longer eligible. Request a new investigation.",
      );
    }
    if (JSON.stringify(current.context) !== evaluation.contextJson)
      return deny(
        "Supporting evidence or baseline changed. Reevaluate before activation.",
      );
    const report = compareProcedures(
      current.context.currentPolicy?.procedure ?? null,
      policy.procedure,
      !!job.correctionId,
    );
    if (!report.passed || JSON.stringify(report) !== evaluation.reportJson)
      return deny("Evaluation is stale. Reevaluate before activation.");
    if (current.baseline)
      await ctx.db.patch(current.baseline._id, { status: "superseded" });
    await ctx.db.patch(id, {
      status: "active",
      approvedBy: p.actorId,
      approvedAt: Date.now(),
    });
    await learningAudit(
      ctx,
      p.sandboxId,
      "policy_activated",
      "Controller approved the exact evaluated procedure.",
      "candidate",
      "active",
      { policyId: id, jobId: job._id },
      p.actorId,
      p.role,
      true,
      policy.precedentIds,
    );
    if (current.baseline)
      await learningAudit(
        ctx,
        p.sandboxId,
        "policy_superseded",
        "Replaced for future investigations; historical references retained.",
        "active",
        "superseded",
        { policyId: current.baseline._id },
        p.actorId,
        p.role,
      );
    return { ok: true, message: "Policy activated for future investigations." };
  },
});
export const reject = mutation({
  args: { id: v.id("policies"), reason: v.string() },
  returns: receipt,
  handler: async (ctx, { id, reason }) => {
    const owned = await ownedPolicy(ctx, id, "policy_rejection_denied");
    if (!owned) return { ok: false, message: "Policy not found." };
    const { p, policy } = owned;
    const ok =
      p.role === "human_controller" &&
      policy.status === "candidate" &&
      !!reason.trim();
    await learningAudit(
      ctx,
      p.sandboxId,
      ok ? "policy_rejected" : "policy_rejection_denied",
      reason.trim() || "Controller and reason required.",
      policy.status,
      ok ? "rejected" : policy.status,
      { policyId: id },
      p.actorId,
      p.role,
      ok,
    );
    if (!ok)
      return {
        ok: false,
        message: "Controller, candidate, and reason required.",
      };
    await ctx.db.patch(id, {
      status: "rejected",
      rejectedBy: p.actorId,
      rejectedAt: Date.now(),
      rejectionReason: reason.trim(),
    });
    return { ok: true, message: "Candidate rejected; history preserved." };
  },
});
export const reevaluate = mutation({
  args: { id: v.id("policies") },
  returns: receipt,
  handler: async (ctx, { id }) => {
    const owned = await ownedPolicy(ctx, id, "policy_evaluation_denied");
    if (!owned) return { ok: false, message: "Policy not found." };
    const { p, policy } = owned;
    const deny = async (message: string) => {
      await learningAudit(
        ctx,
        p.sandboxId,
        "policy_evaluation_denied",
        message,
        policy.status,
        policy.status,
        { policyId: id },
        p.actorId,
        p.role,
        false,
      );
      return { ok: false, message };
    };
    if (
      p.role !== "human_controller" ||
      policy.status !== "candidate" ||
      !policy.jobId
    ) {
      await learningAudit(
        ctx,
        p.sandboxId,
        "policy_evaluation_denied",
        "Controller and versioned candidate required.",
        policy.status,
        policy.status,
        { policyId: id },
        p.actorId,
        p.role,
        false,
      );
      return {
        ok: false,
        message: "Controller and versioned candidate required.",
      };
    }
    const job = await ctx.db.get(policy.jobId);
    if (!job?.contextJson)
      return deny("Versioned learning input is unavailable.");
    let current;
    try {
      current = await learningContext(ctx, p.sandboxId, job.correctionId);
    } catch {
      return deny(
        "Supporting correction is no longer eligible. Request a new investigation.",
      );
    }
    const original: LearningContext = JSON.parse(job.contextJson);
    if (
      policy.precedentIds.some(
        (code) =>
          JSON.stringify(original.precedents.find((p) => p.code === code)) !==
          JSON.stringify(
            current.context.precedents.find((p) => p.code === code),
          ),
      )
    )
      return deny(
        "Cited evidence changed. Reject this candidate and request a new investigation.",
      );
    const report = compareProcedures(
      current.context.currentPolicy?.procedure ?? null,
      policy.procedure,
      !!job.correctionId,
    );
    const evaluationId = await ctx.db.insert("evaluations", {
      sandboxId: p.sandboxId,
      jobId: job._id,
      policyId: id,
      suiteVersion: EVALUATION_SUITE,
      contextJson: JSON.stringify(current.context),
      reportJson: JSON.stringify(report),
      passed: report.passed,
      createdAt: Date.now(),
    });
    await ctx.db.patch(id, { evaluationId, checks: report.checks });
    await learningAudit(
      ctx,
      p.sandboxId,
      "policy_reevaluated",
      "New comparison recorded; approval still required.",
      "candidate",
      "candidate",
      { policyId: id, jobId: job._id },
      p.actorId,
      p.role,
    );
    return {
      ok: true,
      message: report.passed
        ? "Comparison passed; controller approval is still required."
        : "Comparison failed; candidate cannot activate.",
    };
  },
});
export const retry = mutation({
  args: { jobId: v.id("policyRuns") },
  returns: receipt,
  handler: async (ctx, { jobId }) => {
    const p = await profile(ctx),
      job = await ctx.db.get(jobId);
    const deny = async (message: string) => {
      await learningAudit(
        ctx,
        p.sandboxId,
        "learning_retry_denied",
        message,
        "unchanged",
        "unchanged",
        job?.sandboxId === p.sandboxId ? { jobId } : {},
        p.actorId,
        p.role,
        false,
      );
      return { ok: false, message };
    };
    const permissionDenied = await denyWorkspaceAction(
      ctx,
      p,
      "propose_policy",
    );
    if (permissionDenied) return permissionDenied;
    if (!job || job.sandboxId !== p.sandboxId)
      return deny("Learning job not found.");
    if (job.status !== "failed") return deny("Only failed jobs can resume.");
    if ((await ctx.db.get(p.sandboxId))?.archived)
      return deny("Archived simulations cannot learn.");
    try {
      await learningContext(ctx, p.sandboxId, job.correctionId);
    } catch {
      return deny(
        "Supporting correction is no longer eligible. Request a new investigation.",
      );
    }
    if (job.submissionStatus === "submission_pending" && !job.runId)
      return deny(
        "Submission outcome is unknown; inspect CREAO history before resubmitting.",
      );
    if (
      ["completed", "failed", "cancelled"].includes(job.submissionStatus ?? "")
    ) {
      const nextId = await createLearningJob(
        ctx,
        p.sandboxId,
        job.correctionId,
        job._id,
      );
      await learningAudit(
        ctx,
        p.sandboxId,
        "learning_retried",
        "Explicit retry created a new provider request after a known terminal outcome; previous response retained.",
        "failed",
        "queued",
        { jobId: nextId },
        p.actorId,
        p.role,
      );
      return {
        ok: true,
        message:
          "A new investigation was queued; the previous run remains in history.",
      };
    }
    await ctx.db.patch(jobId, { status: "queued", error: undefined });
    await ctx.scheduler.runAfter(0, internal.policies.launch, { jobId });
    await learningAudit(
      ctx,
      p.sandboxId,
      "learning_resumed",
      "Resume existing provider run, or submit after configuration was repaired.",
      "failed",
      "queued",
      { jobId },
      p.actorId,
      p.role,
    );
    return { ok: true, message: "Learning job resumed." };
  },
});
export const detail = query({
  args: { id: v.id("policies") },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    const p = await profile(ctx),
      policy = await ctx.db.get(id);
    if (!policy || policy.sandboxId !== p.sandboxId)
      throw new Error("Policy not found.");
    const job = policy.jobId ? await ctx.db.get(policy.jobId) : null;
    const evaluation = policy.evaluationId
      ? await ctx.db.get(policy.evaluationId)
      : null;
    const acceptedPrecedent = job?.correctionId
      ? await ctx.db
          .query("precedents")
          .withIndex("by_correctionId", (q) =>
            q.eq("correctionId", job.correctionId),
          )
          .unique()
      : null;
    const usage = await ctx.db
      .query("proposals")
      .withIndex("by_policyId", (q) => q.eq("policyId", id))
      .order("desc")
      .take(30);
    return {
      policy,
      job,
      acceptedPrecedent,
      correctedProposal: acceptedPrecedent?.proposalId
        ? await ctx.db.get(acceptedPrecedent.proposalId)
        : null,
      correctionApproval: acceptedPrecedent?.approvalId
        ? await ctx.db.get(acceptedPrecedent.approvalId)
        : null,
      correction: job?.correctionId ? await ctx.db.get(job.correctionId) : null,
      context: job?.contextJson ? JSON.parse(job.contextJson) : null,
      evaluation: evaluation
        ? { ...evaluation, report: JSON.parse(evaluation.reportJson) }
        : null,
      usage: usage.map((p) => ({
        caseId: p.caseId,
        proposalId: p._id,
        attempt: p.attempt,
        createdAt: p.createdAt,
        result: p.result,
      })),
      usageLimit: 30,
    };
  },
});
