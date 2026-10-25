import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  env,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { profile } from "./lib";
import { receipt } from "./validators";
import { workflow } from "./workflows";
import { syncStatus } from "./scheduleValidators";
import {
  validateBatch,
  sameEvent,
  materialChanges,
} from "../src/lib/integrations/apify";

type Actor = { actorId: string; role: Doc<"audit">["role"] };
async function log(
  ctx: MutationCtx,
  sandboxId: Id<"sandboxes">,
  actor: Actor,
  action: string,
  reason: string,
  before: string,
  after: string,
  allowed = true,
  caseId?: Id<"cases">,
  evidenceIds: string[] = [],
  changes: Doc<"audit">["changes"] = [],
) {
  await ctx.db.insert("audit", {
    sandboxId,
    timestamp: Date.now(),
    actor: actor.actorId,
    role: actor.role,
    action,
    reason,
    before,
    after,
    allowed,
    evidenceIds,
    changes,
    ...(caseId ? { caseId } : {}),
  });
}
const syncActor: Actor = { actorId: "apify-schedule-import", role: "sync_job" };
async function denied(
  ctx: MutationCtx,
  p: Awaited<ReturnType<typeof profile>>,
  message: string,
) {
  await log(
    ctx,
    p.sandboxId,
    p,
    "schedule_action_denied",
    message,
    "unchanged",
    "unchanged",
    false,
  );
  return { ok: false, message };
}
function canManage(p: Actor) {
  return ["human_accountant", "human_controller"].includes(p.role);
}
function canReview(p: Actor) {
  return canManage(p) || p.role === "travel_coordinator";
}
function trip(c: Doc<"cases">) {
  return {
    revision: c.revision,
    invoiceCode: c.input.code,
    contractId: c.input.contractId,
    vendorId: c.input.vendorId,
    destination: c.input.destination,
    start: c.input.start,
    end: c.input.end,
  };
}

export const requestSync = mutation({
  args: {},
  returns: receipt,
  handler: async (ctx) => {
    const p = await profile(ctx);
    if (!canManage(p))
      return denied(
        ctx,
        p,
        "Only an AP Manager or Controller can sync public schedules.",
      );
    if (
      !env.APIFY_API_TOKEN ||
      !env.APIFY_ACTOR_ID ||
      !/^[a-zA-Z0-9]{1,50}$/.test(env.APIFY_ACTOR_ID)
    )
      return denied(
        ctx,
        p,
        "Configure APIFY_API_TOKEN and the saved APIFY_ACTOR_ID before syncing.",
      );
    const last = await ctx.db
      .query("scheduleSyncs")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .order("desc")
      .first();
    if (
      last &&
      ["queued", "submitting", "running", "uncertain"].includes(last.status)
    )
      return denied(
        ctx,
        p,
        last.status === "uncertain"
          ? "Reconcile the uncertain submission before starting another sync."
          : "A schedule sync is already in progress.",
      );
    if (last?.status === "failed" && last.runId && !last.terminalFailure)
      return denied(
        ctx,
        p,
        "Resume the known provider run before starting another sync.",
      );
    if (last && Date.now() - last.requestedAt < 60000)
      return denied(ctx, p, "Wait one minute between schedule sync requests.");
    const links = await ctx.db
      .query("scheduleLinks")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .take(41);
    const trackedEventIds = [
      ...new Set(
        (await Promise.all(links.map((l) => ctx.db.get(l.eventId)))).flatMap(
          (e) => (e ? [e.externalId] : []),
        ),
      ),
    ];
    if (trackedEventIds.length > 10)
      return denied(
        ctx,
        p,
        "This integration supports at most ten linked events per workspace.",
      );
    const id = await ctx.db.insert("scheduleSyncs", {
      sandboxId: p.sandboxId,
      requestedBy: p.actorId,
      actorId: env.APIFY_ACTOR_ID,
      requestedAt: Date.now(),
      status: "queued",
      trackedEventIds,
    });
    const workflowId = await workflow.start(
      ctx,
      internal.scheduleWorkflow.sync,
      { jobId: id },
    );
    await ctx.db.patch(id, { workflowId });
    await log(
      ctx,
      p.sandboxId,
      p,
      "schedule_sync_requested",
      "Public schedule sync requested; coverage is limited.",
      "none",
      "queued",
      true,
      undefined,
      [id],
    );
    return { ok: true, message: "Apify schedule sync queued." };
  },
});
export const resumeSync = mutation({
  args: { jobId: v.id("scheduleSyncs"), runId: v.optional(v.string()) },
  returns: receipt,
  handler: async (ctx, { jobId, runId }) => {
    const p = await profile(ctx),
      job = await ctx.db.get(jobId);
    if (!canManage(p) || !job || job.sandboxId !== p.sandboxId)
      return denied(
        ctx,
        p,
        "Schedule sync unavailable or action not permitted.",
      );
    const latest = await ctx.db
      .query("scheduleSyncs")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .order("desc")
      .first();
    if (
      latest?._id !== jobId ||
      !["failed", "uncertain"].includes(job.status) ||
      job.terminalFailure
    )
      return denied(ctx, p, "Only the latest unresolved run can resume.");
    const externalId = job.buildId ? job.runId : (runId ?? job.runId);
    if (!externalId || !/^[a-zA-Z0-9]{1,50}$/.test(externalId))
      return denied(
        ctx,
        p,
        "Provide the run ID from Apify. A new run will not be submitted.",
      );
    await ctx.db.patch(jobId, {
      runId: externalId,
      status: "queued",
      error: undefined,
    });
    const workflowId = await workflow.start(
      ctx,
      internal.scheduleWorkflow.sync,
      { jobId },
    );
    await ctx.db.patch(jobId, { workflowId });
    await log(
      ctx,
      p.sandboxId,
      p,
      "schedule_sync_resumed",
      "Resume polling only; provider ownership and request input will be verified.",
      job.status,
      "queued",
      true,
      undefined,
      [jobId, externalId],
    );
    return {
      ok: true,
      message: "Known run queued for verification and polling.",
    };
  },
});
export const claimSubmission = internalMutation({
  args: { jobId: v.id("scheduleSyncs") },
  returns: v.boolean(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (
      !job ||
      job.status !== "queued" ||
      job.runId ||
      (await ctx.db.get(job.sandboxId))?.archived
    )
      return false;
    await ctx.db.patch(jobId, { status: "submitting" });
    await log(
      ctx,
      job.sandboxId,
      syncActor,
      "schedule_submission_claimed",
      "One provider submission claimed.",
      "queued",
      "submitting",
      true,
      undefined,
      [jobId],
    );
    return true;
  },
});
export const readJob = internalQuery({
  args: { jobId: v.id("scheduleSyncs") },
  returns: v.any(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || (await ctx.db.get(job.sandboxId))?.archived) return null;
    return job;
  },
});
export const note = internalMutation({
  args: {
    jobId: v.id("scheduleSyncs"),
    status: syncStatus,
    runId: v.optional(v.string()),
    buildId: v.optional(v.string()),
    datasetId: v.optional(v.string()),
    error: v.optional(v.string()),
    terminalFailure: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, ...fields }) => {
    const j = await ctx.db.get(jobId);
    if (!j || j.status === "completed") return null;
    if ((await ctx.db.get(j.sandboxId))?.archived) return null;
    await ctx.db.patch(jobId, fields);
    await log(
      ctx,
      j.sandboxId,
      syncActor,
      "schedule_sync_status",
      fields.error ?? `Schedule sync ${fields.status}.`,
      j.status,
      fields.status,
      true,
      undefined,
      [jobId, ...(fields.runId ? [fields.runId] : [])],
    );
    return null;
  },
});
export const finish = internalMutation({
  args: { jobId: v.id("scheduleSyncs"), batch: v.any() },
  returns: v.null(),
  handler: async (ctx, { jobId, batch: raw }) => {
    const job = await ctx.db.get(jobId);
    if (
      !job ||
      job.status === "completed" ||
      (await ctx.db.get(job.sandboxId))?.archived
    )
      return null;
    if (job.status !== "running" || !job.runId || !job.datasetId)
      throw new Error("Provider run not verified.");
    const batch = validateBatch(
      raw,
      jobId,
      job.trackedEventIds,
      job.requestedAt,
      Date.now(),
    );
    const existing = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", job.sandboxId))
      .take(101);
    const newCount = batch.events.filter(
      (e) => !existing.some((row) => row.externalId === e.externalId),
    ).length;
    if (existing.length + newCount > 100)
      throw new Error(
        "Workspace event limit reached; existing history is preserved.",
      );
    let imported = 0,
      changed = 0,
      stale = 0;
    for (const { rawJson, ...data } of batch.events) {
      let event = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_sandboxId_and_externalId", (q) =>
          q.eq("sandboxId", job.sandboxId).eq("externalId", data.externalId),
        )
        .unique();
      if (
        event &&
        Date.parse(batch.observedAt) <= Date.parse(event.lastObservedAt)
      ) {
        stale++;
        continue;
      }
      const previous = event?.currentRevisionId
        ? await ctx.db.get(event.currentRevisionId)
        : null;
      if (!event) {
        const id = await ctx.db.insert("scheduleEvents", {
          sandboxId: job.sandboxId,
          externalId: data.externalId,
          version: 0,
          lastObservedAt: batch.observedAt,
          lastSyncId: jobId,
        });
        event = (await ctx.db.get(id))!;
        imported++;
      }
      if (previous && sameEvent(previous.data, data)) {
        await ctx.db.patch(event._id, {
          lastObservedAt: batch.observedAt,
          lastSyncId: jobId,
        });
        continue;
      }
      const revisionId = await ctx.db.insert("scheduleRevisions", {
        sandboxId: job.sandboxId,
        eventId: event._id,
        syncId: jobId,
        version: event.version + 1,
        data,
        rawJson,
        observedAt: batch.observedAt,
        recordedAt: Date.now(),
      });
      await ctx.db.patch(event._id, {
        currentRevisionId: revisionId,
        version: event.version + 1,
        lastObservedAt: batch.observedAt,
        lastSyncId: jobId,
      });
      const changes = previous ? materialChanges(previous.data, data) : [];
      if (previous) changed++;
      if (changes.length) {
        const links = await ctx.db
          .query("scheduleLinks")
          .withIndex("by_eventId", (q) => q.eq("eventId", event!._id))
          .take(40);
        for (const link of links) {
          const c = await ctx.db.get(link.caseId);
          if (!c || c.sandboxId !== job.sandboxId) continue;
          await ctx.db.insert("scheduleReviews", {
            sandboxId: job.sandboxId,
            caseId: c._id,
            eventId: event._id,
            linkId: link._id,
            fromRevisionId: previous!._id,
            toRevisionId: revisionId,
            trip: trip(c),
            changes,
            reason:
              "Public event details changed. Verify the linked booking and signed terms with Travel Operations.",
            status: "open",
            createdAt: Date.now(),
          });
          await log(
            ctx,
            job.sandboxId,
            syncActor,
            "schedule_review_opened",
            "Public schedule changed; review required. Financial evidence and approvals remain unchanged.",
            "none",
            "open",
            true,
            c._id,
            [previous!._id, revisionId],
            changes,
          );
        }
      }
      await log(
        ctx,
        job.sandboxId,
        syncActor,
        "schedule_revision_recorded",
        `TheSportsDB event ${data.externalId}; source observed ${batch.observedAt}.`,
        String(event.version),
        String(event.version + 1),
        true,
        undefined,
        [revisionId],
        changes,
      );
    }
    await ctx.db.patch(jobId, {
      status: "completed",
      completedAt: Date.now(),
      observedAt: batch.observedAt,
      imported,
      changed,
      stale,
      missingTrackedIds: batch.missingTrackedIds,
      error: undefined,
    });
    await log(
      ctx,
      job.sandboxId,
      syncActor,
      "schedule_sync_completed",
      `Imported ${imported}, revised ${changed}, ignored ${stale} stale observations. ${batch.missingTrackedIds.length} tracked events unavailable; absence is not cancellation.`,
      "running",
      "completed",
      true,
      undefined,
      [jobId, job.runId],
    );
    return null;
  },
});
export const link = mutation({
  args: {
    eventId: v.id("scheduleEvents"),
    caseId: v.id("cases"),
    expectedVersion: v.number(),
    reason: v.string(),
  },
  returns: receipt,
  handler: async (ctx, args) => {
    const p = await profile(ctx),
      event = await ctx.db.get(args.eventId),
      c = await ctx.db.get(args.caseId);
    if (
      !canReview(p) ||
      !event ||
      !c ||
      event.sandboxId !== p.sandboxId ||
      c.sandboxId !== p.sandboxId
    )
      return denied(
        ctx,
        p,
        "Event or case unavailable, or linking is not permitted.",
      );
    if (!args.reason.trim() || args.reason.length > 2000)
      return denied(ctx, p, "Provide a linking reason of 1–2,000 characters.");
    if (event.version !== args.expectedVersion || !event.currentRevisionId)
      return denied(
        ctx,
        p,
        "Event changed. Refresh and review it before linking.",
      );
    const duplicate = await ctx.db
      .query("scheduleLinks")
      .withIndex("by_eventId_and_caseId", (q) =>
        q.eq("eventId", event._id).eq("caseId", c._id),
      )
      .unique();
    if (duplicate)
      return { ok: true, message: "This event is already linked to the case." };
    const links = await ctx.db
      .query("scheduleLinks")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .take(41);
    if (
      links.length >= 40 ||
      (!links.some((l) => l.eventId === event._id) &&
        new Set(links.map((l) => l.eventId)).size >= 10)
    )
      return denied(
        ctx,
        p,
        "Workspace limit: 40 links across ten tracked events.",
      );
    const revision = (await ctx.db.get(event.currentRevisionId))!;
    const linkId = await ctx.db.insert("scheduleLinks", {
      sandboxId: p.sandboxId,
      eventId: event._id,
      caseId: c._id,
      baselineRevisionId: revision._id,
      trip: trip(c),
      reason: args.reason.trim(),
      linkedBy: p.actorId,
      createdAt: Date.now(),
    });
    const outside =
      revision.data.dateUtc < c.input.start ||
      revision.data.dateUtc > c.input.end;
    if (outside || ["cancelled", "postponed"].includes(revision.data.status)) {
      const reason = outside
        ? "Reported UTC event date falls outside the synthetic booking dates. Verify time zones and the intended booking."
        : "The linked public event is cancelled or postponed. Verify booking commitments with Travel Operations.";
      await ctx.db.insert("scheduleReviews", {
        sandboxId: p.sandboxId,
        caseId: c._id,
        eventId: event._id,
        linkId,
        toRevisionId: revision._id,
        trip: trip(c),
        changes: [],
        reason,
        status: "open",
        createdAt: Date.now(),
      });
      await log(
        ctx,
        p.sandboxId,
        syncActor,
        "schedule_review_opened",
        reason,
        "none",
        "open",
        true,
        c._id,
        [revision._id],
      );
    }
    await log(
      ctx,
      p.sandboxId,
      p,
      "schedule_event_linked",
      args.reason.trim(),
      "unlinked",
      "linked",
      true,
      c._id,
      [revision._id],
    );
    return {
      ok: true,
      message: "Public event linked to the synthetic trip and contract.",
    };
  },
});
export const review = mutation({
  args: { id: v.id("scheduleReviews"), reason: v.string() },
  returns: receipt,
  handler: async (ctx, { id, reason }) => {
    const p = await profile(ctx),
      r = await ctx.db.get(id);
    if (!canReview(p) || !r || r.sandboxId !== p.sandboxId)
      return denied(ctx, p, "Review unavailable or action not permitted.");
    if (!reason.trim() || reason.length > 2000)
      return denied(ctx, p, "Provide a review note of 1–2,000 characters.");
    if (r.status === "reviewed")
      return { ok: true, message: "Review already acknowledged." };
    await ctx.db.patch(id, {
      status: "reviewed",
      reviewedBy: p.actorId,
      reviewedAt: Date.now(),
      resolution: reason.trim(),
    });
    await log(
      ctx,
      p.sandboxId,
      p,
      "schedule_review_acknowledged",
      reason.trim(),
      "open",
      "reviewed",
      true,
      r.caseId,
      [r.toRevisionId],
    );
    return {
      ok: true,
      message:
        "Review noted. Any financial correction still requires the case evidence and approval workflow.",
    };
  },
});
export const list = query({
  args: { caseId: v.optional(v.id("cases")) },
  returns: v.any(),
  handler: async (ctx, { caseId }) => {
    const p = await profile(ctx);
    if (caseId && (await ctx.db.get(caseId))?.sandboxId !== p.sandboxId)
      throw new Error("Case unavailable.");
    const links = caseId
      ? await ctx.db
          .query("scheduleLinks")
          .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
          .take(40)
      : await ctx.db
          .query("scheduleLinks")
          .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
          .take(40);
    const events = caseId
      ? (
          await Promise.all(
            [...new Set(links.map((l) => l.eventId))].map((id) =>
              ctx.db.get(id),
            ),
          )
        ).filter((e) => e !== null)
      : await ctx.db
          .query("scheduleEvents")
          .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
          .order("desc")
          .take(100);
    const reviews = caseId
      ? await ctx.db
          .query("scheduleReviews")
          .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
          .order("desc")
          .take(100)
      : await ctx.db
          .query("scheduleReviews")
          .withIndex("by_sandboxId_and_status", (q) =>
            q.eq("sandboxId", p.sandboxId).eq("status", "open"),
          )
          .take(100);
    return {
      configured: !!env.APIFY_API_TOKEN && !!env.APIFY_ACTOR_ID,
      canSync: canManage(p),
      canReview: canReview(p),
      links,
      reviews,
      events: await Promise.all(
        events.map(async (event) => ({
          ...event,
          revision: event.currentRevisionId
            ? await ctx.db.get(event.currentRevisionId)
            : null,
        })),
      ),
      jobs: await ctx.db
        .query("scheduleSyncs")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
        .order("desc")
        .take(10),
    };
  },
});
export const history = query({
  args: { eventId: v.id("scheduleEvents") },
  returns: v.any(),
  handler: async (ctx, { eventId }) => {
    const p = await profile(ctx),
      e = await ctx.db.get(eventId);
    if (!e || e.sandboxId !== p.sandboxId)
      throw new Error("Event unavailable.");
    const revisions = await ctx.db
      .query("scheduleRevisions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .take(10);
    return Promise.all(
      revisions.map(async (revision) => ({
        revision,
        job: await ctx.db.get(revision.syncId),
      })),
    );
  },
});
