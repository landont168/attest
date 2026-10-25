import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  LEARNING_VENDOR,
  LEARNING_VENDOR_ID,
  type LearningContext,
} from "../src/lib/finance/learning";
import { internal } from "./_generated/api";

export async function activeVendorPolicy(
  ctx: QueryCtx | MutationCtx,
  sandboxId: Id<"sandboxes">,
) {
  return await ctx.db
    .query("policies")
    .withIndex("by_sandboxId_and_vendor_and_status", (q) =>
      q
        .eq("sandboxId", sandboxId)
        .eq("vendor", LEARNING_VENDOR)
        .eq("status", "active"),
    )
    .unique();
}
export async function learningContext(
  ctx: QueryCtx | MutationCtx,
  sandboxId: Id<"sandboxes">,
  correctionId?: Id<"corrections">,
) {
  const baseline = await activeVendorPolicy(ctx, sandboxId);
  const precedents = await ctx.db
    .query("precedents")
    .withIndex("by_sandboxId_and_vendor_and_active", (q) =>
      q
        .eq("sandboxId", sandboxId)
        .eq("vendor", LEARNING_VENDOR)
        .eq("active", true),
    )
    .order("desc")
    .take(30);
  const counterexamples = await ctx.db
    .query("precedents")
    .withIndex("by_sandboxId_and_vendor_and_active", (q) =>
      q
        .eq("sandboxId", sandboxId)
        .eq("vendor", LEARNING_VENDOR)
        .eq("active", false),
    )
    .order("desc")
    .take(10);
  const correction = correctionId ? await ctx.db.get(correctionId) : null;
  if (
    correctionId &&
    (!correction ||
      correction.sandboxId !== sandboxId ||
      !precedents.some((p) => p.correctionId === correctionId))
  )
    throw new Error("An accepted correction in this sandbox is required.");
  const context: LearningContext = {
    schemaVersion: 1,
    vendorId: LEARNING_VENDOR_ID,
    currentPolicy: baseline
      ? {
          version: baseline.version,
          procedure: baseline.procedure,
          description: baseline.description,
        }
      : null,
    precedents: [...precedents, ...counterexamples].map((p) => ({
      code: p.code,
      vendor: p.vendor,
      date: p.date,
      title: p.title,
      explanation: p.explanation,
      active: p.active,
      synthetic: p.synthetic ?? true,
    })),
    corrections: correction
      ? [
          {
            code: correction.code,
            kind: correction.kind,
            explanation: correction.explanation,
            sourceIds: correction.sourceIds,
            sources: correction.sources,
          },
        ]
      : [],
  };
  return { context, baseline, correction };
}
export async function learningAudit(
  ctx: MutationCtx,
  sandboxId: Id<"sandboxes">,
  action: string,
  reason: string,
  before: string,
  after: string,
  refs: {
    jobId?: Id<"policyRuns">;
    policyId?: Id<"policies">;
    correctionId?: Id<"corrections">;
    caseId?: Id<"cases">;
  } = {},
  actor = "attest-policy-learner",
  role: Doc<"audit">["role"] = "ai_agent",
  allowed = true,
  evidenceIds: string[] = [],
) {
  await ctx.db.insert("audit", {
    sandboxId,
    timestamp: Date.now(),
    actor,
    role,
    action,
    allowed,
    before,
    after,
    reason,
    evidenceIds,
    changes: [{ field: "status", before, after }],
    ...(refs.jobId ? { learningJobId: refs.jobId } : {}),
    ...(refs.policyId ? { policyId: refs.policyId } : {}),
    ...(refs.correctionId ? { correctionId: refs.correctionId } : {}),
    ...(refs.caseId ? { caseId: refs.caseId } : {}),
  });
}
export async function createLearningJob(
  ctx: MutationCtx,
  sandboxId: Id<"sandboxes">,
  correctionId?: Id<"corrections">,
  retryOf?: Id<"policyRuns">,
) {
  if (retryOf) {
    const existing = await ctx.db
      .query("policyRuns")
      .withIndex("by_retryOf", (q) => q.eq("retryOf", retryOf))
      .unique();
    if (existing) return existing._id;
  } else if (correctionId) {
    const existing = await ctx.db
      .query("policyRuns")
      .withIndex("by_correctionId", (q) => q.eq("correctionId", correctionId))
      .order("desc")
      .first();
    if (existing) return existing._id;
  }
  const sandbox = await ctx.db.get(sandboxId);
  if (!sandbox || sandbox.archived)
    throw new Error("Archived simulations cannot learn.");
  const { context, baseline, correction } = await learningContext(
    ctx,
    sandboxId,
    correctionId,
  );
  const jobId = await ctx.db.insert("policyRuns", {
    sandboxId,
    mode: sandbox.mode,
    status: "queued",
    createdAt: Date.now(),
    contextJson: JSON.stringify(context),
    ...(retryOf ? { retryOf } : {}),
    ...(baseline ? { baselinePolicyId: baseline._id } : {}),
    ...(correction
      ? { correctionId: correction._id, caseId: correction.caseId }
      : {}),
  });
  await learningAudit(
    ctx,
    sandboxId,
    "learning_queued",
    "Evidence-backed policy investigation queued.",
    "none",
    "queued",
    { jobId, correctionId },
  );
  await ctx.scheduler.runAfter(0, internal.policies.launch, { jobId });
  return jobId;
}
