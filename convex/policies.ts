import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { profile, ownedCase, audit } from "./lib";
import { workflow } from "./workflows";
import { backtestProcedure } from "../src/lib/finance/memory";
import { receipt } from "./validators";
import { z } from "zod";
export const propose = mutation({
  args: { caseId: v.optional(v.id("cases")) },
  returns: receipt,
  handler: async (ctx, args) => {
    const p = await profile(ctx);
    if (args.caseId) {
      const { c } = await ownedCase(ctx, args.caseId);
      const responses = await ctx.db
        .query("questions")
        .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
        .take(30);
      if (!responses.some((q) => q.answer))
        return {
          ok: false,
          message:
            "Answer a case question first so the proposed improvement has a real correction behind it.",
        };
    }
    const jobs = await ctx.db
      .query("policyRuns")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .order("desc")
      .take(20);
    if (jobs.some((j) => j.status === "running"))
      return {
        ok: false,
        message: "A policy investigation is already running.",
      };
    const sandbox = (await ctx.db.get(p.sandboxId))!;
    const jobId = await ctx.db.insert("policyRuns", {
      sandboxId: p.sandboxId,
      mode: sandbox.mode,
      procedure: args.caseId
        ? "signed_schedule_first"
        : "controller_confirmation",
      status: "running",
      createdAt: Date.now(),
      ...(args.caseId ? { caseId: args.caseId } : {}),
    });
    await workflow.start(ctx, internal.workflows.inferPolicy, { jobId });
    return { ok: true, message: "Historical policy investigation started." };
  },
});
export const context = internalQuery({
  args: { jobId: v.id("policyRuns") },
  returns: v.any(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Missing policy run.");
    const precedents = await ctx.db
      .query("precedents")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", job.sandboxId))
      .take(30);
    return {
      job: { mode: job.mode, procedure: job.procedure },
      precedents: precedents
        .filter((p) => p.active && p.vendor === "Meridian Hospitality")
        .map(({ code, vendor, date, title, explanation, active }) => ({
          code,
          vendor,
          date,
          title,
          explanation,
          active,
        })),
      corrections: job.caseId
        ? (
            await ctx.db
              .query("questions")
              .withIndex("by_caseId", (q) => q.eq("caseId", job.caseId!))
              .take(30)
          ).map(({ text, answer, answeredAt }) => ({
            text,
            ...(answer !== undefined ? { answer } : {}),
            ...(answeredAt !== undefined ? { answeredAt } : {}),
          }))
        : [],
    };
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
    if (args.error) {
      await ctx.db.patch(job._id, { status: "failed", error: args.error });
      return null;
    }
    const precedents = await ctx.db
      .query("precedents")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", job.sandboxId))
      .take(30);
    const supported = precedents.filter(
      (p) => p.active && p.vendor === "Meridian Hospitality",
    );
    if (supported.length < 2)
      throw new Error("At least two applicable precedents are required.");
    let description =
      job.procedure === "controller_confirmation"
        ? "For Meridian block-extension schedules, request controller confirmation of the signed original and additional room groups before proposing financial work."
        : "For Meridian block-extension documents, retrieve the signed itemized schedule first. When it explicitly identifies additional rooms and the financial checks pass, do not request duplicate controller confirmation. Missing signatures and unclear scope still require review.";
    let ids = supported.map((p) => p.code);
    if (job.mode === "creao") {
      const out = z
        .object({
          vendor: z.literal("Meridian Hospitality"),
          procedure: z.enum([
            "controller_confirmation",
            "signed_schedule_first",
          ]),
          description: z.string().min(20).max(4000),
          precedentIds: z.array(z.string()).min(2),
        })
        .parse(args.raw);
      if (
        out.procedure !== job.procedure ||
        new Set(out.precedentIds).size < 2 ||
        out.precedentIds.some((id) => !supported.some((p) => p.code === id))
      )
        throw new Error("Policy references or procedure are invalid.");
      description = out.description;
      ids = out.precedentIds;
    }
    const policies = await ctx.db
      .query("policies")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", job.sandboxId))
      .take(30);
    const version = Math.max(0, ...policies.map((p) => p.version)) + 1;
    const policyId = await ctx.db.insert("policies", {
      sandboxId: job.sandboxId,
      version,
      title:
        job.procedure === "controller_confirmation"
          ? "Block extension evidence review"
          : "Signed schedule before escalation",
      vendor: "Meridian Hospitality",
      status: "candidate",
      procedure: job.procedure,
      description,
      precedentIds: ids,
      createdAt: Date.now(),
      checks: backtestProcedure(job.procedure, "Meridian Hospitality"),
      origin:
        job.mode === "creao"
          ? `CREAO investigation ${args.runId}`
          : "Deterministic pattern synthesis · simulation",
    });
    await ctx.db.patch(job._id, {
      status: "completed",
      policyId,
      ...(args.runId ? { runId: args.runId } : {}),
    });
    await ctx.db.insert("audit", {
      sandboxId: job.sandboxId,
      ...(job.caseId ? { caseId: job.caseId } : {}),
      timestamp: Date.now(),
      actor: "attest-investigator",
      role: "ai_agent",
      action: "policy_proposed",
      allowed: true,
      before: "historical_pattern",
      after: "candidate",
      reason: description,
      evidenceIds: ids,
      policyId,
    });
    return null;
  },
});
export const activate = mutation({
  args: { id: v.id("policies") },
  returns: receipt,
  handler: async (ctx, { id }) => {
    const p = await profile(ctx);
    const policy = await ctx.db.get(id);
    if (!policy || policy.sandboxId !== p.sandboxId)
      throw new Error("Policy not found.");
    const ok =
      p.role === "human_controller" &&
      policy.status === "candidate" &&
      policy.checks.length >= 4 &&
      policy.checks.every((c) => c.passed);
    await ctx.db.insert("audit", {
      sandboxId: p.sandboxId,
      timestamp: Date.now(),
      actor: p.identity,
      role: p.role,
      action: ok ? "policy_activated" : "policy_activation_denied",
      allowed: ok,
      before: policy.status,
      after: ok ? "active" : policy.status,
      reason: ok
        ? "Controller approved the scoped procedure after fixture validation."
        : "Controller approval and passing backtests are required.",
      evidenceIds: policy.precedentIds,
      policyId: policy._id,
    });
    if (!ok)
      return {
        ok: false,
        message: "Controller approval and passing checks are required.",
      };
    const others = await ctx.db
      .query("policies")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .take(30);
    for (const old of others.filter(
      (o) => o.vendor === policy.vendor && o.status === "active",
    ))
      await ctx.db.patch(old._id, { status: "superseded" });
    await ctx.db.patch(id, {
      status: "active",
      approvedBy: p.identity,
      approvedAt: Date.now(),
    });
    return {
      ok: true,
      message:
        "Policy activated for future investigations. Historical versions remain available.",
    };
  },
});
