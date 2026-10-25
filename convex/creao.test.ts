/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import { hotelFixture } from "../src/lib/simulation/fixtures";
import { reconcile } from "../src/lib/finance/engine";
import { historicalPrecedents } from "../src/lib/simulation/fixtures";
const modules = import.meta.glob("./**/*.ts");
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("CREAO_API_KEY", "capi_test_only");
  vi.stubEnv("CREAO_AGENT_ID", "saved-agent-test");
  vi.stubEnv("CREAO_POLICY_AGENT_ID", "policy-agent-test");
  vi.stubEnv("CREAO_POLICY_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const sandboxId = await ctx.db.insert("sandboxes", {
      owner: "test",
      generation: 1,
      mode: "creao",
      archived: false,
      createdAt: Date.now(),
    });
    const caseId = await ctx.db.insert("cases", {
      sandboxId,
      input: hotelFixture(),
      revision: 1,
      state: "INVESTIGATING",
      phase: "test",
      mode: "creao",
      updatedAt: Date.now(),
      attempt: 1,
    });
    const jobId = await ctx.db.insert("policyRuns", {
      sandboxId,
      mode: "creao",
      contextJson: JSON.stringify({
        schemaVersion: 1,
        vendorId: "VEN-MERIDIAN",
        currentPolicy: null,
        precedents: historicalPrecedents
          .filter((p) => p.active)
          .map((p) => ({ ...p, synthetic: true })),
        corrections: [],
      }),
      status: "running",
      createdAt: Date.now(),
    });
    return { caseId, jobId };
  });
  return { t, ...ids };
}
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
it("uses the v1 endpoint, capi authorization, appId and the saved prompt input", async () => {
  const { t, caseId, jobId } = await setup();
  fetchMock.mockImplementation(async () =>
    reply({ id: "run-1", status: "pending" }, 202),
  );
  const context = {
    input: hotelFixture(),
    responses: [{ answer: "Review signed scope" }],
  };
  expect(
    await t.action(internal.creao.submit, { caseId, attempt: 1, context }),
  ).toBe("run-1");
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://agent.creao.ai/api/v1/runs");
  expect(options?.method).toBe("POST");
  expect(options?.headers).toMatchObject({
    Authorization: "Bearer capi_test_only",
  });
  const body = JSON.parse(String(options?.body));
  expect(body.appId).toBe("saved-agent-test");
  expect(Object.keys(body.inputs)).toEqual(["prompt"]);
  expect(JSON.parse(body.inputs.prompt).context).toEqual(context);
  expect(body).not.toHaveProperty("agent_id");
  expect(body).not.toHaveProperty("input");
  const saved = await t.run((ctx) => ctx.db.get(caseId));
  expect(saved?.runId).toBe("run-1");
});
it("uses the same idempotency key for a repeated submission and a different key for a new attempt", async () => {
  const { t, caseId, jobId } = await setup();
  fetchMock.mockImplementation(async () =>
    reply({ id: "run-1", status: "pending" }, 202),
  );
  for (const attempt of [1, 1, 2])
    await t.action(internal.creao.submit, { caseId, attempt, context: {} });
  const keys = fetchMock.mock.calls.map(
    ([, o]) => JSON.parse(String(o?.body)).idempotencyKey,
  );
  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).not.toBe(keys[0]);
  expect(keys[0].length).toBeLessThanOrEqual(128);
});
it.each([false, true])(
  "reads result.text (resultJson wrapper: %s) and passes financial validation",
  async (wrapped) => {
    const { t, caseId, jobId } = await setup();
    const input = hotelFixture(),
      r = reconcile(input);
    const output = {
      invoiceId: input.code,
      disposition: "disputed",
      termIds: r.cohorts.map((c) => c.termId),
      evidenceIds: r.evidenceIds,
      explanation: "Signed terms preserve original rates.",
      missingEvidence: [],
    };
    fetchMock.mockResolvedValue(
      reply({
        id: "run-1",
        status: "completed",
        result: {
          text: JSON.stringify(
            wrapped
              ? { invoiceId: input.code, resultJson: JSON.stringify(output) }
              : output,
          ),
          chatText: "Other conversation text",
        },
      }),
    );
    const response = await t.action(internal.creao.poll, {
      caseId,
      attempt: 1,
      runId: "run-1",
    });
    expect(response.output).toEqual(output);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://agent.creao.ai/api/v1/runs/run-1",
    );
    const complete = await t.mutation(internal.investigations.complete, {
      caseId,
      attempt: 1,
      revision: 1,
      raw: response.output,
    });
    expect(complete.expectedCents).toBe(1250000);
    expect(complete.differenceCents).toBe(75000);
  },
);
it.each(["not JSON", "[]", "null", "", null])(
  "rejects an invalid resultJson wrapper (%s) without chat fallback",
  async (resultJson) => {
    const { t, jobId } = await setup();
    fetchMock.mockResolvedValue(
      reply({
        status: "completed",
        result: {
          text: JSON.stringify({ resultJson }),
          chatText: '{"description":"fallback"}',
        },
      }),
    );
    await expect(
      t.action(internal.creao.pollPolicy, { jobId, runId: "policy-run" }),
    ).rejects.toThrow();
  },
);
it.each(["string arrays", "invented evidence"])(
  "still rejects wrapped interpretations with %s",
  async (invalid) => {
    const { t, caseId, jobId } = await setup();
    const input = hotelFixture();
    const r = reconcile(input);
    const output = {
      invoiceId: input.code,
      disposition: "disputed",
      termIds:
        invalid === "string arrays"
          ? JSON.stringify(r.cohorts.map((c) => c.termId))
          : r.cohorts.map((c) => c.termId),
      evidenceIds:
        invalid === "invented evidence"
          ? [...r.evidenceIds, "NONEXISTENT"]
          : r.evidenceIds,
      explanation: "Signed terms preserve original rates.",
      missingEvidence: [],
    };
    fetchMock.mockResolvedValue(
      reply({
        status: "completed",
        result: {
          text: JSON.stringify({ resultJson: JSON.stringify(output) }),
        },
      }),
    );
    const response = await t.action(internal.creao.poll, {
      caseId,
      attempt: 1,
      runId: "run-1",
    });
    await expect(
      t.mutation(internal.investigations.complete, {
        caseId,
        attempt: 1,
        revision: 1,
        raw: response.output,
      }),
    ).rejects.toThrow();
    expect(
      (await t.run((ctx) => ctx.db.get(caseId)))?.proposalId,
    ).toBeUndefined();
  },
);
it("accepts chatText when the completed result has no text", async () => {
  const { t, jobId } = await setup();
  fetchMock.mockResolvedValue(
    reply({
      status: "completed",
      result: { chatText: '{"description":"policy"}' },
    }),
  );
  expect(
    (await t.action(internal.creao.pollPolicy, { jobId, runId: "policy-run" }))
      .output,
  ).toEqual({ description: "policy" });
});
it("does not parse an incomplete result while polling", async () => {
  const { t, caseId, jobId } = await setup();
  fetchMock.mockImplementation(async () =>
    reply({ status: "running", result: { text: "not finished" } }),
  );
  expect(
    (
      await t.action(internal.creao.poll, {
        caseId,
        attempt: 1,
        runId: "run-1",
      })
    ).done,
  ).toBe(false);
  expect(
    (await t.action(internal.creao.pollPolicy, { jobId, runId: "policy-run" }))
      .done,
  ).toBe(false);
});
it.each(["failed", "cancelled"])(
  "surfaces a %s provider run without a financial result",
  async (status) => {
    const { t, caseId, jobId } = await setup();
    fetchMock.mockResolvedValue(reply({ status }));
    await expect(
      t.action(internal.creao.poll, { caseId, attempt: 1, runId: "run-1" }),
    ).rejects.toThrow(status);
  },
);
it("refuses malformed JSON and records the original response for diagnosis", async () => {
  const { t, caseId, jobId } = await setup();
  fetchMock.mockResolvedValue(
    reply({ status: "completed", result: { text: "Here is your answer: {}" } }),
  );
  await expect(
    t.action(internal.creao.poll, { caseId, attempt: 1, runId: "run-1" }),
  ).rejects.toThrow();
  const runs = await t.run((ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .take(1),
  );
  expect(runs[0].raw).toContain("Here is your answer");
});
it("submits policy requests with the same prompt contract and a stable job key", async () => {
  const { t, jobId } = await setup();
  fetchMock.mockResolvedValue(
    reply({ id: "policy-run", status: "pending" }, 202),
  );
  await t.action(internal.creao.submitPolicy, {
    jobId,
    context: { schemaVersion: 1, currentPolicy: null },
  });
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body.appId).toBe("policy-agent-test");
  expect(JSON.parse(body.inputs.prompt).task).toBe("policy_learning");
  expect(JSON.parse(body.inputs.prompt).context.currentPolicy).toBeNull();
  expect(body.idempotencyKey).toBe(`attest-policy:${jobId}`);
});
it("sends unambiguous precedent codes and validates live policy citations before creating a candidate", async () => {
  const { t, jobId } = await setup();
  const databaseIds = await t.run(async (ctx) => {
    const job = (await ctx.db.get(jobId))!;
    return Promise.all(
      historicalPrecedents.map((p) =>
        ctx.db.insert("precedents", { ...p, sandboxId: job.sandboxId }),
      ),
    );
  });
  const context = await t.query(internal.policies.context, { jobId });
  expect(
    context.context.precedents.map((p: { code: string }) => p.code),
  ).toEqual(["HIST-MER-101", "HIST-MER-102"]);
  expect(JSON.stringify(context)).not.toMatch(/_id|sandboxId|_creationTime/);
  const output = {
    schemaVersion: 1,
    outcome: "candidate",
    vendorId: "VEN-MERIDIAN",
    correctionCodes: [],
    procedure: "controller_confirmation",
    description:
      "Require controller confirmation of signed original and added room groups.",
    precedentCodes: databaseIds.slice(0, 2).map(String),
  };
  await t.mutation(internal.policies.finish, {
    jobId,
    raw: output,
    runId: "policy-run",
  });
  expect((await t.run((ctx) => ctx.db.get(jobId)))?.error).toContain(
    "unavailable",
  );
  expect((await t.run((ctx) => ctx.db.get(jobId)))?.policyId).toBeUndefined();
  const validJobId = await t.run(async (ctx) => {
    const old = (await ctx.db.get(jobId))!;
    return ctx.db.insert("policyRuns", {
      sandboxId: old.sandboxId,
      mode: "creao",
      status: "running",
      contextJson: old.contextJson,
      createdAt: Date.now(),
    });
  });
  output.precedentCodes = context.context.precedents.map(
    (p: { code: string }) => p.code,
  );
  fetchMock.mockResolvedValue(
    reply({
      status: "completed",
      result: { text: JSON.stringify({ resultJson: JSON.stringify(output) }) },
    }),
  );
  const response = await t.action(internal.creao.pollPolicy, {
    jobId: validJobId,
    runId: "policy-run",
  });
  await t.mutation(internal.policies.finish, {
    jobId: validJobId,
    raw: response.output,
    runId: "policy-run",
  });
  const candidate = await t.run(async (ctx) => {
    const job = (await ctx.db.get(validJobId))!;
    return ctx.db.get(job.policyId!);
  });
  expect(candidate?.status).toBe("candidate");
  expect(candidate?.approvedBy).toBeUndefined();
  expect(candidate?.checks.every((c) => c.passed)).toBe(true);
  expect(candidate?.precedentIds).toEqual(["HIST-MER-101", "HIST-MER-102"]);
});
it("distinguishes HTTP rejection from an uncertain submission without exposing a response body", async () => {
  const { t, caseId, jobId } = await setup();
  fetchMock.mockResolvedValue(reply({ error: "secret provider body" }, 401));
  await expect(
    t.action(internal.creao.submit, { caseId, attempt: 1, context: {} }),
  ).rejects.toThrow("HTTP 401");
  const runs = await t.run((ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .take(1),
  );
  expect(runs[0].status).toBe("submission_rejected");
});
it("rejects a non-capi key before creating a submission record", async () => {
  const { t, caseId, jobId } = await setup();
  vi.stubEnv("CREAO_API_KEY", "wrong-api-key");
  await expect(
    t.action(internal.creao.submit, { caseId, attempt: 1, context: {} }),
  ).rejects.toThrow("capi_");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("runs")
        .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
        .take(1),
    ),
  ).toHaveLength(0);
});

it("uses the separate policy key without changing invoice authorization", async () => {
  const { t, jobId, caseId } = await setup();
  vi.stubEnv("CREAO_POLICY_API_KEY", "capi_policy_only");
  fetchMock.mockImplementation(async () =>
    reply({ id: "run-key", status: "pending" }),
  );
  await t.action(internal.creao.submitPolicy, { jobId, context: {} });
  await t.action(internal.creao.submit, { caseId, attempt: 1, context: {} });
  expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
    Authorization: "Bearer capi_policy_only",
  });
  expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
    Authorization: "Bearer capi_test_only",
  });
});
it("records ambiguous policy submission before a network failure", async () => {
  const { t, jobId } = await setup();
  fetchMock.mockRejectedValue(new Error("network timeout"));
  await expect(
    t.action(internal.creao.submitPolicy, { jobId, context: {} }),
  ).rejects.toThrow("timeout");
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.submissionStatus).toBe("submission_pending");
  expect(job?.runId).toBeUndefined();
});
it("retains malformed raw policy responses for diagnosis", async () => {
  const { t, jobId } = await setup();
  fetchMock.mockResolvedValue(
    reply({ status: "completed", result: { text: "broken policy output" } }),
  );
  await expect(
    t.action(internal.creao.pollPolicy, { jobId, runId: "raw-run" }),
  ).rejects.toThrow();
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.raw).toContain("broken policy output");
  expect(job?.runId).toBe("raw-run");
});

it("rejects extra fields in the policy scalar envelope while retaining the raw response", async () => {
  const { t, jobId } = await setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        reply({
          status: "completed",
          result: {
            text: JSON.stringify({ resultJson: "{}", unexpected: "ignored" }),
          },
        }),
      ),
  );
  await expect(
    t.action(internal.creao.pollPolicy, { jobId, runId: "strict-envelope" }),
  ).rejects.toThrow("unexpected fields");
  expect((await t.run((ctx) => ctx.db.get(jobId)))?.raw).toContain(
    "unexpected",
  );
});
