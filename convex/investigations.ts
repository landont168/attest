import {
  delegateSpecialists,
  executeSpecialist,
  loadPaymentFinding,
  assignHumanRequest,
  prepareDispute,
} from "./team";
import { applySettlement } from "../src/lib/finance/settlement";
import {
  internalMutation,
  internalQuery,
  query,
  env,
} from "./_generated/server";
import { v } from "convex/values";
import { result as resultValidator } from "./validators";
import { audit, transition, profile } from "./lib";
import { reconcile, validateInterpretation } from "../src/lib/finance/engine";
import { needsScopeReview } from "../src/lib/finance/memory";
import type { InvoiceInput } from "../src/lib/finance/types";
export const providers = query({
  args: {},
  returns: v.object({
    creao: v.boolean(),
    hasCompletedRun: v.boolean(),
    policyLearner: v.boolean(),
    mode: v.string(),
  }),
  handler: async (ctx) => {
    const p = await profile(ctx);
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .take(40);
    return {
      hasCompletedRun: cases.some(
        (c) =>
          c.mode === "creao" && !!c.runId && c.providerStatus === "completed",
      ),
      creao: !!env.CREAO_API_KEY && !!env.CREAO_AGENT_ID,
      policyLearner:
        !!env.CREAO_POLICY_AGENT_ID &&
        !!(env.CREAO_POLICY_API_KEY || env.CREAO_API_KEY),
      mode: (await ctx.db.get(p.sandboxId))!.mode,
    };
  },
});
export const begin = internalMutation({
  args: { caseId: v.id("cases") },
  returns: v.any(),
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (
      !c ||
      !["NEW", "REVISION_REQUIRED", "FAILED_RETRYABLE"].includes(c.state)
    )
      return null;
    if ((await ctx.db.get(c.sandboxId))?.archived) return null;
    if (c.attempt >= 12) {
      await audit(
        ctx,
        c,
        "attempt_limit",
        "Twelve investigation attempts reached. Create a new scenario.",
      );
      return null;
    }
    const vendorPolicy = await ctx.db
      .query("policies")
      .withIndex("by_sandboxId_and_vendor_and_status", (q) =>
        q
          .eq("sandboxId", c.sandboxId)
          .eq("vendor", c.input.vendor)
          .eq("status", "active"),
      )
      .unique();
    const fallbackPolicy = vendorPolicy
      ? null
      : await ctx.db
          .query("policies")
          .withIndex("by_sandboxId_and_vendor_and_status", (q) =>
            q
              .eq("sandboxId", c.sandboxId)
              .eq("vendor", "All vendors")
              .eq("status", "active"),
          )
          .unique();
    const policy = c.runId
      ? c.policyId
        ? await ctx.db.get(c.policyId)
        : null
      : (vendorPolicy ?? fallbackPolicy);
    await transition(ctx, c, "INVESTIGATING", "Retrieving source evidence");
    await ctx.db.patch(c._id, {
      attempt: c.attempt + 1,
      error: undefined,
      policyId: policy?._id,
    });
    await audit(
      ctx,
      { ...c, policyId: policy?._id, state: "INVESTIGATING" },
      "evidence_retrieved",
      "Contract versions, delivered services, and invoice loaded.",
      "attest-investigator",
      "ai_agent",
      true,
      "INVESTIGATING",
      c.input.sources.map((s) => s.id),
    );
    await delegateSpecialists(ctx, {
      ...c,
      state: "INVESTIGATING",
      attempt: c.attempt + 1,
    });
    const precedents = await ctx.db
      .query("precedents")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", c.sandboxId))
      .take(30);
    await audit(
      ctx,
      { ...c, state: "INVESTIGATING" },
      "precedents_checked",
      `${precedents.filter((p) => p.active && p.vendor === c.input.vendor).length} applicable historical decisions retrieved; expired precedents excluded.`,
    );
    const responses = await ctx.db
      .query("questions")
      .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
      .order("desc")
      .take(30);
    return {
      responses,
      caseId: c._id,
      input: c.input,
      mode: c.mode,
      revision: c.revision,
      attempt: c.attempt + 1,
      runId: c.runId ?? null,
      policy: policy ?? null,
      precedents: precedents.filter(
        (p) => p.active && p.vendor === c.input.vendor,
      ),
    };
  },
});
export const noteRun = internalMutation({
  args: {
    caseId: v.id("cases"),
    attempt: v.number(),
    status: v.string(),
    externalId: v.optional(v.string()),
    raw: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.caseId);
    if (!c || c.attempt !== args.attempt || c.state !== "INVESTIGATING")
      return null;
    const rows = await ctx.db
      .query("runs")
      .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
      .order("desc")
      .take(20);
    const old = rows.find((r) => r.attempt === args.attempt);
    const data = {
      status: args.status,
      ...(args.externalId ? { externalId: args.externalId } : {}),
      ...(args.raw ? { raw: args.raw.slice(0, 100000) } : {}),
    };
    if (old) await ctx.db.patch(old._id, data);
    else
      await ctx.db.insert("runs", {
        caseId: c._id,
        attempt: args.attempt,
        createdAt: Date.now(),
        ...data,
      });
    await ctx.db.patch(c._id, {
      providerStatus: args.status,
      ...(args.externalId ? { runId: args.externalId } : {}),
      phase: `CREAO · ${args.status}`,
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const complete = internalMutation({
  args: {
    caseId: v.id("cases"),
    attempt: v.number(),
    revision: v.number(),
    raw: v.optional(v.any()),
  },
  returns: resultValidator,
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.caseId);
    if (!c) throw new Error("Case not found.");
    if (
      c.attempt !== args.attempt ||
      c.revision !== args.revision ||
      c.state !== "INVESTIGATING"
    )
      throw new Error("Stale investigation result ignored.");
    const input = c.input as InvoiceInput;
    let result =
      c.mode === "creao"
        ? validateInterpretation(input, args.raw)
        : reconcile(input);
    await delegateSpecialists(ctx, c);
    // Also supports older callers of complete: queued tools still execute and persist real findings.
    if (
      !(await executeSpecialist(ctx, c, "contract")) ||
      !(await executeSpecialist(ctx, c, "payment"))
    )
      throw new Error("Specialist work failed; financial proposal withheld.");
    result = applySettlement(input, result, await loadPaymentFinding(ctx, c));
    const policy = c.policyId ? await ctx.db.get(c.policyId) : null;
    if (policy && needsScopeReview(input, policy.procedure, policy.vendor))
      result = {
        ...result,
        disposition: "needs_info",
        expectedCents: null,
        differenceCents: null,
        cohorts: [],
        issues: [
          "Controller confirmation required by the current block-extension evidence procedure. Identify the signed schedule and confirm its scope.",
        ],
        explanation:
          "The current approved evidence procedure requires controller confirmation of this block extension.",
      };
    if (
      c.resolution &&
      result.disposition !== "needs_info" &&
      c.resolution.amountCents === result.expectedCents
    ) {
      result = {
        ...result,
        evidenceIds: [
          ...new Set([...result.evidenceIds, c.resolution.sourceId]),
        ],
        explanation:
          "The documented vendor correction matches the supported contractual amount. A controller must authorize the corrected payable; the original invoice and discrepancy remain in history.",
      };
    }
    const correction = await ctx.db
      .query("corrections")
      .withIndex("by_caseId_and_responseRevision", (q) =>
        q.eq("caseId", c._id).eq("responseRevision", c.revision),
      )
      .unique();
    const proposalId = await ctx.db.insert("proposals", {
      ...(correction ? { correctionId: correction._id } : {}),
      caseId: c._id,
      sandboxId: c.sandboxId,
      revision: c.revision,
      attempt: c.attempt,
      createdAt: Date.now(),
      proposedBy: "attest-investigator",
      result,
      input: c.input,
      mode: c.mode,
      ...(c.policyId ? { policyId: c.policyId } : {}),
      ...(c.runId ? { runId: c.runId } : {}),
    });
    await ctx.db.patch(c._id, {
      proposalId,
      providerStatus: c.mode === "creao" ? "completed" : "not_used",
    });
    await audit(
      ctx,
      { ...c, proposalId },
      "financial_validation",
      result.explanation,
      "attest-investigator",
      "ai_agent",
      true,
      c.state,
      result.evidenceIds,
    );
    if (result.disposition === "needs_info") {
      await assignHumanRequest(
        ctx,
        { ...c, proposalId },
        result.issues.join(" "),
      );
      await transition(
        ctx,
        { ...c, proposalId },
        "NEEDS_INFO",
        "Awaiting source evidence or authorized clarification",
      );
    } else
      await transition(
        ctx,
        { ...c, proposalId },
        "PROPOSED",
        c.resolution
          ? "Review corrected payable posting"
          : result.disposition === "disputed"
            ? "Review proposed invoice dispute"
            : "Review matched invoice posting",
      );
    await prepareDispute(ctx, { ...c, proposalId }, proposalId);
    return result;
  },
});
export const fail = internalMutation({
  args: { caseId: v.id("cases"), attempt: v.number(), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.caseId);
    if (!c || c.attempt !== args.attempt || c.state !== "INVESTIGATING")
      return null;
    await transition(
      ctx,
      c,
      "FAILED_RETRYABLE",
      "Investigation needs attention",
    );
    await ctx.db.patch(c._id, {
      error: args.message.slice(0, 1000),
      providerStatus: "failed",
    });
    await audit(
      ctx,
      { ...c, state: "FAILED_RETRYABLE" },
      "investigation_failed",
      args.message.slice(0, 1000),
    );
    return null;
  },
});
