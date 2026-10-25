/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import {
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
  assert,
} from "vitest";
import schema from "./schema";
import type { CaseRow } from "../src/lib/view-types";
import { api, internal } from "./_generated/api";
import { hotelFixture, scenarios } from "../src/lib/simulation/fixtures";
function required<T>(value: T): NonNullable<T> {
  assert(value != null);
  return value;
}
const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const client = t.withIdentity({
    subject: "accountant",
    issuer: "https://test.local",
    tokenIdentifier: "test|accountant",
  });
  return { t, client };
}
async function seeded() {
  const { t, client } = setup();
  await client.mutation(api.workspace.initialize, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const snapshot = await client.query(api.workspace.snapshot, {});
  assert(snapshot);
  assert(snapshot.sandbox);
  return { t, client, snapshot };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("Persistent financial workflow", () => {
  it("updates the legacy Harbor Court location once without resetting case history", async () => {
    const { t, client, snapshot } = await seeded();
    const harbor = required(
      snapshot.cases.find((c: CaseRow) => c.input.code === "INV-HARBOR-002"),
    );
    expect(harbor.input.destination).toBe("New York City, NY");
    await t.run(async (ctx) => {
      await ctx.db.patch(harbor._id, {
        input: { ...harbor.input, destination: "San Francisco, CA" },
      });
    });
    await client.mutation(api.workspace.initialize, {});
    await client.mutation(api.workspace.initialize, {});
    const updated = required(await client.query(api.workspace.snapshot, {}));
    const corrected = required(
      updated.cases.find((c: CaseRow) => c._id === harbor._id),
    );
    expect(corrected.input.destination).toBe("New York City, NY");
    expect(corrected.state).toBe(harbor.state);
    expect(corrected.proposalId).toBe(harbor.proposalId);
    expect(updated.cases).toHaveLength(snapshot.cases.length);
    expect(
      updated.audit.filter(
        (a: { action: string }) => a.action === "demo_location_updated",
      ),
    ).toHaveLength(1);
  });
  it("automatically investigates ingested invoices with real durable workflow steps", async () => {
    const { client } = await seeded();
    const s = await client.query(api.workspace.snapshot, {});
    assert(s);
    assert(s.sandbox);
    expect(s.cases).toHaveLength(4);
    const main = s.cases.find(
      (c: { input: { code: string } }) => c.input.code === "INV-HOTEL-001",
    );
    assert(main);
    expect(main.state).toBe("PROPOSED");
    expect(required(main.result).differenceCents).toBe(75000);
    expect(
      s.audit.some(
        (a: { action: string }) => a.action === "evidence_retrieved",
      ),
    ).toBe(true);
  });
  it("deduplicates re-ingestion and records the repeat", async () => {
    const { client } = await seeded();
    const a = await client.mutation(api.workspace.inject, {
      input: hotelFixture(),
    });
    const b = await client.mutation(api.workspace.inject, {
      input: hotelFixture(),
    });
    expect(a).toBe(b);
    const s = await client.query(api.workspace.snapshot, {});
    assert(s);
    assert(s.sandbox);
    expect(s.cases).toHaveLength(4);
    expect(
      s.audit.some(
        (a: { action: string }) => a.action === "duplicate_ingestion_prevented",
      ),
    ).toBe(true);
  });
  it("persists denied agent approval and posting without changing case state", async () => {
    const { client, snapshot } = await seeded();
    const c = snapshot.cases[0];
    for (const action of ["approve", "post"] as const)
      expect(
        (
          await client.mutation(api.cases.demonstrateDenial, {
            id: c._id,
            action,
          })
        ).ok,
      ).toBe(false);
    const d = await client.query(api.cases.detail, { id: c._id });
    expect(d.case.state).toBe(c.state);
    expect(
      d.audit.filter((e: { allowed: boolean }) => !e.allowed),
    ).toHaveLength(2);
  });
  it("approves a dispute without posting a reduced payable", async () => {
    const { t, client, snapshot } = await seeded();
    const c = snapshot.cases.find(
      (c: { input: { code: string } }) => c.input.code === "INV-HOTEL-001",
    );
    assert(c);
    expect(
      (
        await client.mutation(api.cases.review, {
          id: c._id,
          proposalId: required(c.proposalId),
          operation: "approve",
          reason: "Sources reviewed",
        })
      ).ok,
    ).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const d = await client.query(api.cases.detail, { id: c._id });
    expect(d.case.state).toBe("APPROVED");
    expect(d.journals).toHaveLength(0);
  });
  it("requires controller resolution and creates one balanced posting under repeated execution", async () => {
    const { t, client, snapshot } = await seeded();
    const c = snapshot.cases.find(
      (c: { input: { code: string } }) => c.input.code === "INV-HOTEL-001",
    );
    assert(c);
    await client.mutation(api.cases.review, {
      id: c._id,
      proposalId: required(c.proposalId),
      operation: "approve",
      reason: "",
    });
    expect(
      (
        await client.mutation(api.cases.resolve, {
          id: c._id,
          amountCents: 1250000,
          reference: "R1",
        })
      ).ok,
    ).toBe(false);
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    await client.mutation(api.cases.resolve, {
      id: c._id,
      amountCents: 1250000,
      reference: "R1",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let d = await client.query(api.cases.detail, { id: c._id });
    expect(d.case.revision).toBe(2);
    expect(
      (
        await client.mutation(api.cases.review, {
          id: c._id,
          proposalId: required(c.proposalId),
          operation: "approve",
          reason: "stale",
        })
      ).ok,
    ).toBe(false);
    await client.mutation(api.cases.review, {
      id: c._id,
      proposalId: required(d.case.proposalId),
      operation: "approve",
      reason: "Verified corrected invoice",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    d = await client.query(api.cases.detail, { id: c._id });
    expect(d.case.state).toBe("POSTED");
    expect(d.journals).toHaveLength(1);
    const a = d.journals[0].approvalId;
    await Promise.all([
      t.mutation(internal.cases.post, { id: c._id, approvalId: a }),
      t.mutation(internal.cases.post, { id: c._id, approvalId: a }),
    ]);
    d = await client.query(api.cases.detail, { id: c._id });
    expect(d.journals).toHaveLength(1);
    expect(d.journals[0].lines[0].debitCents).toBe(1250000);
  });
  it("retains rejected proposals and resumes with signed missing evidence", async () => {
    const { t, client, snapshot } = await seeded();
    const missing = snapshot.cases.find(
      (c: { input: { code: string } }) => c.input.code === "INV-SUMMIT-003",
    );
    assert(missing);
    expect(missing.state).toBe("NEEDS_INFO");
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    await client.mutation(api.cases.resume, {
      id: missing._id,
      answer: "Signed amendment provided by controller.",
      evidence: "signed_amendment",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let d = await client.query(api.cases.detail, { id: missing._id });
    expect(d.case.state).toBe("PROPOSED");
    expect(d.proposals).toHaveLength(2);
    await client.mutation(api.cases.review, {
      id: missing._id,
      proposalId: required(d.case.proposalId),
      operation: "reject",
      reason: "Review this once more",
    });
    await client.mutation(api.cases.resume, {
      id: missing._id,
      answer: "Recheck existing sources",
      evidence: "note",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    d = await client.query(api.cases.detail, { id: missing._id });
    expect(d.proposals).toHaveLength(3);
    expect(
      d.approvals.some((a: { decision: string }) => a.decision === "rejected"),
    ).toBe(true);
  });
  it("posts a linked correction while preserving the original journal", async () => {
    const { t, client, snapshot } = await seeded();
    const c = snapshot.cases.find(
      (c: { input: { code: string } }) => c.input.code === "INV-PACIFIC-004",
    );
    assert(c);
    await client.mutation(api.cases.review, {
      id: c._id,
      proposalId: required(c.proposalId),
      operation: "approve",
      reason: "",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    await client.mutation(api.cases.reverse, {
      id: c._id,
      reason: "Correction in next open period",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const d = await client.query(api.cases.detail, { id: c._id });
    expect(d.journals).toHaveLength(2);
    const reversal = d.journals.find(
      (j: { reversalOf?: string }) => j.reversalOf,
    );
    assert(reversal);
    expect(reversal.period).toBe("2027-03");
    expect(reversal.lines[0].creditCents).toBe(1250000);
    await client.mutation(api.cases.reverse, { id: c._id, reason: "repeat" });
    expect(
      (await client.query(api.cases.detail, { id: c._id })).journals,
    ).toHaveLength(2);
  });
  it("isolates authenticated workspaces and preserves archived history on reset", async () => {
    const { t, client, snapshot } = await seeded();
    const stranger = t.withIdentity({
      subject: "other",
      issuer: "https://test.local",
      tokenIdentifier: "test|other",
    });
    await stranger.mutation(api.workspace.initialize, {});
    await expect(
      stranger.query(api.cases.detail, { id: snapshot.cases[0]._id }),
    ).rejects.toThrow("not found");
    await client.mutation(api.workspace.reset, {});
    const old = await t.run((ctx) => ctx.db.get(snapshot.cases[0]._id));
    expect(old).not.toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      required(required(await client.query(api.workspace.snapshot, {})).sandbox)
        .generation,
    ).toBe(2);
  });
  it("blocks posting into a closed accounting period", async () => {
    const { t, client, snapshot } = await seeded();
    const c = snapshot.cases.find(
      (c: { input: { code: string } }) => c.input.code === "INV-PACIFIC-004",
    );
    assert(c);
    await t.run(async (ctx) => {
      const p = await ctx.db
        .query("periods")
        .withIndex("by_sandboxId_and_month", (q) =>
          q
            .eq("sandboxId", required(snapshot.sandbox)._id)
            .eq("month", "2027-02"),
        )
        .unique();
      await ctx.db.patch(p!._id, { closed: true });
    });
    await client.mutation(api.cases.review, {
      id: c._id,
      proposalId: required(c.proposalId),
      operation: "approve",
      reason: "",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const d = await client.query(api.cases.detail, { id: c._id });
    expect(d.journals).toHaveLength(0);
    expect(
      d.audit.some((a: { action: string }) => a.action === "posting_denied"),
    ).toBe(true);
  });
  it("creates a backtested inactive policy and enforces controller activation", async () => {
    const { t, client } = await seeded();
    await client.mutation(api.policies.propose, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let s = await client.query(api.workspace.snapshot, {});
    assert(s);
    assert(s.sandbox);
    const candidate = s.policies.find(
      (p: { status: string }) => p.status === "candidate",
    );
    assert(candidate);
    expect(candidate.checks.every((c: { passed: boolean }) => c.passed)).toBe(
      true,
    );
    expect(
      (await client.mutation(api.policies.activate, { id: candidate._id })).ok,
    ).toBe(false);
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    expect(
      (await client.mutation(api.policies.activate, { id: candidate._id })).ok,
    ).toBe(true);
  });
});

describe("Investigation recovery and policy correction", () => {
  it("starts a fresh provider run after a human response and passes the answer into context", async () => {
    const { t, client, snapshot } = await seeded();
    const c = required(
      snapshot.cases.find((c) => c.input.code === "INV-HOTEL-001"),
    );
    await client.mutation(api.cases.review, {
      id: c._id,
      proposalId: required(c.proposalId),
      operation: "ask",
      reason: "Verify original room scope.",
    });
    await t.run((ctx) =>
      ctx.db.patch(c._id, { mode: "creao", runId: "old-completed-run" }),
    );
    await client.mutation(api.cases.resume, {
      id: c._id,
      answer: "Preserve the original signed room rate.",
      evidence: "note",
    });
    const current = required(await t.run((ctx) => ctx.db.get(c._id)));
    expect(current.runId).toBeUndefined();
    expect(current.revision).toBe(c.revision + 1);
    const context = await t.mutation(internal.investigations.begin, {
      caseId: c._id,
    });
    assert(context);
    expect(
      context.responses.some(
        (q: { answer?: string }) =>
          q.answer === "Preserve the original signed room rate.",
      ),
    ).toBe(true);
    await t.run((ctx) => ctx.db.patch(c._id, { mode: "deterministic" }));
    await t.mutation(internal.investigations.complete, {
      caseId: c._id,
      attempt: context.attempt,
      revision: context.revision,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("blocks blind resubmission when a provider submission has an unknown outcome", async () => {
    const { t, client, snapshot } = await seeded();
    const c = snapshot.cases[0];
    await t.run(async (ctx) => {
      await ctx.db.patch(c._id, {
        mode: "creao",
        state: "FAILED_RETRYABLE",
        providerStatus: "failed",
      });
      await ctx.db.insert("runs", {
        caseId: c._id,
        attempt: c.attempt,
        status: "submission_pending",
        createdAt: Date.now(),
      });
    });
    const result = await client.mutation(api.cases.resume, {
      id: c._id,
      answer: "Retry",
      evidence: "note",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("uncertain");
  });
  it("rejects stale investigation completions without replacing an existing proposal", async () => {
    const { t, client, snapshot } = await seeded();
    const c = snapshot.cases[0];
    await expect(
      t.mutation(internal.investigations.complete, {
        caseId: c._id,
        attempt: 0,
        revision: 1,
        raw: {},
      }),
    ).rejects.toThrow("Stale");
    expect(
      (await client.query(api.cases.detail, { id: c._id })).case.proposalId,
    ).toBe(c.proposalId);
  });
  it("learns from a real controller correction while retaining prior policies and decisions", async () => {
    const { t, client } = await seeded();
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    await client.mutation(api.policies.propose, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let s = required(await client.query(api.workspace.snapshot, {}));
    const first = required(s.policies.find((p) => p.status === "candidate"));
    await client.mutation(api.policies.activate, { id: first._id });
    const input = hotelFixture("LEARNING-1");
    input.sources[1].title = "Block extension · signed room schedule";
    const id = await client.mutation(api.workspace.inject, { input });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await client.query(api.cases.detail, { id })).case.state).toBe(
      "NEEDS_INFO",
    );
    await client.mutation(api.cases.resume, {
      id,
      answer:
        "AMD-HOTEL-001 explicitly preserves original rates and adds 20 rooms.",
      evidence: "note",
      correction: {
        kind: "overlooked_signed_schedule",
        sourceIds: ["AMD-HOTEL-001"],
      },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const corrected = await client.query(api.cases.detail, { id });
    expect(
      (
        await client.mutation(api.cases.review, {
          id,
          proposalId: corrected.case.proposalId!,
          operation: "approve",
          reason: "Accepted correction",
        })
      ).ok,
    ).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await client.mutation(api.policies.propose, { caseId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    s = required(await client.query(api.workspace.snapshot, {}));
    const improved = required(s.policies.find((p) => p.status === "candidate"));
    await client.mutation(api.policies.activate, { id: improved._id });
    const next = structuredClone(input);
    next.code = "LEARNING-2";
    next.sources.find((s) => s.kind === "invoice")!.id = next.code;
    const nextId = await client.mutation(api.workspace.inject, { input: next });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const d = await client.query(api.cases.detail, { id: nextId });
    expect(d.case.state).toBe("PROPOSED");
    expect(d.proposals[0].result.expectedCents).toBe(1250000);
    expect(
      (await client.query(api.cases.detail, { id })).proposals.some(
        (p) => p.policyId === first._id,
      ),
    ).toBe(true);
    s = required(await client.query(api.workspace.snapshot, {}));
    expect(s.policies.find((p) => p._id === first._id)?.status).toBe(
      "superseded",
    );
  });
});
