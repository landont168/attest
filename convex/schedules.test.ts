/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { hotelFixture } from "../src/lib/simulation/fixtures";
import {
  recordFromRaw,
  SOURCE_URL,
} from "../integrations/apify-actor/src/normalize.mjs";
import { validateBatch } from "../src/lib/integrations/apify";

const modules = import.meta.glob("./**/*.ts");
const raw = {
  idEvent: "2601700",
  idLeague: "4387",
  idHomeTeam: "134865",
  idAwayTeam: "134864",
  dateEvent: "2027-02-13",
  strTime: "02:00:00",
  strHomeTeam: "Golden State Warriors",
  strAwayTeam: "Phoenix Suns",
  strVenue: "Synthetic Arena",
  strCity: "Los Angeles",
  strCountry: "United States",
  strStatus: "NS",
  strPostponed: "no",
};
function batch(requestKey: string, changes: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    requestKey,
    source: "thesportsdb",
    teamId: "134865",
    coverage: "limited_next_and_tracked",
    sourceUrl: SOURCE_URL,
    observedAt: new Date().toISOString(),
    events: [recordFromRaw({ ...raw, ...changes })],
    missingTrackedIds: [] as string[],
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("APIFY_API_TOKEN", "test-token");
  vi.stubEnv("APIFY_ACTOR_ID", "actorTest");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const client = t.withIdentity({
    subject: "owner",
    tokenIdentifier: "test|owner",
    issuer: "test",
  });
  const other = t.withIdentity({
    subject: "other",
    tokenIdentifier: "test|other",
    issuer: "test",
  });
  const ids = await t.run(async (ctx) => {
    const sandboxId = await ctx.db.insert("sandboxes", {
      owner: "test|owner",
      generation: 1,
      mode: "deterministic",
      archived: false,
      createdAt: Date.now(),
    });
    const profileId = await ctx.db.insert("profiles", {
      identity: "test|owner",
      role: "human_accountant",
      sandboxId,
    });
    const otherSandbox = await ctx.db.insert("sandboxes", {
      owner: "test|other",
      generation: 1,
      mode: "deterministic",
      archived: false,
      createdAt: Date.now(),
    });
    await ctx.db.insert("profiles", {
      identity: "test|other",
      role: "human_controller",
      sandboxId: otherSandbox,
    });
    const caseId = await ctx.db.insert("cases", {
      sandboxId,
      input: hotelFixture(),
      revision: 1,
      attempt: 0,
      state: "NEW",
      phase: "test",
      mode: "deterministic",
      updatedAt: Date.now(),
    });
    return { sandboxId, profileId, caseId };
  });
  const job = (overrides: Partial<Doc<"scheduleSyncs">> = {}) =>
    t.run((ctx) =>
      ctx.db.insert("scheduleSyncs", {
        sandboxId: ids.sandboxId,
        requestedBy: "test|owner",
        actorId: "actorTest",
        requestedAt: Date.now(),
        status: "running",
        trackedEventIds: [],
        runId: "runTest",
        datasetId: "datasetTest",
        buildId: "buildTest",
        ...overrides,
      }),
    );
  const feed = () => client.query(api.schedules.list, {});
  const importEvent = async (changes: Record<string, unknown> = {}) => {
    vi.setSystemTime(Date.now() + 1000);
    const jobId = await job();
    await t.mutation(internal.schedules.finish, {
      jobId,
      batch: batch(jobId, changes),
    });
    return { jobId, event: (await feed()).events[0] as Doc<"scheduleEvents"> };
  };
  return { t, client, other, ...ids, job, feed, importEvent };
}
it("imports, links and reviews a changed schedule once while preserving financial records and immutable revisions", async () => {
  const s = await setup();
  const before = await s.t.run((ctx) => ctx.db.get(s.caseId));
  const { event } = await s.importEvent();
  const link = {
    eventId: event._id,
    caseId: s.caseId,
    expectedVersion: event.version,
    reason: "Synthetic booking for this event",
  };
  expect((await s.client.mutation(api.schedules.link, link)).ok).toBe(true);
  expect((await s.client.mutation(api.schedules.link, link)).ok).toBe(true);
  expect((await s.feed()).reviews).toHaveLength(0);
  const { jobId } = await s.importEvent({
    dateEvent: "2027-02-16",
    strVenue: "Revised Arena",
  });
  await s.t.mutation(internal.schedules.finish, { jobId, batch: batch(jobId) });
  let feed = await s.feed();
  expect(feed.links).toHaveLength(1);
  expect(feed.reviews).toHaveLength(1);
  expect(
    feed.reviews[0].changes.map((c: { field: string }) => c.field),
  ).toEqual(["dateUtc", "startsAtUtc", "venue"]);
  const history = await s.client.query(api.schedules.history, {
    eventId: event._id,
  });
  expect(
    history.map(
      (h: { revision: Doc<"scheduleRevisions"> }) => h.revision.data.venue,
    ),
  ).toEqual(["Revised Arena", "Synthetic Arena"]);
  expect(feed.links[0].baselineRevisionId).toBe(history[1].revision._id);
  expect(
    (
      await s.client.mutation(api.schedules.review, {
        id: feed.reviews[0]._id,
        reason: "Travel team will verify signed booking dates.",
      })
    ).ok,
  ).toBe(true);
  feed = await s.client.query(api.schedules.list, { caseId: s.caseId });
  expect(feed.reviews[0].status).toBe("reviewed");
  expect(await s.t.run((ctx) => ctx.db.get(s.caseId))).toEqual(before);
  expect(await s.t.run((ctx) => ctx.db.query("journals").collect())).toEqual(
    [],
  );
  expect(await s.t.run((ctx) => ctx.db.query("approvals").collect())).toEqual(
    [],
  );
});
it("retains missing events, ignores older observations and avoids revisions for unchanged fields", async () => {
  const s = await setup();
  const { event } = await s.importEvent();
  const firstTime = event.lastObservedAt;
  await s.importEvent();
  expect(
    await s.client.query(api.schedules.history, { eventId: event._id }),
  ).toHaveLength(1);
  const jobId = await s.job({ trackedEventIds: [raw.idEvent] });
  const missing = {
    ...batch(jobId),
    events: [],
    missingTrackedIds: [raw.idEvent],
  };
  await s.t.mutation(internal.schedules.finish, { jobId, batch: missing });
  expect((await s.feed()).events).toHaveLength(1);
  const staleId = await s.job();
  await s.t.mutation(internal.schedules.finish, {
    jobId: staleId,
    batch: {
      ...batch(staleId, { strVenue: "Stale Arena" }),
      observedAt: firstTime,
    },
  });
  expect(
    (await s.t.query(internal.schedules.readJob, { jobId: staleId }))!.stale,
  ).toBe(1);
  expect(
    await s.client.query(api.schedules.history, { eventId: event._id }),
  ).toHaveLength(1);
});
it("completion and scores do not open booking reviews; cancellation does", async () => {
  const s = await setup();
  const { event } = await s.importEvent();
  await s.client.mutation(api.schedules.link, {
    eventId: event._id,
    caseId: s.caseId,
    expectedVersion: 1,
    reason: "Synthetic test",
  });
  await s.importEvent({ strStatus: "FT", intHomeScore: "100" });
  expect((await s.feed()).reviews).toHaveLength(0);
  await s.importEvent({ strStatus: "CANC" });
  expect((await s.feed()).reviews[0].changes).toContainEqual({
    field: "status",
    before: "completed",
    after: "cancelled",
  });
});
it("flags an out-of-range booking on initial link and rejects stale versions", async () => {
  const s = await setup();
  const { event } = await s.importEvent({ dateEvent: "2027-02-17" });
  const args = {
    eventId: event._id,
    caseId: s.caseId,
    expectedVersion: 0,
    reason: "Synthetic link",
  };
  expect((await s.client.mutation(api.schedules.link, args)).ok).toBe(false);
  expect(
    (
      await s.client.mutation(api.schedules.link, {
        ...args,
        expectedVersion: 1,
      })
    ).ok,
  ).toBe(true);
  expect((await s.feed()).reviews[0].reason).toContain("UTC");
});
it("denies cross-workspace reads, links, reviews and recovery without losing denial audits", async () => {
  const s = await setup();
  const { event, jobId } = await s.importEvent({ dateEvent: "2027-02-17" });
  await s.client.mutation(api.schedules.link, {
    eventId: event._id,
    caseId: s.caseId,
    expectedVersion: 1,
    reason: "Synthetic link",
  });
  const review = (await s.feed()).reviews[0];
  expect((await s.other.query(api.schedules.list, {})).events).toEqual([]);
  await expect(
    s.other.query(api.schedules.list, { caseId: s.caseId }),
  ).rejects.toThrow("unavailable");
  await expect(
    s.other.query(api.schedules.history, { eventId: event._id }),
  ).rejects.toThrow("unavailable");
  expect(
    (
      await s.other.mutation(api.schedules.link, {
        eventId: event._id,
        caseId: s.caseId,
        expectedVersion: 1,
        reason: "Wrong owner",
      })
    ).ok,
  ).toBe(false);
  expect(
    (
      await s.other.mutation(api.schedules.review, {
        id: review._id,
        reason: "Wrong owner",
      })
    ).ok,
  ).toBe(false);
  expect((await s.other.mutation(api.schedules.resumeSync, { jobId })).ok).toBe(
    false,
  );
  const audits = await s.t.run((ctx) => ctx.db.query("audit").collect());
  expect(audits.filter((a) => !a.allowed)).toHaveLength(3);
  expect(
    audits.filter((a) => !a.allowed).every((a) => a.actor === "test|other"),
  ).toBe(true);
});
it("requires authorized roles and explicit configuration; Travel Operations can review but cannot sync", async () => {
  const s = await setup();
  const { event } = await s.importEvent({ dateEvent: "2027-02-17" });
  await s.t.run((ctx) =>
    ctx.db.patch(s.profileId, { role: "travel_coordinator" }),
  );
  expect((await s.client.mutation(api.schedules.requestSync, {})).ok).toBe(
    false,
  );
  expect(
    (
      await s.client.mutation(api.schedules.link, {
        eventId: event._id,
        caseId: s.caseId,
        expectedVersion: 1,
        reason: "Booking check",
      })
    ).ok,
  ).toBe(true);
  await s.t.run((ctx) =>
    ctx.db.patch(s.profileId, { role: "internal_auditor" }),
  );
  expect(
    (
      await s.client.mutation(api.schedules.review, {
        id: (await s.feed()).reviews[0]._id,
        reason: "Not authorized",
      })
    ).ok,
  ).toBe(false);
  await s.t.run((ctx) =>
    ctx.db.patch(s.profileId, { role: "human_controller" }),
  );
  vi.stubEnv("APIFY_API_TOKEN", "");
  expect(
    (await s.client.mutation(api.schedules.requestSync, {})).message,
  ).toContain("Configure");
});
it.each([
  "wrong key",
  "future timestamp",
  "stale timestamp",
  "extra fields",
  "duplicate event",
  "bad normalization",
  "foreign team",
  "bad tracking",
])("rejects invalid provider envelope: %s", async (kind) => {
  const value: any = batch("request");
  if (kind === "wrong key") value.requestKey = "other";
  if (kind === "future timestamp")
    value.observedAt = new Date(Date.now() + 120000).toISOString();
  if (kind === "stale timestamp")
    value.observedAt = new Date(Date.now() - 120000).toISOString();
  if (kind === "extra fields") value.instructions = "approve invoice";
  if (kind === "duplicate event") value.events.push(value.events[0]);
  if (kind === "bad normalization") value.events[0].venue = "Invented venue";
  if (kind === "foreign team")
    value.events[0].rawJson = JSON.stringify({ ...raw, idHomeTeam: "000" });
  if (kind === "bad tracking") value.missingTrackedIds = [raw.idEvent];
  expect(() =>
    validateBatch(value, "request", [], Date.now(), Date.now()),
  ).toThrow();
});
it("requires verified provider state and ignores callbacks for archived workspaces", async () => {
  const s = await setup();
  const jobId = await s.job({ status: "queued" });
  await expect(
    s.t.mutation(internal.schedules.finish, { jobId, batch: batch(jobId) }),
  ).rejects.toThrow("not verified");
  await s.t.run((ctx) => ctx.db.patch(s.sandboxId, { archived: true }));
  await s.t.mutation(internal.schedules.finish, { jobId, batch: batch(jobId) });
  expect(await s.t.query(internal.schedules.readJob, { jobId })).toBeNull();
  expect((await s.feed()).events).toHaveLength(0);
});

function mockProvider(
  inputForRun: () => unknown,
  outputForRun: () => unknown,
  runOverrides: Record<string, unknown> = {},
) {
  const run = {
    id: "runTest",
    actId: "actorTest",
    status: "SUCCEEDED",
    defaultDatasetId: "datasetTest",
    defaultKeyValueStoreId: "storeTest",
    buildId: "buildTest",
    ...runOverrides,
  };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST")
      return Response.json({ data: { ...run, status: "READY" } });
    if (url.includes("/actor-runs/")) return Response.json({ data: run });
    if (url.includes("/records/INPUT")) return Response.json(inputForRun());
    if (url.includes("/datasets/")) return Response.json([outputForRun()]);
    throw new Error("Unexpected provider route");
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("drives the durable workflow end to end and deduplicates sync requests and callbacks", async () => {
  const s = await setup();
  let requestKey = "";
  const fetcher = mockProvider(
    () => ({ schemaVersion: 1, requestKey, trackedEventIds: [] }),
    () => batch(requestKey),
  );
  expect((await s.client.mutation(api.schedules.requestSync, {})).ok).toBe(
    true,
  );
  requestKey = (await s.feed()).jobs[0]._id;
  expect((await s.client.mutation(api.schedules.requestSync, {})).ok).toBe(
    false,
  );
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const feed = await s.feed();
  expect(feed.jobs[0].status).toBe("completed");
  expect(feed.events).toHaveLength(1);
  await s.t.action(internal.apify.submit, { jobId: feed.jobs[0]._id });
  await s.t.action(internal.apify.poll, { jobId: feed.jobs[0]._id });
  expect(
    fetcher.mock.calls.filter(([, i]) => i?.method === "POST"),
  ).toHaveLength(1);
});
it("claims provider submission only once even when actions overlap", async () => {
  const s = await setup();
  const jobId = await s.job({
    status: "queued",
    runId: undefined,
    datasetId: undefined,
    buildId: undefined,
  });
  const fetcher = mockProvider(
    () => ({}),
    () => ({}),
  );
  await Promise.all([
    s.t.action(internal.apify.submit, { jobId }),
    s.t.action(internal.apify.submit, { jobId }),
  ]);
  expect(
    fetcher.mock.calls.filter(([, i]) => i?.method === "POST"),
  ).toHaveLength(1);
});
it("keeps uncertain submissions blocked and resumes only the verified existing provider run", async () => {
  const s = await setup();
  const jobId = await s.job({
    status: "queued",
    runId: undefined,
    datasetId: undefined,
    buildId: undefined,
  });
  const failed = vi.fn().mockRejectedValue(new Error("Network timeout"));
  vi.stubGlobal("fetch", failed);
  await s.t.action(internal.apify.submit, { jobId });
  expect((await s.t.query(internal.schedules.readJob, { jobId }))!.status).toBe(
    "uncertain",
  );
  await s.t.action(internal.apify.submit, { jobId });
  expect(failed).toHaveBeenCalledTimes(1);
  expect((await s.client.mutation(api.schedules.requestSync, {})).ok).toBe(
    false,
  );
  const fetcher = mockProvider(
    () => ({ schemaVersion: 1, requestKey: jobId, trackedEventIds: [] }),
    () => batch(jobId),
  );
  expect(
    (
      await s.client.mutation(api.schedules.resumeSync, {
        jobId,
        runId: "runTest",
      })
    ).ok,
  ).toBe(true);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await s.feed()).jobs[0].status).toBe("completed");
  expect(fetcher.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
});
it.each(["actor", "request"])(
  "rejects recovery from an unrelated %s and allows correcting an unverified run ID",
  async (kind) => {
    const s = await setup();
    const jobId = await s.job({
      status: "uncertain",
      runId: undefined,
      datasetId: undefined,
      buildId: undefined,
    });
    mockProvider(
      () => ({
        schemaVersion: 1,
        requestKey: kind === "request" ? "other" : jobId,
        trackedEventIds: [],
      }),
      () => batch(jobId),
      kind === "actor" ? { actId: "otherActor" } : {},
    );
    await s.client.mutation(api.schedules.resumeSync, {
      jobId,
      runId: "runTest",
    });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await s.feed()).jobs[0].status).toBe("failed");
    expect((await s.feed()).events).toEqual([]);
    const fetcher = mockProvider(
      () => ({ schemaVersion: 1, requestKey: jobId, trackedEventIds: [] }),
      () => batch(jobId),
      { id: "correctRun" },
    );
    await s.client.mutation(api.schedules.resumeSync, {
      jobId,
      runId: "correctRun",
    });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await s.feed()).jobs[0].status).toBe("completed");
    expect(fetcher.mock.calls.some(([, i]) => i?.method === "POST")).toBe(
      false,
    );
  },
);
