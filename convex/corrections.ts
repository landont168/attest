import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { reconcile } from "../src/lib/finance/engine";
import {
  validCorrectionSources,
  LEARNING_VENDOR,
} from "../src/lib/finance/learning";
import { createLearningJob, learningAudit } from "./learningRecords";

export const accept = internalMutation({
  args: { proposalId: v.id("proposals"), approvalId: v.id("approvals") },
  returns: v.null(),
  handler: async (ctx, { proposalId, approvalId }) => {
    const proposal = await ctx.db.get(proposalId),
      approval = await ctx.db.get(approvalId);
    if (
      !proposal?.correctionId ||
      !approval ||
      approval.proposalId !== proposalId ||
      approval.caseId !== proposal.caseId ||
      approval.revision !== proposal.revision ||
      approval.decision !== "approved" ||
      !["human_accountant", "human_controller"].includes(approval.role) ||
      approval.actor === proposal.proposedBy
    )
      return null;
    const correction = await ctx.db.get(proposal.correctionId);
    if (
      !correction ||
      correction.sandboxId !== proposal.sandboxId ||
      correction.responseRevision !== proposal.revision ||
      !validCorrectionSources(correction.originalInput, correction.sourceIds)
    )
      return null;
    const result = reconcile(proposal.input);
    if (
      result.expectedCents === null ||
      result.expectedCents !== proposal.result.expectedCents ||
      result.invoiceCents !== proposal.result.invoiceCents ||
      result.differenceCents !== proposal.result.differenceCents ||
      result.disposition !== proposal.result.disposition ||
      proposal.result.disposition === "needs_info"
    )
      return null;
    const existing = await ctx.db
      .query("precedents")
      .withIndex("by_correctionId", (q) => q.eq("correctionId", correction._id))
      .unique();
    if (!existing) {
      await ctx.db.insert("precedents", {
        sandboxId: proposal.sandboxId,
        code: `PREC-${correction.code}`,
        vendor: LEARNING_VENDOR,
        date: proposal.input.invoiceDate,
        title: "Accepted overlooked signed schedule correction",
        explanation: correction.explanation,
        active: true,
        synthetic: true,
        correctionId: correction._id,
        proposalId,
        approvalId,
      });
      await learningAudit(
        ctx,
        proposal.sandboxId,
        "correction_accepted",
        "Validated revised proposal approved; correction became an eligible precedent.",
        "recorded",
        "accepted",
        { correctionId: correction._id, caseId: proposal.caseId },
        approval.actor,
        approval.role,
        true,
        correction.sourceIds,
      );
    }
    await createLearningJob(ctx, proposal.sandboxId, correction._id);
    return null;
  },
});
