/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import {
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  assert,
  vi,
} from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { datasetCases, type Dataset } from "../src/lib/simulation/datasets";
import { inputSchema } from "../src/lib/finance/types";
import { reconcile } from "../src/lib/finance/engine";
import { paymentFinding, applySettlement } from "../src/lib/finance/settlement";
import { datasetAnswers } from "../tests/fixtures/dataset-answers";
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const client = t.withIdentity({
    subject: "datasets",
    issuer: "https://test.local",
    tokenIdentifier: "test|datasets",
  });
  return { t, client };
}
async function seeded(dataset: Dataset) {
  const { t, client } = setup();
  expect((await client.mutation(api.datasets.select, { dataset })).ok).toBe(
    true,
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const s = await client.query(api.workspace.snapshot, {});
  assert(s);
  return { t, client, s };
}
describe("Separate deterministic datasets", () => {
  it("preserves the canonical discrepancy, authorizes the unusual charge, and asks for missing delivery", async () => {
    const { client, s } = await seeded("demo");
    expect(s.cases).toHaveLength(3);
    const hero = s.cases.find((c) => c.input.code === "INV-TEAM-001");
    assert(hero);
    expect(hero.result).toMatchObject({
      invoiceCents: 2100000,
      expectedCents: 2000000,
      differenceCents: 100000,
      depositCents: 300000,
      invoiceOutstandingCents: 1800000,
      remainingDueCents: 1700000,
    });
    const valid = s.cases.find((c) => c.input.code === "DEMO-VALID-002");
    assert(valid);
    expect(valid.result?.disposition).toBe("matched");
    expect(valid.result?.differenceCents).toBe(0);
    expect(valid.result?.evidenceIds).toContain("AMD-DEMO-VALID-002");
    const missing = s.cases.find((c) => c.input.code === "DEMO-MISSING-003");
    assert(missing);
    expect(missing.state).toBe("NEEDS_INFO");
    expect(missing.result?.expectedCents).toBeNull();
    expect(
      (await client.query(api.cases.detail, { id: missing._id })).questions[0]
        .requiredRole,
    ).toBe("travel_coordinator");
  });
  it("is idempotent, keeps the three environments separate, and archives only the chosen reset generation", async () => {
    const { t, client, s } = await seeded("demo");
    assert(s.sandbox);
    const original = s.cases.map((c) => c._id);
    const bankBefore = await t.run((ctx) =>
      ctx.db
        .query("bankRecords")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", s.sandbox!._id))
        .collect(),
    );
    await client.mutation(api.datasets.select, { dataset: "demo" });
    await client.mutation(api.workspace.initialize, {});
    expect(
      (await client.query(api.workspace.snapshot, {}))?.cases.map((c) => c._id),
    ).toEqual(original);
    const bankAfter = await t.run((ctx) =>
      ctx.db
        .query("bankRecords")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", s.sandbox!._id))
        .collect(),
    );
    expect(bankAfter).toEqual(bankBefore);
    await client.mutation(api.datasets.select, { dataset: "history" });
    const history = await client.query(api.workspace.snapshot, {});
    assert(history?.sandbox);
    expect(history.cases).toHaveLength(8);
    await client.mutation(api.datasets.select, { dataset: "evaluation" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await client.query(api.workspace.snapshot, {}))?.cases,
    ).toHaveLength(6);
    await client.mutation(api.datasets.select, { dataset: "demo" });
    expect(
      (await client.query(api.workspace.snapshot, {}))?.cases.map((c) => c._id),
    ).toEqual(original);
    await client.mutation(api.workspace.reset, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const reset = await client.query(api.workspace.snapshot, {});
    assert(reset?.sandbox);
    expect(reset.sandbox.dataset).toBe("demo");
    expect(reset.cases).toHaveLength(3);
    expect(reset.cases.map((c) => c._id)).not.toEqual(original);
    expect((await t.run((ctx) => ctx.db.get(s.sandbox!._id)))?.archived).toBe(
      true,
    );
    expect(
      (await t.run((ctx) => ctx.db.get(history.sandbox!._id)))?.archived,
    ).toBe(false);
    expect(
      (await t.run((ctx) => ctx.db.get(original[0])))?.input.code,
    ).toBeDefined();
  });
  it("loads connected historical decisions without claiming fresh agent execution", async () => {
    const { t, client, s } = await seeded("history");
    expect(s.cases).toHaveLength(8);
    expect(new Set(s.cases.map((c) => c.input.vendorId)).size).toBe(4);
    expect(new Set(s.cases.map((c) => c.input.contractId)).size).toBe(4);
    expect(s.cases.some((c) => c.state === "REJECTED")).toBe(true);
    expect(s.cases.some((c) => c.state === "APPROVED")).toBe(true);
    expect(s.cases.some((c) => c.state === "NEEDS_INFO")).toBe(true);
    expect(s.journals).toHaveLength(5);
    for (const c of s.cases) {
      const d = await client.query(api.cases.detail, { id: c._id });
      expect(d.subtasks).toHaveLength(0);
      expect(d.runs).toHaveLength(0);
      expect(c.phase).toContain("Synthetic history");
      expect(c.input.invoiceDate < "2026-10-25").toBe(true);
      expect(d.approvals).toHaveLength(1);
      expect(
        d.audit.some(
          (a) =>
            a.action === "synthetic_historical_decision" &&
            a.timestamp > Date.parse(c.input.invoiceDate),
        ),
      ).toBe(true);
      expect(d.proposals[0].proposedBy).not.toBe(d.approvals[0].actor);
    }
    const oldCount = s.audit.length;
    await client.mutation(api.datasets.select, { dataset: "history" });
    expect(
      (await client.query(api.workspace.snapshot, {}))?.audit,
    ).toHaveLength(oldCount);
    const charter = s.cases.find((c) => c.input.code === "HIST-AIR-002");
    expect(charter?.result?.expectedCents).toBe(2640000);
    const cancel = s.cases.find((c) => c.input.code === "HIST-HAR-002");
    expect(cancel?.result?.expectedCents).toBe(350000);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("bankRecords")
          .withIndex("by_sandboxId", (q) => q.eq("sandboxId", s.sandbox!._id))
          .collect(),
      ),
    ).toHaveLength(2);
  });
  it("refuses production-like targets and auditor mutations without altering the active dataset", async () => {
    const { client, s } = await seeded("demo");
    await client.mutation(api.workspace.setRole, { role: "internal_auditor" });
    expect(
      (await client.mutation(api.datasets.select, { dataset: "history" })).ok,
    ).toBe(false);
    expect((await client.query(api.workspace.snapshot, {}))?.sandbox?._id).toBe(
      s.sandbox?._id,
    );
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production.convex.cloud");
    await expect(
      client.mutation(api.datasets.select, { dataset: "demo", reset: true }),
    ).rejects.toThrow("local development");
  });
  it("retains valid references, source dates and safe integer money in every fixture", () => {
    for (const name of ["demo", "history", "evaluation"] as const) {
      const fixtures = datasetCases(name);
      expect(new Set(fixtures.map((f) => f.input.code)).size).toBe(
        fixtures.length,
      );
      for (const f of fixtures) {
        const input = inputSchema.parse(f.input);
        expect(new Set(input.sources.map((s) => s.id)).size).toBe(
          input.sources.length,
        );
        expect(
          input.sources.some(
            (s) => s.id === input.contractId && s.kind === "contract",
          ),
        ).toBe(true);
        expect(
          input.sources.some(
            (s) => s.id === input.code && s.kind === "invoice",
          ),
        ).toBe(true);
        for (const term of input.terms) {
          expect(input.sources.some((s) => s.id === term.sourceId)).toBe(true);
          expect(term.contractId).toBe(input.contractId);
          expect(term.vendorId).toBe(input.vendorId);
          expect(Number.isSafeInteger(term.quantity * term.rateCents)).toBe(
            true,
          );
        }
        expect(input.sources.every((s) => s.date <= input.invoiceDate)).toBe(
          true,
        );
        for (const bank of f.bank) {
          expect(
            input.sources.some(
              (s) => s.id === bank.sourceId && s.date === bank.paidAt,
            ),
          ).toBe(true);
          expect(bank.contractId).toBe(input.contractId);
        }
        for (const credit of f.credits) {
          expect(
            f.bank.some((b) => b.transactionId === credit.transactionId),
          ).toBe(true);
          expect(credit.invoiceCode).toBe(input.code);
        }
      }
    }
  });
});
describe("Six adversarial evaluations — deterministic backend, no LLM", () => {
  for (const answer of datasetAnswers)
    it(`${answer.code}: ${answer.authorization}`, async () => {
      const { client, s } = await seeded("evaluation");
      const c = s.cases.find((c) => c.input.code === answer.code);
      assert(c);
      expect(c.result?.expectedCents).toBe(answer.expectedCents);
      expect(c.result?.differenceCents).toBe(answer.differenceCents);
      expect(c.state).toBe(answer.state);
      for (const sourceId of answer.evidence)
        expect(c.result?.evidenceIds).toContain(sourceId);
      if (answer.authorization === "agent_denied_and_audited") {
        const receipt = await client.mutation(api.cases.demonstrateDenial, {
          id: c._id,
          action: "approve",
        });
        expect(receipt.ok).toBe(false);
        const detail = await client.query(api.cases.detail, { id: c._id });
        expect(detail.approvals).toHaveLength(0);
        expect(
          detail.audit.some(
            (a) =>
              a.action === "agent_approve_denied" &&
              !a.allowed &&
              a.actor === "attest-investigator",
          ),
        ).toBe(true);
      }
      const fixture = datasetCases("evaluation").find(
        (f) => f.input.code === answer.code,
      )!;
      const unit = applySettlement(
        fixture.input,
        reconcile(fixture.input),
        paymentFinding(fixture.input, fixture.bank, fixture.credits),
      );
      expect(unit.expectedCents).toBe(answer.expectedCents);
    });
});
