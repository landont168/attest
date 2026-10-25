import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import schema from "./schema";
import { readCaseDetail } from "./cases";

export type CaseRouteResult =
  | {
      status: "available";
      detail: Awaited<ReturnType<typeof readCaseDetail>>;
      sandboxId: Id<"sandboxes">;
    }
  | { status: "other_dataset"; dataset: "demo" | "history" | "evaluation" }
  | { status: "archived" }
  | { status: "unavailable" };

// Resolve a browser URL without assuming it is a valid case ID or exposing
// another workspace's financial records. Detailed case queries stay scoped to
// the active workspace; this query only supplies recovery context for old links.
export const resolve = query({
  args: { id: v.string() },
  returns: v.union(
    v.object({
      status: v.literal("available"),
      detail: v.object({
        case: schema.doc("cases"),
        subtasks: v.array(schema.doc("subtasks")),
        disputes: v.array(schema.doc("disputes")),
        proposals: v.array(schema.doc("proposals")),
        audit: v.array(schema.doc("audit")),
        approvals: v.array(schema.doc("approvals")),
        questions: v.array(schema.doc("questions")),
        journals: v.array(schema.doc("journals")),
        corrections: v.array(schema.doc("corrections")),
        runs: v.array(schema.doc("runs")),
      }),
      sandboxId: v.id("sandboxes"),
    }),
    v.object({
      status: v.literal("other_dataset"),
      dataset: v.union(
        v.literal("demo"),
        v.literal("history"),
        v.literal("evaluation"),
      ),
    }),
    v.object({ status: v.literal("archived") }),
    v.object({ status: v.literal("unavailable") }),
  ),
  handler: async (ctx, { id }): Promise<CaseRouteResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { status: "unavailable" };
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_identity", (q) =>
        q.eq("identity", identity.tokenIdentifier),
      )
      .unique();
    if (!profile) return { status: "unavailable" };

    const caseId = ctx.db.normalizeId("cases", id);
    if (!caseId) return { status: "unavailable" };
    const c = await ctx.db.get(caseId);
    if (!c) return { status: "unavailable" };
    const sandbox = await ctx.db.get(c.sandboxId);
    if (!sandbox || sandbox.owner !== identity.tokenIdentifier)
      return { status: "unavailable" };
    if (sandbox.archived) return { status: "archived" };
    if (profile.sandboxId === sandbox._id)
      return {
        status: "available",
        detail: await readCaseDetail(ctx, c),
        sandboxId: sandbox._id,
      };
    if (sandbox.dataset)
      return { status: "other_dataset", dataset: sandbox.dataset };
    return { status: "unavailable" };
  },
});
