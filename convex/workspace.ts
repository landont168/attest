import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { workflow } from "./workflows";
import { profile, audit } from "./lib";
import {
  scenarios,
  historicalPrecedents,
} from "../src/lib/simulation/fixtures";
import { humanRole, mode, invoiceInput, receipt } from "./validators";
import { inputSchema } from "../src/lib/finance/types";
export const initialize = mutation({
  args: {},
  returns: v.id("sandboxes"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in first.");
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_identity", (q) =>
        q.eq("identity", identity.tokenIdentifier),
      )
      .unique();
    if (existing) return existing.sandboxId;
    const sandboxId = await ctx.db.insert("sandboxes", {
      owner: identity.tokenIdentifier,
      generation: 1,
      mode: "deterministic",
      archived: false,
      createdAt: Date.now(),
    });
    await ctx.db.insert("profiles", {
      identity: identity.tokenIdentifier,
      role: "human_accountant",
      sandboxId,
    });
    await seed(ctx, sandboxId);
    return sandboxId;
  },
});
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
async function seed(ctx: MutationCtx, sandboxId: Id<"sandboxes">) {
  for (const h of historicalPrecedents)
    await ctx.db.insert("precedents", { sandboxId, ...h });
  await ctx.db.insert("policies", {
    sandboxId,
    version: 1,
    title: "Signed evidence before financial execution",
    vendor: "All vendors",
    status: "active",
    procedure: "controller_confirmation",
    description:
      "Signed contractual terms and confirmed services are required. Disputed invoices remain on hold until documented vendor resolution and controller approval. Exceptions never replace signed terms without authority.",
    precedentIds: [],
    createdAt: Date.now(),
    approvedBy: "Synthetic controller · seed fixture",
    approvedAt: Date.now(),
    checks: [],
    origin: "Synthetic approved baseline",
  });
  for (const month of ["2027-01", "2027-02", "2027-03"])
    await ctx.db.insert("periods", {
      sandboxId,
      month,
      closed: month === "2027-01",
    });
  for (const input of scenarios()) {
    const id = await ctx.db.insert("cases", {
      sandboxId,
      input,
      revision: 1,
      state: "NEW",
      phase: "Invoice received",
      mode: "deterministic",
      updatedAt: Date.now(),
      attempt: 0,
    });
    const c = (await ctx.db.get(id))!;
    await audit(
      ctx,
      c,
      "invoice_ingested",
      "Synthetic invoice received; investigation started automatically.",
      "source-sync",
      "sync_job",
      true,
      "NEW",
      input.sources.map((s) => s.id),
    );
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.investigate,
      { caseId: id },
    );
    await ctx.db.patch(id, { workflowId });
  }
}
export const snapshot = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_identity", (q) =>
        q.eq("identity", identity.tokenIdentifier),
      )
      .unique();
    if (!p) return null;
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .order("desc")
      .take(40);
    const rows = await Promise.all(
      cases.map(async (c) => ({
        ...c,
        result: c.proposalId
          ? ((await ctx.db.get(c.proposalId))?.result ?? null)
          : null,
      })),
    );
    return {
      policyRuns: await ctx.db
        .query("policyRuns")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
        .order("desc")
        .take(20),
      profile: p,
      sandbox: await ctx.db.get(p.sandboxId),
      cases: rows,
      audit: await ctx.db
        .query("audit")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
        .order("desc")
        .take(150),
      policies: await ctx.db
        .query("policies")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
        .order("desc")
        .take(30),
      precedents: await ctx.db
        .query("precedents")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
        .take(30),
      journals: await ctx.db
        .query("journals")
        .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
        .order("desc")
        .take(80),
    };
  },
});
export const setRole = mutation({
  args: { role: humanRole },
  returns: receipt,
  handler: async (ctx, args) => {
    const p = await profile(ctx);
    await ctx.db.patch(p._id, { role: args.role });
    await ctx.db.insert("audit", {
      sandboxId: p.sandboxId,
      timestamp: Date.now(),
      actor: p.identity,
      role: args.role,
      action: "simulation_role_changed",
      allowed: true,
      before: p.role,
      after: args.role,
      reason: "Explicit simulated role selection; identity is unchanged.",
      evidenceIds: [],
    });
    return { ok: true, message: "Simulation role updated." };
  },
});
export const setMode = mutation({
  args: { mode },
  returns: receipt,
  handler: async (ctx, args) => {
    const p = await profile(ctx);
    await ctx.db.patch(p.sandboxId, { mode: args.mode });
    return {
      ok: true,
      message: `New cases use ${args.mode === "creao" ? "CREAO" : "deterministic simulation"}.`,
    };
  },
});
export const inject = mutation({
  args: { input: invoiceInput },
  returns: v.id("cases"),
  handler: async (ctx, args) => {
    const p = await profile(ctx);
    const input = inputSchema.parse(args.input);
    const old = await ctx.db
      .query("cases")
      .withIndex("by_sandboxId_and_code", (q) =>
        q.eq("sandboxId", p.sandboxId).eq("input.code", input.code),
      )
      .unique();
    if (old) {
      await audit(
        ctx,
        old,
        "duplicate_ingestion_prevented",
        "Existing source identifier retained; use a new invoice identifier for changed inputs.",
        p.identity,
        p.role,
      );
      return old._id;
    }
    const all = await ctx.db
      .query("cases")
      .withIndex("by_sandboxId", (q) => q.eq("sandboxId", p.sandboxId))
      .take(40);
    if (all.length >= 40)
      throw new Error(
        "This simulation supports 40 cases. Start a fresh simulation to continue.",
      );
    const sandbox = (await ctx.db.get(p.sandboxId))!;
    const id = await ctx.db.insert("cases", {
      sandboxId: p.sandboxId,
      input,
      revision: 1,
      state: "NEW",
      phase: "Invoice received",
      mode: sandbox.mode,
      updatedAt: Date.now(),
      attempt: 0,
    });
    const c = (await ctx.db.get(id))!;
    await audit(
      ctx,
      c,
      "invoice_ingested",
      "Scenario source records received.",
      "source-sync",
      "sync_job",
      true,
      "NEW",
      input.sources.map((s) => s.id),
    );
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.investigate,
      { caseId: id },
    );
    await ctx.db.patch(id, { workflowId });
    return id;
  },
});
export const reset = mutation({
  args: {},
  returns: receipt,
  handler: async (ctx) => {
    const p = await profile(ctx);
    const old = (await ctx.db.get(p.sandboxId))!;
    await ctx.db.patch(old._id, { archived: true });
    const sandboxId = await ctx.db.insert("sandboxes", {
      owner: p.identity,
      generation: old.generation + 1,
      mode: "deterministic",
      archived: false,
      createdAt: Date.now(),
    });
    await ctx.db.patch(p._id, { sandboxId });
    await seed(ctx, sandboxId);
    return {
      ok: true,
      message:
        "Fresh simulation created. Previous records and audit history were archived, not deleted.",
    };
  },
});
