/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { hotelFixture } from "../src/lib/simulation/fixtures";
import {
  compareProcedures,
  simulateLearning,
  validatePolicyOutput,
  type LearningContext,
} from "../src/lib/finance/learning";
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const client = t.withIdentity({
    subject: "learning",
    issuer: "https://test.local",
    tokenIdentifier: "test|learning",
  });
  await client.mutation(api.workspace.initialize, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await client.mutation(api.workspace.setRole, { role: "human_controller" });
  await client.mutation(api.policies.propose, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const snapshot = (await client.query(api.workspace.snapshot, {}))!;
  const baseline = snapshot.policies.find((p) => p.status === "candidate")!;
  expect(
    (await client.mutation(api.policies.activate, { id: baseline._id })).ok,
  ).toBe(true);
  const input = hotelFixture("LEARN-TEST");
  input.sources[1].title = "Block extension · signed room schedule";
  const id = await client.mutation(api.workspace.inject, { input });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return {
    t,
    client,
    id,
    input,
    baseline,
    sandboxId: snapshot.profile.sandboxId,
  };
}
async function corrected(s: Awaited<ReturnType<typeof setup>>) {
  expect(
    (
      await s.client.mutation(api.cases.resume, {
        id: s.id,
        answer: "Existing signed amendment separates room groups.",
        evidence: "note",
        correction: {
          kind: "overlooked_signed_schedule",
          sourceIds: ["AMD-HOTEL-001"],
        },
      })
    ).ok,
  ).toBe(true);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  return await s.client.query(api.cases.detail, { id: s.id });
}
async function accepted(s: Awaited<ReturnType<typeof setup>>) {
  const d = await corrected(s);
  expect(
    (
      await s.client.mutation(api.cases.review, {
        id: s.id,
        proposalId: d.case.proposalId!,
        operation: "approve",
        reason: "Accepted validated correction",
      })
    ).ok,
  ).toBe(true);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const snap = (await s.client.query(api.workspace.snapshot, {}))!;
  return {
    detail: d,
    job: snap.policyRuns.find((j) => j.correctionId)!,
    candidate: snap.policies.find((p) => p.status === "candidate")!,
  };
}
it("captures immutable evidence, waits for acceptance, deduplicates callbacks and jobs, then uses the evaluated version", async () => {
  const s = await setup();
  const d = await corrected(s);
  expect(d.corrections).toHaveLength(1);
  expect(
    (
      await s.client.mutation(api.cases.resume, {
        id: s.id,
        answer: "Duplicate response",
        evidence: "note",
        correction: {
          kind: "overlooked_signed_schedule",
          sourceIds: ["AMD-HOTEL-001"],
        },
      })
    ).ok,
  ).toBe(false);
  const duplicate = await s.client.query(api.cases.detail, { id: s.id });
  expect(duplicate.corrections).toHaveLength(1);
  expect(
    duplicate.audit.some(
      (a) => a.action === "correction_recording_denied" && !a.allowed,
    ),
  ).toBe(true);
  expect(
    d.corrections[0].originalInput.sources.some((x) =>
      x.id.startsWith("CONFIRM"),
    ),
  ).toBe(false);
  expect(
    (await s.client.query(api.workspace.snapshot, {}))!.policyRuns.filter(
      (j) => j.correctionId,
    ),
  ).toHaveLength(0);
  expect(
    (await s.client.mutation(api.policies.propose, { caseId: s.id })).ok,
  ).toBe(false);
  await s.client.mutation(api.cases.review, {
    id: s.id,
    proposalId: d.case.proposalId!,
    operation: "approve",
    reason: "Accepted",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const approved = await s.client.query(api.cases.detail, { id: s.id });
  await s.t.mutation(internal.corrections.accept, {
    proposalId: d.case.proposalId!,
    approvalId: approved.approvals[0]._id,
  });
  await s.client.mutation(api.policies.propose, { caseId: s.id });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const snapshot = (await s.client.query(api.workspace.snapshot, {}))!;
  expect(snapshot.policyRuns.filter((j) => j.correctionId)).toHaveLength(1);
  expect(snapshot.precedents.filter((p) => p.correctionId)).toHaveLength(1);
  const candidate = snapshot.policies.find((p) => p.status === "candidate")!;
  const packet = await s.client.query(api.policies.detail, {
    id: candidate._id,
  });
  expect(packet.evaluation?.report.improved).toBeGreaterThan(0);
  expect(packet.evaluation?.report.regressed).toBe(0);
  expect(packet.correction).toEqual(d.corrections[0]);
  expect(approved.journals).toHaveLength(0);
  expect(
    (await s.client.mutation(api.policies.activate, { id: candidate._id })).ok,
  ).toBe(true);
  const input = hotelFixture("LEARN-NEXT");
  input.sources[1].title = s.input.sources[1].title;
  const next = await s.client.mutation(api.workspace.inject, { input });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = await s.client.query(api.cases.detail, { id: next });
  expect(after.case.state).toBe("PROPOSED");
  expect(after.case.policyId).toBe(candidate._id);
  expect(after.proposals[0].result.expectedCents).toBe(1250000);
  expect(
    (await s.client.query(api.policies.detail, { id: candidate._id })).usage,
  ).toHaveLength(1);
});
it.each(["analyst", "unsigned", "invented", "unrelated", "new evidence"])(
  "does not learn from an invalid correction: %s",
  async (kind) => {
    const s = await setup();
    if (kind === "analyst")
      await s.client.mutation(api.workspace.setRole, {
        role: "human_accountant",
      });
    if (kind === "unsigned" || kind === "unrelated")
      await s.t.run(async (ctx) => {
        const c = (await ctx.db.get(s.id))!;
        const original = (await ctx.db.get(c.proposalId!))!;
        const input = structuredClone(original.input);
        if (kind === "unsigned") input.sources[1].signed = false;
        else input.vendorId = "OTHER";
        await ctx.db.patch(original._id, { input });
      });
    const result = await s.client.mutation(api.cases.resume, {
      id: s.id,
      answer: "Use the schedule",
      evidence: kind === "new evidence" ? "signed_amendment" : "note",
      correction: {
        kind: "overlooked_signed_schedule",
        sourceIds: [kind === "invented" ? "NO-SOURCE" : "AMD-HOTEL-001"],
      },
    });
    expect(result.ok).toBe(false);
    const d = await s.client.query(api.cases.detail, { id: s.id });
    expect(d.corrections).toHaveLength(0);
    expect(
      d.audit.some(
        (a) => a.action === "correction_recording_denied" && !a.allowed,
      ),
    ).toBe(true);
  },
);
it("ordinary notes and rejected corrections never become learning precedents", async () => {
  const s = await setup();
  const d = await corrected(s);
  await s.client.mutation(api.cases.review, {
    id: s.id,
    proposalId: d.case.proposalId!,
    operation: "reject",
    reason: "Correction not accepted",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await s.client.mutation(api.policies.propose, { caseId: s.id })).ok,
  ).toBe(false);
  const snapshot = (await s.client.query(api.workspace.snapshot, {}))!;
  expect(snapshot.precedents.some((p) => p.correctionId)).toBe(false);
});
it("missing learner credentials fail learning without undoing the accepted case or using the invoice agent", async () => {
  const s = await setup();
  vi.stubEnv("CREAO_POLICY_AGENT_ID", "");
  vi.stubEnv("CREAO_POLICY_API_KEY", "");
  vi.stubEnv("CREAO_API_KEY", "capi_invoice");
  vi.stubEnv("CREAO_AGENT_ID", "invoice-only");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const d = await corrected(s);
  await s.t.run((ctx) => ctx.db.patch(s.sandboxId, { mode: "creao" }));
  await s.client.mutation(api.cases.review, {
    id: s.id,
    proposalId: d.case.proposalId!,
    operation: "approve",
    reason: "Accepted",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fetch).not.toHaveBeenCalled();
  expect(
    (await s.client.query(api.cases.detail, { id: s.id })).case.state,
  ).toBe("APPROVED");
  const snapshot = (await s.client.query(api.workspace.snapshot, {}))!;
  expect(snapshot.policyRuns.find((j) => j.correctionId)?.error).toContain(
    "not configured",
  );
});
it("denies another sandbox and analyst activation without losing denial audits", async () => {
  const s = await setup();
  const { candidate } = await accepted(s);
  const outsider = s.t.withIdentity({
    tokenIdentifier: "test|outsider",
    subject: "outsider",
  });
  await outsider.mutation(api.workspace.initialize, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  await expect(
    outsider.query(api.policies.detail, { id: candidate._id }),
  ).rejects.toThrow("not found");
  expect(
    (await outsider.mutation(api.policies.activate, { id: candidate._id })).ok,
  ).toBe(false);
  expect(
    (await outsider.query(api.workspace.snapshot, {}))!.audit.some(
      (a) => a.action === "policy_activation_denied" && !a.allowed,
    ),
  ).toBe(true);
  await s.client.mutation(api.workspace.setRole, { role: "human_accountant" });
  expect(
    (await s.client.mutation(api.policies.activate, { id: candidate._id })).ok,
  ).toBe(false);
  expect(
    (await s.client.query(api.workspace.snapshot, {}))!.audit.some(
      (a) => a.action === "policy_activation_denied" && !a.allowed,
    ),
  ).toBe(true);
});
it("blocks stale evidence, retains old evaluation, and requires new review after reevaluation", async () => {
  const s = await setup();
  const { candidate } = await accepted(s);
  await s.t.run(async (ctx) => {
    const p = (
      await ctx.db
        .query("precedents")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", s.sandboxId))
        .take(1)
    )[0];
    await ctx.db.patch(p._id, { explanation: "Changed supporting evidence" });
  });
  expect(
    (await s.client.mutation(api.policies.activate, { id: candidate._id })).ok,
  ).toBe(false);
  expect(
    (await s.client.mutation(api.policies.reevaluate, { id: candidate._id }))
      .ok,
  ).toBe(false);
  expect(
    (await s.client.query(api.policies.detail, { id: candidate._id })).policy
      .status,
  ).toBe("candidate");
});
it("serializes concurrent activation and preserves the policy used by an in-flight investigation", async () => {
  const s = await setup();
  const { candidate } = await accepted(s);
  const input = hotelFixture("IN-FLIGHT");
  input.sources[1].title = s.input.sources[1].title;
  const id = await s.t.run((ctx) =>
    ctx.db.insert("cases", {
      sandboxId: s.sandboxId,
      input,
      revision: 1,
      state: "NEW",
      phase: "test",
      mode: "deterministic",
      updatedAt: Date.now(),
      attempt: 0,
    }),
  );
  await s.t.mutation(internal.investigations.begin, { caseId: id });
  const results = await Promise.all([
    s.client.mutation(api.policies.activate, { id: candidate._id }),
    s.client.mutation(api.policies.activate, { id: candidate._id }),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  await s.t.mutation(internal.investigations.complete, {
    caseId: id,
    attempt: 1,
    revision: 1,
  });
  const old = await s.client.query(api.cases.detail, { id });
  expect(old.case.policyId).toBe(s.baseline._id);
  expect(old.case.state).toBe("NEEDS_INFO");
});
it("rejects unevaluated legacy candidates and supports candidate rejection", async () => {
  const s = await setup();
  const { candidate } = await accepted(s);
  await s.t.run((ctx) =>
    ctx.db.patch(candidate._id, { evaluationId: undefined }),
  );
  expect(
    (await s.client.mutation(api.policies.activate, { id: candidate._id })).ok,
  ).toBe(false);
  expect(
    (
      await s.client.mutation(api.policies.reject, {
        id: candidate._id,
        reason: "Need more evidence",
      })
    ).ok,
  ).toBe(true);
  expect(
    (await s.client.query(api.policies.detail, { id: candidate._id })).policy
      .rejectionReason,
  ).toBe("Need more evidence");
});
it("stores safe abstentions without manufacturing candidates", async () => {
  const s = await setup();
  await s.client.mutation(api.policies.propose, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const snapshot = (await s.client.query(api.workspace.snapshot, {}))!;
  expect(snapshot.policyRuns[0].outcome).toBe("no_change");
  expect(
    snapshot.policies.filter((p) => p.status === "candidate"),
  ).toHaveLength(0);
});
it("compares financial, missing-signature, date, supersession, injection, and vendor scenarios", () => {
  const report = compareProcedures(
    "controller_confirmation",
    "signed_schedule_first",
    true,
  );
  expect(report.passed).toBe(true);
  expect(report.sampleCount).toBe(7);
  expect(report.regressed).toBe(0);
  expect(
    report.rows.find((r) => r.name === "Superseding amendment")?.observedCents,
  ).toBe(1325000);
  expect(
    report.rows.find((r) => r.name === "Missing signature")?.candidateNeedsInfo,
  ).toBe(true);
  expect(
    compareProcedures("signed_schedule_first", "controller_confirmation", true)
      .passed,
  ).toBe(false);
});
it("validates abstention and exact citations without array coercion or hidden fields", () => {
  const ctx: LearningContext = {
    schemaVersion: 1,
    vendorId: "VEN-MERIDIAN",
    currentPolicy: null,
    precedents: [],
    corrections: [],
  };
  const out = simulateLearning(ctx);
  expect(out.outcome).toBe("insufficient_evidence");
  expect(validatePolicyOutput(out, ctx)).toEqual(out);
  expect(() =>
    validatePolicyOutput({ ...out, precedentCodes: "[]" }, ctx),
  ).toThrow();
  expect(() =>
    validatePolicyOutput({ ...out, permissions: "approve" }, ctx),
  ).toThrow();
  expect(() =>
    validatePolicyOutput({ ...out, precedentCodes: ["UNKNOWN"] }, ctx),
  ).toThrow();
});

it("does not resubmit uncertain requests and safely deduplicates explicit retries of terminal failures", async () => {
  const s = await setup();
  const { job } = await accepted(s);
  await s.t.run((ctx) =>
    ctx.db.patch(job._id, {
      status: "failed",
      submissionStatus: "submission_pending",
      runId: undefined,
    }),
  );
  expect(
    (await s.client.mutation(api.policies.retry, { jobId: job._id })).ok,
  ).toBe(false);
  await s.t.run((ctx) =>
    ctx.db.patch(job._id, {
      submissionStatus: "completed",
      runId: "known-terminal",
      raw: "retained original output",
    }),
  );
  await s.client.mutation(api.policies.retry, { jobId: job._id });
  await s.client.mutation(api.policies.retry, { jobId: job._id });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const snap = (await s.client.query(api.workspace.snapshot, {}))!;
  expect(snap.policyRuns.filter((j) => j.retryOf === job._id)).toHaveLength(1);
  expect(snap.policyRuns.find((j) => j._id === job._id)?.raw).toBe(
    "retained original output",
  );
});
it("a plain retry answer cannot create an eligible correction", async () => {
  const s = await setup();
  await s.client.mutation(api.cases.resume, {
    id: s.id,
    answer: "Retry",
    evidence: "note",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await s.client.query(api.cases.detail, { id: s.id })).corrections,
  ).toHaveLength(0);
  expect(
    (await s.client.mutation(api.policies.propose, { caseId: s.id })).ok,
  ).toBe(false);
});
it("rejects changed baseline then stores a new comparison without auto-activating", async () => {
  const s = await setup();
  const { candidate } = await accepted(s);
  const before = await s.client.query(api.policies.detail, {
    id: candidate._id,
  });
  await s.t.run((ctx) =>
    ctx.db.patch(s.baseline._id, {
      description: "Updated baseline explanation",
    }),
  );
  expect(
    (await s.client.mutation(api.policies.activate, { id: candidate._id })).ok,
  ).toBe(false);
  expect(
    (await s.client.mutation(api.policies.reevaluate, { id: candidate._id }))
      .ok,
  ).toBe(true);
  const after = await s.client.query(api.policies.detail, {
    id: candidate._id,
  });
  expect(after.evaluation?._id).not.toBe(before.evaluation?._id);
  expect(after.policy.status).toBe("candidate");
  expect(
    await s.t.run((ctx) => ctx.db.get(before.evaluation!._id)),
  ).not.toBeNull();
  expect(
    (await s.client.mutation(api.policies.activate, { id: candidate._id })).ok,
  ).toBe(true);
});

it("retains denial audits when the accepted correction is withdrawn", async () => {
  const s = await setup();
  const { candidate, job } = await accepted(s);
  await s.t.run(async (ctx) => {
    const precedent = await ctx.db
      .query("precedents")
      .withIndex("by_correctionId", (q) =>
        q.eq("correctionId", job.correctionId!),
      )
      .unique();
    await ctx.db.patch(precedent!._id, { active: false });
    await ctx.db.patch(job._id, {
      status: "failed",
      submissionStatus: "completed",
    });
  });
  expect(
    (await s.client.mutation(api.policies.activate, { id: candidate._id })).ok,
  ).toBe(false);
  expect(
    (await s.client.mutation(api.policies.reevaluate, { id: candidate._id }))
      .ok,
  ).toBe(false);
  expect(
    (await s.client.mutation(api.policies.retry, { jobId: job._id })).ok,
  ).toBe(false);
  const snap = (await s.client.query(api.workspace.snapshot, {}))!;
  for (const action of [
    "policy_activation_denied",
    "policy_evaluation_denied",
    "learning_retry_denied",
  ])
    expect(snap.audit.some((a) => a.action === action && !a.allowed)).toBe(
      true,
    );
});
it("uses independent citation codes, excludes database metadata, and supplies expired counterexamples without citing them", async () => {
  const s = await setup();
  const { job, detail } = await accepted(s);
  const context: LearningContext = JSON.parse(job.contextJson!);
  expect(context.corrections[0].code).not.toContain(s.id);
  expect(job.contextJson).not.toContain(detail.corrections[0]._id);
  expect(
    context.precedents.some((p) => !p.active && p.code === "HIST-MER-099"),
  ).toBe(true);
  expect(simulateLearning(context).precedentCodes).not.toContain(
    "HIST-MER-099",
  );
  expect(() =>
    validatePolicyOutput(
      {
        ...simulateLearning(context),
        precedentCodes: ["HIST-MER-101", "HIST-MER-099"],
      },
      context,
    ),
  ).toThrow("unavailable");
});
