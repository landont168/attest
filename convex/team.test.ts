/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import {
  beforeEach,
  afterEach,
  vi,
  describe,
  it,
  expect,
  assert,
} from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { authorizeFinance } from "../src/lib/finance/organization";
import { canonicalFixture } from "../src/lib/simulation/finance-team";
import { paymentFinding, applySettlement } from "../src/lib/finance/settlement";
import { reconcile, payableJournal } from "../src/lib/finance/engine";
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const client = t.withIdentity({
    subject: "team-reviewer",
    issuer: "https://test.local",
    tokenIdentifier: "test|team-reviewer",
  });
  await client.mutation(api.workspace.initialize, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const snapshot = await client.query(api.workspace.snapshot, {});
  assert(snapshot);
  const hero = snapshot.cases.find((c) => c.input.code === "INV-TEAM-001");
  assert(hero);
  return { t, client, snapshot, hero };
}
describe("Finance organization and capabilities", () => {
  it("enforces segregation and restricted specialist capabilities", () => {
    expect(
      authorizeFinance({ id: "ap", role: "ai_agent" }, "approve", {
        proposer: "ap",
      }).ok,
    ).toBe(false);
    expect(
      authorizeFinance({ id: "contract", role: "contract_finance" }, "post").ok,
    ).toBe(false);
    expect(
      authorizeFinance(
        { id: "payment", role: "payment_reconciliation" },
        "transfer",
      ).ok,
    ).toBe(false);
    expect(
      authorizeFinance({ id: "auditor", role: "internal_auditor" }, "respond")
        .ok,
    ).toBe(false);
    expect(
      authorizeFinance(
        { id: "controller", role: "human_controller" },
        "approve",
        { proposer: "ap", amountCents: 2000000 },
      ).ok,
    ).toBe(true);
    expect(
      authorizeFinance({ id: "manager", role: "human_accountant" }, "approve", {
        amountCents: 100001,
        limitCents: 100000,
      }).ok,
    ).toBe(false);
  });
  it("persists actual ownership, specialist outputs and draft-only disputes across refresh", async () => {
    const { t, client, hero } = await setup();
    const detail = await client.query(api.cases.detail, { id: hero._id });
    expect(detail.case.ownerActorId).toBe("attest-investigator");
    expect(detail.subtasks.map((t) => t.kind).sort()).toEqual([
      "contract",
      "dispute",
      "payment",
    ]);
    for (const task of detail.subtasks) {
      expect(task.status).toBe("completed");
      expect(task.output).toBeTruthy();
      expect(task.auditId).toBeTruthy();
      expect(task.completedAt).toBeDefined();
    }
    expect(
      detail.subtasks
        .find((t) => t.kind === "contract")
        ?.output.cohorts.map((c: { quantity: number }) => c.quantity),
    ).toEqual([50, 20]);
    expect(
      detail.subtasks.find((t) => t.kind === "payment")?.output.depositCents,
    ).toBe(300000);
    expect(detail.disputes[0].communicationMode).toBe("draft_only");
    expect(detail.disputes[0].draft).toContain("no external message sent");
    await client.mutation(api.workspace.initialize, {});
    const again = await client.query(api.cases.detail, { id: hero._id });
    expect(again.subtasks.map((t) => t._id)).toEqual(
      detail.subtasks.map((t) => t._id),
    );
    const directory = await client.query(api.team.directory, {});
    expect(directory.employees).toHaveLength(10);
    const missing = directory.cases.find(
      (c) => c.input.code === "INV-SUMMIT-003",
    );
    assert(missing);
    const missingDetail = await client.query(api.cases.detail, {
      id: missing._id,
    });
    expect(
      missingDetail.subtasks.find((t) => t.kind === "contract")?.output
        .applicableAmendmentIds,
    ).toEqual([]);

    expect(
      await t.mutation(internal.team.runSpecialist, {
        caseId: hero._id,
        revision: hero.revision - 1,
        attempt: hero.attempt,
        kind: "contract",
      }),
    ).toBe(false);
  });
  it("audits denial for auditor mutations and manager over-limit reviews", async () => {
    const { client, hero } = await setup();
    assert(hero.proposalId);
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    expect(
      (await client.mutation(api.team.configureLimit, { limitCents: 50000 }))
        .ok,
    ).toBe(true);
    await client.mutation(api.workspace.setRole, { role: "human_accountant" });
    expect(
      (
        await client.mutation(api.cases.review, {
          id: hero._id,
          proposalId: hero.proposalId,
          operation: "approve",
          reason: "Review",
        })
      ).ok,
    ).toBe(false);
    await client.mutation(api.workspace.setRole, { role: "internal_auditor" });
    expect(
      await client.mutation(api.workspace.inject, {
        input: canonicalFixture("UNAUTHORIZED"),
      }),
    ).toBeNull();
    expect(
      (
        await client.mutation(api.cases.resume, {
          id: hero._id,
          answer: "Attempt",
          evidence: "note",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await client.mutation(api.cases.review, {
          id: hero._id,
          proposalId: hero.proposalId,
          operation: "approve",
          reason: "Attempt",
        })
      ).ok,
    ).toBe(false);
    const detail = await client.query(api.cases.detail, { id: hero._id });
    expect(
      detail.audit.some((a) => !a.allowed && a.role === "internal_auditor"),
    ).toBe(true);
    expect(
      detail.audit.some((a) => !a.allowed && a.role === "human_accountant"),
    ).toBe(true);
  });
  it("keeps a failed specialist auditable and never silently completes it", async () => {
    const { t, hero } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(hero._id, {
        state: "INVESTIGATING",
        attempt: hero.attempt + 1,
      });
      await ctx.db.insert("subtasks", {
        sandboxId: hero.sandboxId,
        caseId: hero._id,
        revision: hero.revision,
        attempt: hero.attempt + 1,
        assignedActorId: "wrong-actor",
        requestedBy: "attest-investigator",
        kind: "contract",
        request: "Review",
        requiredEvidence: [],
        status: "queued",
        createdAt: Date.now(),
      });
    });
    const args = {
      caseId: hero._id,
      revision: hero.revision,
      attempt: hero.attempt + 1,
      kind: "contract" as const,
    };
    expect(await t.mutation(internal.team.runSpecialist, args)).toBe(false);
    expect(await t.mutation(internal.team.runSpecialist, args)).toBe(false);
    const failed = await t.run((ctx) =>
      ctx.db
        .query("subtasks")
        .withIndex("by_caseId", (q) => q.eq("caseId", hero._id))
        .collect(),
    );
    expect(failed.find((t) => t.attempt === args.attempt)?.status).toBe(
      "failed",
    );
    expect(
      failed.find((t) => t.attempt === args.attempt)?.auditId,
    ).toBeTruthy();
  });
});
describe("Human handoffs and financial completion", () => {
  it("calculates canonical amounts then posts the deposit once after independent approval", async () => {
    const { t, client, hero } = await setup();
    assert(hero.proposalId);
    expect(hero.result).toMatchObject({
      invoiceCents: 2100000,
      expectedCents: 2000000,
      differenceCents: 100000,
      depositCents: 300000,
      invoiceOutstandingCents: 1800000,
      remainingDueCents: 1700000,
    });
    expect(
      (
        await client.mutation(api.cases.review, {
          id: hero._id,
          proposalId: hero.proposalId,
          operation: "approve",
          reason: "Authorize draft dispute",
        })
      ).ok,
    ).toBe(true);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("journals")
          .withIndex("by_caseId", (q) => q.eq("caseId", hero._id))
          .collect(),
      ),
    ).toHaveLength(0);
    await client.mutation(api.workspace.setRole, { role: "vendor_manager" });
    expect(
      (
        await client.mutation(api.cases.resolve, {
          id: hero._id,
          amountCents: 2000000,
          reference: "CREDIT-001",
          responseText:
            "Vendor supplied a corrected $20,000 gross invoice; October deposit remains credited.",
        })
      ).ok,
    ).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const revised = await client.query(api.cases.detail, { id: hero._id });
    assert(revised.case.proposalId);
    expect(revised.case.proposalId).not.toBe(hero.proposalId);
    await client.mutation(api.workspace.setRole, { role: "human_accountant" });
    expect(
      (
        await client.mutation(api.cases.review, {
          id: hero._id,
          proposalId: revised.case.proposalId,
          operation: "approve",
          reason: "Attempt",
        })
      ).ok,
    ).toBe(false);
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    expect(
      (
        await client.mutation(api.cases.review, {
          id: hero._id,
          proposalId: revised.case.proposalId,
          operation: "approve",
          reason: "Approve corrected payable",
        })
      ).ok,
    ).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const posted = await client.query(api.cases.detail, { id: hero._id });
    expect(posted.case.state).toBe("POSTED");
    expect(posted.journals).toHaveLength(1);
    expect(
      posted.journals[0].lines.map((l) => l.debitCents || l.creditCents),
    ).toEqual([2000000, 1700000, 300000]);
    const approval = posted.approvals.find(
      (a) =>
        a.proposalId === revised.case.proposalId && a.decision === "approved",
    );
    assert(approval);
    expect(
      (
        await t.mutation(internal.cases.post, {
          id: hero._id,
          approvalId: approval._id,
        })
      ).ok,
    ).toBe(true);
    expect(
      (await client.query(api.cases.detail, { id: hero._id })).journals,
    ).toHaveLength(1);
  });
  it("assigns missing delivery to Travel, rejects other roles, and resumes the original case", async () => {
    const { t, client, snapshot } = await setup();
    const c = snapshot.cases.find((c) => c.input.code === "INV-TEAM-002");
    assert(c);
    expect(c.state).toBe("NEEDS_INFO");
    const before = await client.query(api.cases.detail, { id: c._id });
    expect(before.questions[0].requiredRole).toBe("travel_coordinator");
    expect(
      (
        await client.mutation(api.cases.resume, {
          id: c._id,
          evidence: "note",
          answer: "Not my evidence",
        })
      ).ok,
    ).toBe(false);
    await client.mutation(api.workspace.setRole, {
      role: "travel_coordinator",
    });
    expect(
      (
        await client.mutation(api.cases.resume, {
          id: c._id,
          evidence: "service_confirmation",
          answer: "All 70 room-nights verified from the hotel roster.",
          deliveredQuantity: 70,
        })
      ).ok,
    ).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await client.query(api.cases.detail, { id: c._id });
    expect(after.case.state).toBe("PROPOSED");
    expect(
      after.proposals.find((p) => p._id === after.case.proposalId)?.result
        .differenceCents,
    ).toBe(100000);
    expect(after.questions[0].answer).toContain("70 room-nights");
    expect(after.questions[0].status).toBe("answered");
    expect(after.case.revision).toBe(c.revision + 1);
  });
  it("preserves rejected proposals and requires fresh approval on revision", async () => {
    const { t, client, hero } = await setup();
    assert(hero.proposalId);
    expect(
      (
        await client.mutation(api.cases.review, {
          id: hero._id,
          proposalId: hero.proposalId,
          operation: "reject",
          reason: "Please recheck the deposit evidence.",
        })
      ).ok,
    ).toBe(true);
    expect(
      (await client.query(api.cases.detail, { id: hero._id })).case.state,
    ).toBe("REJECTED");
    expect(
      (
        await client.mutation(api.cases.resume, {
          id: hero._id,
          evidence: "note",
          answer: "Recheck unchanged source records and recalculate.",
        })
      ).ok,
    ).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const revised = await client.query(api.cases.detail, { id: hero._id });
    expect(revised.case.state).toBe("PROPOSED");
    expect(revised.proposals).toHaveLength(2);
    expect(revised.case.proposalId).not.toBe(hero.proposalId);
    expect(
      (
        await client.mutation(api.cases.review, {
          id: hero._id,
          proposalId: hero.proposalId,
          operation: "approve",
          reason: "Stale",
        })
      ).ok,
    ).toBe(false);
    expect(revised.journals).toHaveLength(0);
    expect(revised.audit.some((a) => a.action === "revision_requested")).toBe(
      true,
    );
  });
  it("withholds amounts for a duplicate deposit credit", async () => {
    const { snapshot } = await setup();
    const c = snapshot.cases.find((c) => c.input.code === "INV-TEAM-003");
    assert(c);
    expect(c.state).toBe("NEEDS_INFO");
    expect(c.result?.remainingDueCents).toBeNull();
    expect(c.result?.issues.join(" ")).toContain("exactly once");
  });
});
describe("Payment evidence guards", () => {
  it("requires matching settled bank and AP records and never applies a deposit twice", () => {
    const input = canonicalFixture();
    assert(input.deposit);
    const d = input.deposit;
    const bank = {
      transactionId: d.transactionId,
      contractId: input.contractId,
      vendorId: input.vendorId,
      amountCents: d.amountCents,
      paidAt: "2026-10-20",
      status: "settled",
      sourceId: d.bankSourceId,
    };
    const credit = {
      transactionId: d.transactionId,
      contractId: input.contractId,
      vendorId: input.vendorId,
      amountCents: d.amountCents,
      invoiceCode: input.code,
      sourceId: d.creditSourceId,
    };
    expect(payableJournal(300000, 300000)).toHaveLength(2);
    const valid = paymentFinding(input, [bank], [credit]);
    expect(valid.issues).toEqual([]);
    expect(
      applySettlement(input, reconcile(input), valid).remainingDueCents,
    ).toBe(1700000);
    for (const finding of [
      paymentFinding(input, [], [credit]),
      paymentFinding(input, [{ ...bank, paidAt: "invalid-date" }], [credit]),
      paymentFinding(input, [{ ...bank, paidAt: "2026-10-19" }], [credit]),
      paymentFinding(input, [{ ...bank, status: "pending" }], [credit]),
      paymentFinding(input, [bank], [credit, credit]),
      paymentFinding(input, [bank], [{ ...credit, invoiceCode: "other" }]),
    ]) {
      expect(finding.issues.length).toBeGreaterThan(0);
      expect(
        applySettlement(input, reconcile(input), finding).remainingDueCents,
      ).toBeNull();
    }
  });
});
