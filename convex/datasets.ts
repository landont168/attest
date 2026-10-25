import { v } from "convex/values";
import { mutation, env, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { workflow } from "./workflows";
import { ensureOrganization } from "./team";
import { denyWorkspaceAction, profile } from "./lib";
import {
  datasetCases,
  type Dataset,
  type DatasetCase,
} from "../src/lib/simulation/datasets";
import { reconcile, payableJournal } from "../src/lib/finance/engine";
import { applySettlement, paymentFinding } from "../src/lib/finance/settlement";
import { receipt } from "./validators";

const datasetValidator = v.union(
  v.literal("demo"),
  v.literal("history"),
  v.literal("evaluation"),
);
export function requireDatasetTarget() {
  if (env.ATTEST_HOSTED_DEMO === "true") return;
  let host = "";
  try {
    host = new URL(env.CONVEX_CLOUD_URL ?? "").hostname;
  } catch {}
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
    throw new Error(
      "Dataset seed/reset requires a local development backend or an explicitly enabled hosted demo.",
    );
}
async function seedCase(
  ctx: MutationCtx,
  sandboxId: Id<"sandboxes">,
  fixture: DatasetCase,
) {
  const { input, bank, credits, history } = fixture;
  const old = await ctx.db
    .query("cases")
    .withIndex("by_sandboxId_and_code", (q) =>
      q.eq("sandboxId", sandboxId).eq("input.code", input.code),
    )
    .unique();
  if (old) return old._id;
  for (const payment of bank)
    await ctx.db.insert("bankRecords", { sandboxId, ...payment });
  for (const credit of credits)
    await ctx.db.insert("paymentCredits", { sandboxId, ...credit });
  const month = input.end.slice(0, 7);
  if (
    !(await ctx.db
      .query("periods")
      .withIndex("by_sandboxId_and_month", (q) =>
        q.eq("sandboxId", sandboxId).eq("month", month),
      )
      .unique())
  )
    await ctx.db.insert("periods", { sandboxId, month, closed: false });
  const timestamp = history
    ? Date.parse(`${history.date}T16:00:00Z`)
    : Date.now();
  const result = history
    ? applySettlement(
        input,
        reconcile(input),
        paymentFinding(input, bank, credits),
      )
    : null;
  const state =
    history?.decision === "rejected"
      ? "REJECTED"
      : history?.decision === "needs_info"
        ? "NEEDS_INFO"
        : history
          ? result?.disposition === "matched"
            ? "POSTED"
            : "APPROVED"
          : "NEW";
  const caseId = await ctx.db.insert("cases", {
    sandboxId,
    input,
    revision: 1,
    state,
    phase: `${history ? "Synthetic history" : "Synthetic scenario"} · ${fixture.label}`,
    mode: "deterministic",
    updatedAt: timestamp,
    attempt: 0,
    ownerActorId: history ? "synthetic-history:ap" : "attest-investigator",
  });
  if (history && result) {
    if (
      (history.decision === "needs_info") !==
      (result.disposition === "needs_info")
    )
      throw new Error(
        `Historical decision contradicts source validation: ${input.code}`,
      );
    const proposedBy = "synthetic-history:ap",
      actor = "synthetic-history:controller";
    const proposalId = await ctx.db.insert("proposals", {
      sandboxId,
      caseId,
      revision: 1,
      attempt: 0,
      createdAt: timestamp - 3600000,
      proposedBy,
      result,
      input,
      mode: "deterministic",
    });
    await ctx.db.patch(caseId, { proposalId });
    const approvalId = await ctx.db.insert("approvals", {
      caseId,
      proposalId,
      revision: 1,
      action:
        history.decision === "approved"
          ? "approve"
          : history.decision === "rejected"
            ? "reject"
            : "ask",
      decision: history.decision,
      actor,
      role: "human_controller",
      reason: history.reason,
      createdAt: timestamp,
    });
    if (state === "POSTED")
      await ctx.db.insert("journals", {
        caseId,
        sandboxId,
        reference: `SYNTHETIC-HISTORY:${input.code}`,
        proposalId,
        approvalId,
        lines: payableJournal(result.expectedCents!, result.depositCents ?? 0),
        period: month,
        createdAt: timestamp,
        reason:
          "Imported synthetic historical journal; not a newly executed agent posting.",
      });
    await ctx.db.insert("audit", {
      sandboxId,
      caseId,
      proposalId,
      approvalId,
      timestamp,
      actor,
      role: "human_controller",
      action: "synthetic_historical_decision",
      allowed: history.decision === "approved",
      before: "Synthetic historical proposal",
      after: state,
      reason: history.reason,
      evidenceIds: result.evidenceIds,
    });
    if (state === "NEEDS_INFO")
      await ctx.db.insert("questions", {
        caseId,
        text: result.issues.join(" "),
        createdAt: timestamp,
        requiredRole: "human_controller",
        status: "open",
        evidenceKind: "note",
        assignedActorId: `staff:${sandboxId}:financial-controller`,
      });
  } else {
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.investigate,
      { caseId },
    );
    await ctx.db.patch(caseId, { workflowId });
  }
  await ctx.db.insert("audit", {
    sandboxId,
    caseId,
    timestamp: Date.now(),
    actor: "dataset-seed",
    role: "sync_job",
    action: history
      ? "synthetic_history_imported"
      : "synthetic_scenario_seeded",
    allowed: true,
    before: "Not loaded",
    after: state,
    reason: `${fixture.label}. ${history ? "Imported synthetic historical records; no agent execution is claimed." : "Synthetic January/February 2027 future scenario relative to October 2026; deterministic workflow queued."}`,
    evidenceIds: input.sources.map((s) => s.id),
  });
  return caseId;
}
export async function selectDataset(
  ctx: MutationCtx,
  dataset: Dataset,
  reset = false,
): Promise<{ ok: boolean; message: string }> {
  requireDatasetTarget();
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in first.");
  const existingProfile = await ctx.db
    .query("profiles")
    .withIndex("by_identity", (q) => q.eq("identity", identity.tokenIdentifier))
    .unique();
  if (existingProfile) {
    const p = await profile(ctx);
    const denied = await denyWorkspaceAction(ctx, p, "configure");
    if (denied) return denied;
  }
  const matches = await ctx.db
    .query("sandboxes")
    .withIndex("by_owner_and_dataset", (q) =>
      q.eq("owner", identity.tokenIdentifier).eq("dataset", dataset),
    )
    .order("desc")
    .take(40);
  let sandbox = matches.find((s) => !s.archived);
  if (reset && sandbox) {
    await ctx.db.patch(sandbox._id, { archived: true });
    sandbox = undefined;
  }
  const sandboxId = sandbox
    ? sandbox._id
    : await ctx.db.insert("sandboxes", {
        owner: identity.tokenIdentifier,
        dataset,
        generation: (matches[0]?.generation ?? 0) + 1,
        teamVersion: 1,
        mode: "deterministic",
        archived: false,
        createdAt: Date.now(),
      });
  await ensureOrganization(ctx, sandboxId);
  for (const fixture of datasetCases(dataset))
    await seedCase(ctx, sandboxId, fixture);
  const role = existingProfile?.role ?? "human_accountant";
  const employees = await ctx.db
    .query("employees")
    .withIndex("by_sandboxId", (q) => q.eq("sandboxId", sandboxId))
    .take(20);
  const employeeId = employees.find(
    (e) => e.role === role && e.kind === "human",
  )!._id;
  if (existingProfile)
    await ctx.db.patch(existingProfile._id, { sandboxId, employeeId });
  else
    await ctx.db.insert("profiles", {
      identity: identity.tokenIdentifier,
      role,
      sandboxId,
      employeeId,
    });
  return {
    ok: true,
    message: `${dataset} dataset ready: ${datasetCases(dataset).length} cases.${reset ? " Previous generation archived; nothing deleted." : ""}`,
  };
}
export const select = mutation({
  args: { dataset: datasetValidator, reset: v.optional(v.boolean()) },
  returns: receipt,
  handler: async (ctx, args) => selectDataset(ctx, args.dataset, args.reset),
});
