/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { datasetCases } from "../src/lib/simulation/datasets";

const modules = import.meta.glob("./**/*.ts");
const identity = {
  subject: "case-routes",
  issuer: "https://test.local",
  tokenIdentifier: "test|case-routes",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const client = t.withIdentity(identity);
  const ids = await t.run(async (ctx) => {
    const sandboxId = await ctx.db.insert("sandboxes", {
      owner: identity.tokenIdentifier,
      generation: 1,
      mode: "deterministic",
      dataset: "demo",
      archived: false,
      createdAt: Date.now(),
    });
    const profileId = await ctx.db.insert("profiles", {
      identity: identity.tokenIdentifier,
      role: "human_accountant",
      sandboxId,
    });
    const caseId = await ctx.db.insert("cases", {
      sandboxId,
      input: datasetCases("demo")[0].input,
      revision: 1,
      state: "NEW",
      phase: "Invoice received",
      mode: "deterministic",
      updatedAt: Date.now(),
      attempt: 0,
    });
    return { sandboxId, profileId, caseId };
  });
  return { t, client, ...ids };
}

describe("Case route resolution", () => {
  it("resolves an owned case beyond the latest 40 workspace rows", async () => {
    const { t, client, caseId, sandboxId } = await setup();
    const original = await t.run((ctx) => ctx.db.get(caseId));
    expect(original).not.toBeNull();
    await t.run(async (ctx) => {
      for (let n = 0; n < 40; n++) {
        vi.advanceTimersByTime(1);
        await ctx.db.insert("cases", {
          sandboxId,
          input: { ...datasetCases("demo")[0].input, code: `LATER-${n}` },
          revision: 1,
          state: "NEW",
          phase: "Invoice received",
          mode: "deterministic",
          updatedAt: Date.now(),
          attempt: 0,
        });
      }
    });
    const snapshot = await client.query(api.workspace.snapshot, {});
    expect(snapshot?.cases).toHaveLength(40);
    expect(snapshot?.cases.some((c) => c._id === caseId)).toBe(false);
    expect(await client.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "available",
      detail: {
        case: original,
        subtasks: [],
        disputes: [],
        proposals: [],
        audit: [],
        approvals: [],
        questions: [],
        journals: [],
        corrections: [],
        runs: [],
      },
      sandboxId,
    });
  });

  it.each(["", "null", "undefined", "not-a-case", "/work/old-case"])(
    "returns unavailable for a malformed route ID %j",
    async (id) => {
      const { client } = await setup();
      expect(await client.query(api.caseRoutes.resolve, { id })).toEqual({
        status: "unavailable",
      });
    },
  );

  it("returns unavailable for IDs from another table or deleted cases", async () => {
    const { t, client, caseId, sandboxId } = await setup();
    expect(
      await client.query(api.caseRoutes.resolve, { id: sandboxId }),
    ).toEqual({
      status: "unavailable",
    });
    await t.run((ctx) => ctx.db.delete(caseId));
    expect(await client.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "unavailable",
    });
  });

  it("does not expose a case or recovery hints to another authenticated owner", async () => {
    const { t, caseId, sandboxId } = await setup();
    const other = t.withIdentity({
      ...identity,
      subject: "other",
      tokenIdentifier: "test|other",
    });
    // Even an inconsistent profile pointer must not grant ownership.
    await t.run((ctx) =>
      ctx.db.insert("profiles", {
        identity: "test|other",
        role: "human_accountant",
        sandboxId,
      }),
    );
    expect(await other.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "unavailable",
    });
    await t.run((ctx) => ctx.db.patch(sandboxId, { archived: true }));
    expect(await other.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "unavailable",
    });
  });

  it("returns unavailable before authentication or workspace initialization", async () => {
    const { t, caseId } = await setup();
    expect(await t.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "unavailable",
    });
    const newUser = t.withIdentity({
      ...identity,
      tokenIdentifier: "test|new-user",
    });
    expect(await newUser.query(api.caseRoutes.resolve, { id: caseId })).toEqual(
      {
        status: "unavailable",
      },
    );
  });

  it("gives only dataset recovery context after switching and archive context after reset", async () => {
    const { t, client, caseId, sandboxId } = await setup();
    expect(
      (await client.mutation(api.datasets.select, { dataset: "history" })).ok,
    ).toBe(true);
    expect(await client.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "other_dataset",
      dataset: "demo",
    });
    await client.mutation(api.datasets.select, { dataset: "demo" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await client.query(api.caseRoutes.resolve, { id: caseId }),
    ).toMatchObject({
      status: "available",
      sandboxId,
    });
    await client.mutation(api.workspace.reset, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await client.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "archived",
    });
    expect(await t.run((ctx) => ctx.db.get(caseId))).not.toBeNull();
    const snapshot = await client.query(api.workspace.snapshot, {});
    const newCase = snapshot?.cases[0];
    expect(newCase).toBeDefined();
    expect(
      await client.query(api.caseRoutes.resolve, { id: newCase!._id }),
    ).toMatchObject({
      status: "available",
      sandboxId: snapshot?.sandbox?._id,
    });
  });

  it("supports legacy active workspaces without granting access to inactive legacy records", async () => {
    const { t, client, sandboxId, profileId, caseId } = await setup();
    await t.run((ctx) => ctx.db.patch(sandboxId, { dataset: undefined }));
    expect(
      await client.query(api.caseRoutes.resolve, { id: caseId }),
    ).toMatchObject({
      status: "available",
      sandboxId,
    });
    await t.run(async (ctx) => {
      const nextSandboxId = await ctx.db.insert("sandboxes", {
        owner: identity.tokenIdentifier,
        generation: 2,
        mode: "deterministic",
        archived: false,
        createdAt: Date.now(),
      });
      await ctx.db.patch(profileId, { sandboxId: nextSandboxId });
    });
    expect(await client.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "unavailable",
    });
  });

  it("returns unavailable for a case whose workspace was removed", async () => {
    const { t, client, sandboxId, caseId } = await setup();
    await t.run((ctx) => ctx.db.delete(sandboxId));
    expect(await client.query(api.caseRoutes.resolve, { id: caseId })).toEqual({
      status: "unavailable",
    });
  });
});
