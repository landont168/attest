import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { audit, profile } from "./lib";
import {
  EMPLOYEES,
  DEFAULT_APPROVAL_LIMIT,
  authorizeFinance,
} from "../src/lib/finance/organization";
import { reconcile } from "../src/lib/finance/engine";
import { paymentFinding } from "../src/lib/finance/settlement";
import type { InvoiceInput } from "../src/lib/finance/types";
import { receipt } from "./validators";

export async function ensureOrganization(
  ctx: MutationCtx,
  sandboxId: Id<"sandboxes">,
) {
  for (const e of EMPLOYEES) {
    const old = await ctx.db
      .query("employees")
      .withIndex("by_sandboxId_and_code", (q) =>
        q.eq("sandboxId", sandboxId).eq("code", e.code),
      )
      .unique();
    if (!old)
      await ctx.db.insert("employees", {
        sandboxId,
        code: e.code,
        actorId:
          e.kind === "human" ? `staff:${sandboxId}:${e.actorId}` : e.actorId,
        name: e.name,
        role: e.role,
        kind: e.kind,
        department: e.department,
      });
  }
  const sandbox = await ctx.db.get(sandboxId);
  if (sandbox?.routineApprovalLimitCents === undefined)
    await ctx.db.patch(sandboxId, {
      routineApprovalLimitCents: DEFAULT_APPROVAL_LIMIT,
    });
  const cases = await ctx.db
    .query("cases")
    .withIndex("by_sandboxId", (q) => q.eq("sandboxId", sandboxId))
    .take(40);
  for (const c of cases)
    if (!c.ownerActorId) {
      await ctx.db.patch(c._id, { ownerActorId: "attest-investigator" });
      await audit(
        ctx,
        c,
        "case_owner_assigned",
        "AP Analyst owns this case through investigation and resolution.",
      );
    }
}
export async function seedPaymentRecords(
  ctx: MutationCtx,
  sandboxId: Id<"sandboxes">,
  input: InvoiceInput,
) {
  if (!input.deposit) return;
  const d = input.deposit;
  const old = await ctx.db
    .query("bankRecords")
    .withIndex("by_sandboxId_and_transactionId", (q) =>
      q.eq("sandboxId", sandboxId).eq("transactionId", d.transactionId),
    )
    .unique();
  if (!old)
    await ctx.db.insert("bankRecords", {
      sandboxId,
      transactionId: d.transactionId,
      contractId: input.contractId,
      vendorId: input.vendorId,
      amountCents: d.amountCents,
      paidAt: "2026-10-20",
      status: "settled",
      sourceId: d.bankSourceId,
    });
  const credits = await ctx.db
    .query("paymentCredits")
    .withIndex("by_sandboxId_and_invoiceCode", (q) =>
      q.eq("sandboxId", sandboxId).eq("invoiceCode", input.code),
    )
    .take(20);
  if (!credits.length) {
    const credit = {
      sandboxId,
      invoiceCode: input.code,
      transactionId: d.transactionId,
      contractId: input.contractId,
      vendorId: input.vendorId,
      amountCents: d.amountCents,
      sourceId: d.creditSourceId,
    };
    await ctx.db.insert("paymentCredits", credit);
    if (input.code === "INV-TEAM-003")
      await ctx.db.insert("paymentCredits", {
        ...credit,
        sourceId: `${d.creditSourceId}-DUPLICATE`,
      });
  }
}
export async function loadPaymentFinding(
  ctx: QueryCtx | MutationCtx,
  c: Doc<"cases">,
) {
  const d = c.input.deposit;
  if (!d) return paymentFinding(c.input as InvoiceInput, [], []);
  const bank = await ctx.db
    .query("bankRecords")
    .withIndex("by_sandboxId_and_transactionId", (q) =>
      q.eq("sandboxId", c.sandboxId).eq("transactionId", d.transactionId),
    )
    .take(20);
  // Query across invoices: a deposit applied to two invoices is not safe to credit.
  const credits = await ctx.db
    .query("paymentCredits")
    .withIndex("by_sandboxId_and_transactionId", (q) =>
      q.eq("sandboxId", c.sandboxId).eq("transactionId", d.transactionId),
    )
    .take(30);
  return paymentFinding(c.input as InvoiceInput, bank, credits);
}
export async function delegateSpecialists(ctx: MutationCtx, c: Doc<"cases">) {
  await ctx.db.patch(c._id, { ownerActorId: "attest-investigator" });
  const old = await ctx.db
    .query("subtasks")
    .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
    .take(100);
  for (const kind of ["contract", "payment"] as const) {
    if (
      old.some(
        (t) =>
          t.revision === c.revision &&
          t.attempt === c.attempt &&
          t.kind === kind,
      )
    )
      continue;
    const employee = EMPLOYEES.find((e) => e.code === kind)!;
    const requiredEvidence = c.input.sources
      .filter((s) =>
        kind === "contract"
          ? ["contract", "amendment"].includes(s.kind)
          : ["payment", "credit"].includes(s.kind),
      )
      .map((s) => s.id);
    const request =
      kind === "contract"
        ? "Identify governing clauses, rate cohorts, amendment scope and uncertainties."
        : "Verify settled deposits against bank and AP credit records; apply each exactly once.";
    const auditId = await audit(
      ctx,
      c,
      "specialist_assigned",
      `AP Analyst assigned ${kind === "contract" ? "contract interpretation to Contract Finance" : "deposit review to Payment Reconciliation"}.`,
      "attest-investigator",
      "ai_agent",
      true,
      c.state,
      requiredEvidence,
    );
    await ctx.db.insert("subtasks", {
      sandboxId: c.sandboxId,
      caseId: c._id,
      revision: c.revision,
      attempt: c.attempt,
      assignedActorId: employee.actorId,
      requestedBy: "attest-investigator",
      kind,
      request,
      requiredEvidence,
      status: "queued",
      createdAt: Date.now(),
      auditId,
    });
  }
}
export async function executeSpecialist(
  ctx: MutationCtx,
  c: Doc<"cases">,
  kind: "contract" | "payment",
) {
  const tasks = await ctx.db
    .query("subtasks")
    .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
    .take(100);
  const task = tasks.find(
    (t) =>
      t.kind === kind && t.revision === c.revision && t.attempt === c.attempt,
  );
  if (!task) throw new Error("Required specialist assignment is missing.");
  if (task.status !== "queued") return task.status !== "failed";
  const employee = EMPLOYEES.find((e) => e.code === kind)!;
  const permission = authorizeFinance(
    { id: task.assignedActorId, role: employee.role },
    kind === "contract" ? "contract_review" : "payment_review",
  );
  if (task.assignedActorId !== employee.actorId || !permission.ok) {
    const auditId = await audit(
      ctx,
      c,
      "specialist_execution_denied",
      "Assignment actor does not match the specialist capability.",
      task.assignedActorId,
      employee.role,
      false,
    );
    await ctx.db.patch(task._id, {
      status: "failed",
      error: "Assignment actor mismatch",
      completedAt: Date.now(),
      auditId,
    });
    return false;
  }
  try {
    let output;
    let unresolved = false;
    if (kind === "payment") {
      output = await loadPaymentFinding(ctx, c);
      unresolved = output.issues.length > 0;
    } else {
      const result = reconcile(c.input as InvoiceInput);
      const precedents = (
        await ctx.db
          .query("precedents")
          .withIndex("by_sandboxId", (q) => q.eq("sandboxId", c.sandboxId))
          .take(30)
      ).filter((p) => p.active && p.vendor === c.input.vendor);
      output = {
        kind: "contract",
        historicalPrecedents: precedents.map((p) => ({
          id: p._id,
          reference: p.code,
          decision: p.explanation,
        })),
        governingContractId: c.input.contractId,
        applicableAmendmentIds: [
          ...new Set(
            c.input.terms
              .filter(
                (t) =>
                  t.scope !== "original" &&
                  t.contractId === c.input.contractId &&
                  t.vendorId === c.input.vendorId &&
                  c.input.sources.some(
                    (s) =>
                      s.id === t.sourceId && s.kind === "amendment" && s.signed,
                  ) &&
                  t.start <= c.input.start &&
                  t.end >= c.input.end,
              )
              .map((t) => t.sourceId),
          ),
        ],
        effectiveDate: c.input.start,
        cohorts: result.cohorts,
        clauses: c.input.sources
          .filter((s) => ["contract", "amendment"].includes(s.kind))
          .map((s) => ({ sourceId: s.id, clause: s.clause, signed: s.signed })),
        conflictingEvidence: result.issues,
        uncertainties: result.issues,
        recommendation: result.explanation,
        summary:
          result.disposition === "needs_info"
            ? "Contract or supporting service authority requires review."
            : "Governing rate cohorts and signed clauses identified.",
      };
      unresolved = result.disposition === "needs_info";
    }
    const auditId = await audit(
      ctx,
      c,
      "specialist_findings_returned",
      output.summary,
      employee.actorId,
      employee.role,
      true,
      c.state,
      task.requiredEvidence,
    );
    await ctx.db.patch(task._id, {
      status: unresolved ? "needs_info" : "completed",
      output,
      completedAt: Date.now(),
      auditId,
    });
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Specialist failed.";
    const auditId = await audit(
      ctx,
      c,
      "specialist_failed",
      message,
      employee.actorId,
      employee.role,
      false,
    );
    await ctx.db.patch(task._id, {
      status: "failed",
      error: message,
      completedAt: Date.now(),
      auditId,
    });
    return false;
  }
}
export const runSpecialist = internalMutation({
  args: {
    caseId: v.id("cases"),
    revision: v.number(),
    attempt: v.number(),
    kind: v.union(v.literal("contract"), v.literal("payment")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.caseId);
    if (
      !c ||
      c.state !== "INVESTIGATING" ||
      c.revision !== args.revision ||
      c.attempt !== args.attempt
    )
      return false;
    return await executeSpecialist(ctx, c, args.kind);
  },
});
export async function assignHumanRequest(
  ctx: MutationCtx,
  c: Doc<"cases">,
  text: string,
) {
  const serviceMissing =
    !c.input.service.confirmed ||
    !c.input.sources.some((s) => s.id === c.input.service.sourceId && s.signed);
  const code = serviceMissing ? "travel" : "controller";
  const employee = await ctx.db
    .query("employees")
    .withIndex("by_sandboxId_and_code", (q) =>
      q.eq("sandboxId", c.sandboxId).eq("code", code),
    )
    .unique();
  await ctx.db.insert("questions", {
    caseId: c._id,
    text,
    createdAt: Date.now(),
    assignedActorId: employee?.actorId,
    requiredRole: serviceMissing ? "travel_coordinator" : "human_controller",
    evidenceKind: serviceMissing ? "service_confirmation" : "note",
    status: "open",
  });
  await audit(
    ctx,
    c,
    "human_information_requested",
    `AP Analyst requested ${serviceMissing ? "Travel Operations delivery evidence" : "controller clarification"}.`,
    "attest-investigator",
    "ai_agent",
    true,
    c.state,
    c.input.sources.map((s) => s.id),
  );
}
export async function prepareDispute(
  ctx: MutationCtx,
  c: Doc<"cases">,
  proposalId: Id<"proposals">,
) {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal || proposal.result.disposition !== "disputed" || c.resolution)
    return;
  const existing = await ctx.db
    .query("disputes")
    .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
    .take(30);
  if (existing.some((d) => d.proposalId === proposalId)) return;
  const amountCents = Math.abs(proposal.result.differenceCents ?? 0);
  const limit =
    (await ctx.db.get(c.sandboxId))?.routineApprovalLimitCents ??
    DEFAULT_APPROVAL_LIMIT;
  const requiredApprover =
    amountCents > limit ? "Financial Controller" : "Accounts Payable Manager";
  const draft = `DRAFT ONLY — no external message sent.\nInvoice ${c.input.code} / ${c.input.vendor}\nContract ${c.input.contractId}\n${proposal.result.cohorts.map((t) => `${t.quantity} × ${(t.rateCents / 100).toFixed(2)} = ${(t.amountCents / 100).toFixed(2)} USD [${t.sourceId}]`).join("\n")}\nProposed dispute: ${(amountCents / 100).toFixed(2)} USD.\n${proposal.result.explanation}\nDeposit credited: ${((proposal.result.depositCents ?? 0) / 100).toFixed(2)} USD.\nRequest a revised invoice with supporting evidence. Internal approval does not establish vendor acceptance.`;
  await ctx.db.insert("disputes", {
    sandboxId: c.sandboxId,
    caseId: c._id,
    proposalId,
    revision: c.revision,
    assignedActorId: "attest-vendor-dispute",
    amountCents,
    status: "proposed",
    draft,
    evidenceIds: proposal.result.evidenceIds,
    requiredApprover,
    communicationMode: "draft_only",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const auditId = await audit(
    ctx,
    { ...c, proposalId },
    "dispute_prepared",
    `Vendor Dispute Specialist prepared a draft for ${requiredApprover} review. No external communication sent.`,
    "attest-vendor-dispute",
    "vendor_dispute",
    true,
    c.state,
    proposal.result.evidenceIds,
  );
  await ctx.db.insert("subtasks", {
    sandboxId: c.sandboxId,
    caseId: c._id,
    revision: c.revision,
    attempt: c.attempt,
    assignedActorId: "attest-vendor-dispute",
    requestedBy: "attest-investigator",
    kind: "dispute",
    request:
      "Prepare an evidence-backed dispute draft and identify approval authority.",
    requiredEvidence: proposal.result.evidenceIds,
    status: "completed",
    output: {
      kind: "dispute",
      amountCents,
      requiredApprover,
      draft,
      communicationMode: "draft_only",
      evidenceIds: proposal.result.evidenceIds,
    },
    createdAt: Date.now(),
    completedAt: Date.now(),
    auditId,
  });
}
export async function updateDisputeStatus(
  ctx: MutationCtx,
  c: Doc<"cases">,
  status: string,
) {
  const records = await ctx.db
    .query("disputes")
    .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
    .take(30);
  for (const d of records.filter((d) => d.proposalId === c.proposalId))
    await ctx.db.patch(d._id, { status, updatedAt: Date.now() });
}
export const directory = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const p = await profile(ctx);
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .take(20);
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .take(40);
    const tasks = await ctx.db
      .query("subtasks")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .order("desc")
      .take(300);
    const questions = (
      await Promise.all(
        cases.map((c) =>
          ctx.db
            .query("questions")
            .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
            .take(30),
        ),
      )
    ).flat();
    const disputes = await ctx.db
      .query("disputes")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .take(40);
    return {
      employees,
      cases,
      tasks,
      questions,
      disputes,
      activeActorId: p.actorId,
      approvalLimitCents:
        (await ctx.db.get(p.sandboxId))?.routineApprovalLimitCents ??
        DEFAULT_APPROVAL_LIMIT,
    };
  },
});
export const configureLimit = mutation({
  args: { limitCents: v.number() },
  returns: receipt,
  handler: async (ctx, args) => {
    const p = await profile(ctx);
    const ok =
      p.role === "human_controller" &&
      Number.isSafeInteger(args.limitCents) &&
      args.limitCents >= 0 &&
      args.limitCents <= 100_000_000;
    await ctx.db.insert("audit", {
      sandboxId: p.sandboxId,
      timestamp: Date.now(),
      actor: p.actorId,
      role: p.role,
      action: ok ? "approval_limit_updated" : "approval_limit_denied",
      allowed: ok,
      before: "authorization policy",
      after: ok ? String(args.limitCents) : "unchanged",
      reason: ok
        ? "Fictional demonstration approval limit updated."
        : "Controller and a valid integer-cent limit are required.",
      evidenceIds: [],
    });
    if (ok)
      await ctx.db.patch(p.sandboxId, {
        routineApprovalLimitCents: args.limitCents,
      });
    return {
      ok,
      message: ok
        ? "Demo approval limit updated."
        : "Not authorized or invalid limit.",
    };
  },
});
