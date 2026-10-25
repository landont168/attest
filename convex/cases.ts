import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { ownedCase, audit, transition } from "./lib";
import {
  permission,
  payableJournal,
  validateJournal,
  reconcile,
} from "../src/lib/finance/engine";
import type { InvoiceInput } from "../src/lib/finance/types";
import { receipt } from "./validators";
import { workflow } from "./workflows";
import { validCorrectionSources } from "../src/lib/finance/learning";
import { learningAudit } from "./learningRecords";
export const detail = query({
  args: { id: v.id("cases") },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    const { c } = await ownedCase(ctx, id);
    return {
      case: c,
      proposals: await ctx.db
        .query("proposals")
        .withIndex("by_caseId", (q) => q.eq("caseId", id))
        .order("desc")
        .take(30),
      audit: await ctx.db
        .query("audit")
        .withIndex("by_caseId", (q) => q.eq("caseId", id))
        .order("desc")
        .take(200),
      approvals: await ctx.db
        .query("approvals")
        .withIndex("by_caseId", (q) => q.eq("caseId", id))
        .order("desc")
        .take(40),
      questions: await ctx.db
        .query("questions")
        .withIndex("by_caseId", (q) => q.eq("caseId", id))
        .order("desc")
        .take(30),
      journals: await ctx.db
        .query("journals")
        .withIndex("by_caseId", (q) => q.eq("caseId", id))
        .order("desc")
        .take(20),
      corrections: await ctx.db
        .query("corrections")
        .withIndex("by_caseId_and_responseRevision", (q) => q.eq("caseId", id))
        .order("desc")
        .take(12),
      runs: await ctx.db
        .query("runs")
        .withIndex("by_caseId", (q) => q.eq("caseId", id))
        .order("desc")
        .take(20),
    };
  },
});
export const review = mutation({
  args: {
    id: v.id("cases"),
    proposalId: v.id("proposals"),
    operation: v.union(
      v.literal("approve"),
      v.literal("reject"),
      v.literal("ask"),
    ),
    reason: v.string(),
  },
  returns: receipt,
  handler: async (ctx, args) => {
    const { p, c } = await ownedCase(ctx, args.id);
    const proposal = await ctx.db.get(args.proposalId);
    const deny = async (message: string) => {
      await audit(
        ctx,
        c,
        `${args.operation}_denied`,
        message,
        p.identity,
        p.role,
        false,
      );
      return { ok: false, message };
    };
    if (
      !proposal ||
      c.proposalId !== proposal._id ||
      proposal.revision !== c.revision ||
      c.state !== "PROPOSED"
    )
      return deny("This proposal is stale or no longer awaiting review.");
    const requiresController = !!c.resolution;
    const auth = permission(
      p.role,
      "approve",
      p.identity,
      proposal.proposedBy,
      requiresController,
    );
    if (!auth.ok) return deny(auth.reason);
    if (args.operation !== "approve" && !args.reason.trim())
      return deny("A reason is required.");
    const approvalId = await ctx.db.insert("approvals", {
      caseId: c._id,
      proposalId: proposal._id,
      action: args.operation,
      decision:
        args.operation === "approve"
          ? "approved"
          : args.operation === "reject"
            ? "rejected"
            : "needs_info",
      actor: p.identity,
      role: p.role,
      reason:
        args.reason.trim() || "Reviewed source evidence and financial impact.",
      createdAt: Date.now(),
      revision: c.revision,
    });
    await audit(
      ctx,
      c,
      `proposal_${args.operation}`,
      args.reason || "Source-backed proposal reviewed.",
      p.identity,
      p.role,
      true,
      c.state,
      proposal.result.evidenceIds,
      { approvalId },
    );
    if (args.operation === "reject") {
      await transition(
        ctx,
        c,
        "REJECTED",
        "Proposal rejected; provide corrected evidence or reopen",
        p.identity,
        p.role,
      );
      return {
        ok: true,
        message: "Proposal rejected and preserved in history.",
      };
    }
    if (args.operation === "ask") {
      await ctx.db.insert("questions", {
        caseId: c._id,
        text: args.reason.trim(),
        createdAt: Date.now(),
      });
      await transition(
        ctx,
        c,
        "NEEDS_INFO",
        "Awaiting requested information",
        p.identity,
        p.role,
      );
      return {
        ok: true,
        message: "Question recorded. The case will resume after an answer.",
      };
    }
    await transition(
      ctx,
      c,
      "APPROVED",
      proposal.result.disposition === "disputed" && !c.resolution
        ? "Dispute approved · awaiting vendor resolution"
        : "Approved · awaiting posting gateway",
      p.identity,
      p.role,
    );
    if (proposal.correctionId)
      await ctx.scheduler.runAfter(0, internal.corrections.accept, {
        proposalId: proposal._id,
        approvalId,
      });
    if (proposal.result.disposition === "matched" || c.resolution)
      await ctx.scheduler.runAfter(0, internal.cases.post, {
        id: c._id,
        approvalId,
      });
    return {
      ok: true,
      message:
        proposal.result.disposition === "disputed" && !c.resolution
          ? "Dispute approved. No payable has been posted."
          : "Approved. The gateway will independently validate and post.",
    };
  },
});
export const post = internalMutation({
  args: { id: v.id("cases"), approvalId: v.id("approvals") },
  returns: receipt,
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c) throw new Error("Missing case.");
    const ref = `PAYABLE:${c._id}:${args.approvalId}`;
    const existing = await ctx.db
      .query("journals")
      .withIndex("by_reference", (q) => q.eq("reference", ref))
      .unique();
    if (existing) {
      await audit(
        ctx,
        c,
        "duplicate_posting_prevented",
        "Posting already exists.",
        "posting-gateway",
        "posting_gateway",
        true,
        c.state,
        [],
        { postingRef: ref },
      );
      return { ok: true, message: "Existing posting returned." };
    }
    const approval = await ctx.db.get(args.approvalId);
    const proposal = c.proposalId ? await ctx.db.get(c.proposalId) : null;
    const deny = async (message: string) => {
      await audit(
        ctx,
        c,
        "posting_denied",
        message,
        "posting-gateway",
        "posting_gateway",
        false,
      );
      return { ok: false, message };
    };
    if ((await ctx.db.get(c.sandboxId))?.archived)
      return deny("Archived simulations cannot post.");
    if (
      !approval ||
      !proposal ||
      c.state !== "APPROVED" ||
      approval.caseId !== c._id ||
      approval.proposalId !== proposal._id ||
      approval.revision !== c.revision ||
      approval.decision !== "approved"
    )
      return deny("Current approved proposal is required.");
    if (
      !permission(
        approval.role,
        "approve",
        approval.actor,
        proposal.proposedBy,
        !!c.resolution,
      ).ok
    )
      return deny("Approver lacks required authority.");
    const result = reconcile(c.input as InvoiceInput);
    if (
      result.expectedCents === null ||
      result.expectedCents !== proposal.result.expectedCents
    )
      return deny("Financial evidence no longer validates.");
    if (
      result.disposition === "disputed" &&
      (!c.resolution || c.resolution.amountCents !== result.expectedCents)
    )
      return deny(
        "Documented vendor resolution is required before a disputed invoice can post.",
      );
    const period = c.input.end.slice(0, 7);
    const p = await ctx.db
      .query("periods")
      .withIndex("by_sandboxId_and_month", (q) =>
        q.eq("sandboxId", c.sandboxId).eq("month", period),
      )
      .unique();
    if (!p || p.closed)
      return deny("The accounting period is closed or unavailable.");
    const lines = payableJournal(result.expectedCents);
    await ctx.db.insert("journals", {
      caseId: c._id,
      sandboxId: c.sandboxId,
      reference: ref,
      proposalId: proposal._id,
      approvalId: approval._id,
      lines,
      period,
      createdAt: Date.now(),
      reason:
        "Approved service expense and accounts payable; simulated ledger.",
    });
    await transition(
      ctx,
      c,
      "POSTED",
      "Balanced payable recorded",
      "posting-gateway",
      "posting_gateway",
    );
    await audit(
      ctx,
      { ...c, state: "POSTED" },
      "journal_posted",
      "Balanced debit to travel expense and credit to accounts payable.",
      "posting-gateway",
      "posting_gateway",
      true,
      "POSTED",
      proposal.result.evidenceIds,
      { approvalId: approval._id, postingRef: ref },
    );
    return { ok: true, message: "Simulated journal posted." };
  },
});
export const resolve = mutation({
  args: { id: v.id("cases"), amountCents: v.number(), reference: v.string() },
  returns: receipt,
  handler: async (ctx, args) => {
    const { p, c } = await ownedCase(ctx, args.id);
    const result = reconcile(c.input as InvoiceInput);
    if (
      p.role !== "human_controller" ||
      c.state !== "APPROVED" ||
      result.disposition !== "disputed" ||
      result.expectedCents !== args.amountCents ||
      !args.reference.trim()
    ) {
      const message =
        "Controller, approved dispute, vendor reference, and exact supported amount are required.";
      await audit(
        ctx,
        c,
        "vendor_resolution_denied",
        message,
        p.identity,
        p.role,
        false,
      );
      return { ok: false, message };
    }
    const sourceId = `RES-${c.input.code}-R${c.revision + 1}`;
    const text = `Synthetic vendor acceptance ${args.reference.trim()}: invoice corrected to ${(args.amountCents / 100).toFixed(2)} USD. Entered by simulated controller.`;
    await transition(
      ctx,
      c,
      "REVISION_REQUIRED",
      "Vendor resolution received; validating a new proposal",
      p.identity,
      p.role,
    );
    await ctx.db.patch(c._id, {
      resolution: {
        sourceId,
        amountCents: args.amountCents,
        text,
        actor: p.identity,
      },
      input: {
        ...c.input,
        sources: [
          ...c.input.sources,
          {
            id: sourceId,
            kind: "resolution",
            title: "Vendor correction confirmed",
            date: c.input.invoiceDate,
            text,
            clause: args.reference.trim(),
            signed: true,
          },
        ],
      },
      revision: c.revision + 1,
      runId: undefined,
      proposalId: undefined,
    });
    await audit(
      ctx,
      c,
      "vendor_resolution_recorded",
      text,
      p.identity,
      p.role,
      true,
      "REVISION_REQUIRED",
      [sourceId],
    );
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.investigate,
      { caseId: c._id },
    );
    await ctx.db.patch(c._id, { workflowId });
    return {
      ok: true,
      message:
        "Vendor resolution recorded. A new posting proposal is being prepared.",
    };
  },
});
export const resume = mutation({
  args: {
    id: v.id("cases"),
    answer: v.string(),
    correction: v.optional(
      v.object({
        kind: v.literal("overlooked_signed_schedule"),
        sourceIds: v.array(v.string()),
      }),
    ),
    evidence: v.union(
      v.literal("note"),
      v.literal("signed_amendment"),
      v.literal("service_confirmation"),
    ),
  },
  returns: receipt,
  handler: async (ctx, args) => {
    const { p, c } = await ownedCase(ctx, args.id);
    const denyResponse = async (message: string) => {
      await learningAudit(
        ctx,
        p.sandboxId,
        args.correction
          ? "correction_recording_denied"
          : "case_response_denied",
        message,
        c.state,
        c.state,
        { caseId: c._id },
        p.identity,
        p.role,
        false,
        args.correction?.sourceIds ?? [],
      );
      return { ok: false, message };
    };
    if (!["NEEDS_INFO", "REJECTED", "FAILED_RETRYABLE"].includes(c.state))
      return denyResponse("This case is not waiting for a response or retry.");
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
      .order("desc")
      .take(1);
    if (c.state === "FAILED_RETRYABLE" && c.mode === "creao" && !c.runId) {
      if (runs[0]?.status === "submission_pending")
        return denyResponse(
          "Submission outcome is uncertain. Check the CREAO run before starting a new request.",
        );
    }
    if (args.evidence !== "note" && p.role !== "human_controller") {
      await audit(
        ctx,
        c,
        "evidence_denied",
        "A controller must record synthetic signed evidence.",
        p.identity,
        p.role,
        false,
      );
      return {
        ok: false,
        message:
          "Switch to the simulated controller to record signed evidence.",
      };
    }
    if (!args.answer.trim())
      return denyResponse("Describe the clarification or reason for retry.");
    if (args.correction) {
      const original = c.proposalId ? await ctx.db.get(c.proposalId) : null;
      const valid =
        p.role === "human_controller" &&
        args.evidence === "note" &&
        original &&
        original.revision === c.revision &&
        original.result.disposition === "needs_info" &&
        c.state === "NEEDS_INFO" &&
        validCorrectionSources(original.input, args.correction.sourceIds) &&
        args.correction.sourceIds.every(
          (id) =>
            JSON.stringify(original.input.sources.find((s) => s.id === id)) ===
            JSON.stringify(c.input.sources.find((s) => s.id === id)),
        );
      if (!valid) {
        await learningAudit(
          ctx,
          p.sandboxId,
          "correction_recording_denied",
          "Correction requires a controller and signed schedules already present in the original unresolved proposal.",
          c.state,
          c.state,
          { caseId: c._id },
          p.identity,
          p.role,
          false,
          args.correction.sourceIds,
        );
        return {
          ok: false,
          message:
            "Select existing signed additional-room schedules on an unresolved proposal as controller. Newly supplied evidence cannot establish an overlooked schedule.",
        };
      }
      const correctionId = await ctx.db.insert("corrections", {
        sandboxId: p.sandboxId,
        caseId: c._id,
        code: `CORR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
        kind: args.correction.kind,
        originalProposalId: original._id,
        originalRevision: c.revision,
        responseRevision: c.revision + 1,
        ...(original.policyId ? { policyId: original.policyId } : {}),
        sourceIds: args.correction.sourceIds,
        sources: original.input.sources.filter((s) =>
          args.correction!.sourceIds.includes(s.id),
        ),
        originalInput: original.input,
        explanation: args.answer,
        actor: p.identity,
        createdAt: Date.now(),
      });
      await learningAudit(
        ctx,
        p.sandboxId,
        "correction_recorded",
        args.answer,
        "none",
        "recorded",
        { correctionId, caseId: c._id },
        p.identity,
        p.role,
        true,
        args.correction.sourceIds,
      );
    }
    const input = structuredClone(c.input);
    if (
      args.evidence === "note" &&
      p.role === "human_controller" &&
      (args.correction ||
        input.sources.some(
          (s) =>
            s.signed && s.kind === "amendment" && args.answer.includes(s.id),
        ))
    )
      input.sources.push({
        id: `CONFIRM-${c.revision + 1}`,
        kind: "communication",
        title: "Controller scope confirmation",
        date: c.input.invoiceDate,
        clause: "Controller scope confirmation",
        signed: true,
        text: args.answer,
      });
    if (args.evidence === "signed_amendment")
      for (const term of input.terms.filter((t) => t.scope !== "original")) {
        const source = {
          id: term.sourceId,
          kind: "amendment" as const,
          title: "Signed amendment supplied",
          date: term.start,
          clause: "Controller-supplied synthetic amendment",
          signed: true,
          text: `Authorized amendment: ${term.quantity} room-nights at $${(term.rateCents / 100).toFixed(2)}. ${term.scope === "additional" ? "Additional rooms only; original quantities retain their signed rates." : `Explicitly supersedes terms ${term.supersedes?.join(", ")} for the stated service period.`} ${args.answer}`,
        };
        const index = input.sources.findIndex((s) => s.id === term.sourceId);
        if (index < 0) input.sources.push(source);
        else if (!input.sources[index].signed) input.sources[index] = source;
      }
    if (args.evidence === "service_confirmation") {
      input.service.confirmed = true;
      if (!input.sources.some((s) => s.id === input.service.sourceId))
        input.sources.push({
          id: input.service.sourceId,
          kind: "service",
          title: "Service confirmation supplied",
          date: input.end,
          clause: "Confirmed delivery",
          signed: true,
          text: `${input.service.quantity} room-nights confirmed delivered. ${args.answer}`,
        });
    }
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
      .take(30);
    for (const question of questions.filter((q) => !q.answer))
      await ctx.db.patch(question._id, {
        answer: args.answer,
        answeredBy: p.identity,
        answeredAt: Date.now(),
      });
    if (!questions.some((q) => !q.answer))
      await ctx.db.insert("questions", {
        caseId: c._id,
        text: "Investigation clarification",
        createdAt: Date.now(),
        answer: args.answer,
        answeredBy: p.identity,
        answeredAt: Date.now(),
      });
    await transition(
      ctx,
      c,
      "REVISION_REQUIRED",
      "Human response received; investigation resuming",
      p.identity,
      p.role,
    );
    const changed = JSON.stringify(input) !== JSON.stringify(c.input);
    // Resume polling only when the same external run has an unresolved outcome.
    const reuseRun =
      c.state === "FAILED_RETRYABLE" &&
      !changed &&
      !!c.runId &&
      !["failed", "cancelled", "completed"].includes(runs[0]?.status ?? "");
    await ctx.db.patch(c._id, {
      input,
      revision: c.revision + (reuseRun ? 0 : 1),
      proposalId: undefined,
      ...(!reuseRun ? { runId: undefined, providerStatus: undefined } : {}),
    });
    await audit(
      ctx,
      c,
      "human_response",
      args.answer,
      p.identity,
      p.role,
      true,
      "REVISION_REQUIRED",
    );
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.investigate,
      { caseId: c._id },
    );
    await ctx.db.patch(c._id, { workflowId });
    return {
      ok: true,
      message: "Response saved. Investigation resumed automatically.",
    };
  },
});
export const demonstrateDenial = mutation({
  args: {
    id: v.id("cases"),
    action: v.union(v.literal("approve"), v.literal("post")),
  },
  returns: receipt,
  handler: async (ctx, args) => {
    const { c } = await ownedCase(ctx, args.id);
    const auth = permission(
      "ai_agent",
      args.action,
      "attest-investigator",
      "attest-investigator",
      true,
    );
    await audit(
      ctx,
      c,
      `agent_${args.action}_denied`,
      auth.reason,
      "attest-investigator",
      "ai_agent",
      auth.ok,
    );
    return { ok: auth.ok, message: auth.reason };
  },
});
export const reverse = mutation({
  args: { id: v.id("cases"), reason: v.string() },
  returns: receipt,
  handler: async (ctx, args) => {
    const { p, c } = await ownedCase(ctx, args.id);
    if (
      p.role !== "human_controller" ||
      c.state !== "POSTED" ||
      !args.reason.trim()
    ) {
      await audit(
        ctx,
        c,
        "correction_denied",
        "Controller, posted entry, and explanation required.",
        p.identity,
        p.role,
        false,
      );
      return {
        ok: false,
        message: "A controller and explanation are required.",
      };
    }
    const journals = await ctx.db
      .query("journals")
      .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
      .take(20);
    const original = journals.find((j) => !j.reversalOf);
    if (!original) return { ok: false, message: "No original entry." };
    const prior = journals.find((j) => j.reversalOf === original._id);
    if (prior) {
      await audit(
        ctx,
        c,
        "duplicate_correction_prevented",
        "A linked reversal already exists.",
        p.identity,
        p.role,
      );
      return { ok: true, message: "Existing reversal retained." };
    }
    const period = await ctx.db
      .query("periods")
      .withIndex("by_sandboxId_and_month", (q) =>
        q.eq("sandboxId", c.sandboxId).eq("month", "2027-03"),
      )
      .unique();
    if (!period || period.closed)
      return { ok: false, message: "Correction period must be open." };
    const approvalId = await ctx.db.insert("approvals", {
      caseId: c._id,
      proposalId: original.proposalId,
      action: "reverse",
      decision: "approved",
      actor: p.identity,
      role: p.role,
      reason: args.reason,
      createdAt: Date.now(),
      revision: c.revision,
    });
    await ctx.scheduler.runAfter(0, internal.cases.postReversal, {
      id: c._id,
      originalId: original._id,
      approvalId,
    });
    return {
      ok: true,
      message:
        "Correction authorized. Gateway will post a linked reversal in March.",
    };
  },
});
export const postReversal = internalMutation({
  args: {
    id: v.id("cases"),
    originalId: v.id("journals"),
    approvalId: v.id("approvals"),
  },
  returns: receipt,
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id),
      original = await ctx.db.get(args.originalId),
      approval = await ctx.db.get(args.approvalId);
    if (!c || !original || !approval)
      throw new Error("Missing correction records.");
    const ref = `REVERSAL:${original._id}`;
    const existing = await ctx.db
      .query("journals")
      .withIndex("by_reference", (q) => q.eq("reference", ref))
      .unique();
    if (existing) return { ok: true, message: "Existing reversal retained." };
    const period = await ctx.db
      .query("periods")
      .withIndex("by_sandboxId_and_month", (q) =>
        q.eq("sandboxId", c.sandboxId).eq("month", "2027-03"),
      )
      .unique();
    if (
      approval.role !== "human_controller" ||
      approval.action !== "reverse" ||
      approval.decision !== "approved" ||
      approval.caseId !== c._id ||
      original.caseId !== c._id ||
      original.reversalOf ||
      !period ||
      period.closed ||
      (await ctx.db.get(c.sandboxId))?.archived
    ) {
      await audit(
        ctx,
        c,
        "reversal_denied",
        "Correction authorization or period is invalid.",
        "posting-gateway",
        "posting_gateway",
        false,
      );
      return { ok: false, message: "Correction denied." };
    }
    const lines = original.lines.map((l) => ({
      ...l,
      debitCents: l.creditCents,
      creditCents: l.debitCents,
    }));
    validateJournal(lines);
    await ctx.db.insert("journals", {
      caseId: c._id,
      sandboxId: c.sandboxId,
      reference: ref,
      proposalId: original.proposalId,
      approvalId: approval._id,
      lines,
      period: "2027-03",
      createdAt: Date.now(),
      reversalOf: original._id,
      reason: approval.reason,
    });
    await audit(
      ctx,
      c,
      "linked_reversal_posted",
      approval.reason,
      "posting-gateway",
      "posting_gateway",
      true,
      c.state,
      [],
      { approvalId: approval._id, postingRef: ref },
    );
    return {
      ok: true,
      message: "Linked reversal posted. Original entry preserved.",
    };
  },
});
