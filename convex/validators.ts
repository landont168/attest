import { v } from "convex/values";
export const mode = v.union(v.literal("deterministic"), v.literal("creao"));
export const humanRole = v.union(
  v.literal("human_accountant"),
  v.literal("human_controller"),
  v.literal("travel_coordinator"),
  v.literal("vendor_manager"),
  v.literal("internal_auditor"),
);
export const role = v.union(
  humanRole,
  v.literal("ai_agent"),
  v.literal("contract_finance"),
  v.literal("payment_reconciliation"),
  v.literal("vendor_dispute"),
  v.literal("posting_gateway"),
  v.literal("sync_job"),
);
export const state = v.union(
  ...(
    [
      "NEW",
      "INVESTIGATING",
      "NEEDS_INFO",
      "PROPOSED",
      "APPROVED",
      "POSTED",
      "REJECTED",
      "REVISION_REQUIRED",
      "FAILED_RETRYABLE",
    ] as const
  ).map((s) => v.literal(s)),
);
export const source = v.object({
  id: v.string(),
  kind: v.union(
    ...(
      [
        "contract",
        "amendment",
        "service",
        "invoice",
        "communication",
        "resolution",
        "payment",
        "credit",
      ] as const
    ).map((s) => v.literal(s)),
  ),
  title: v.string(),
  date: v.string(),
  text: v.string(),
  clause: v.string(),
  signed: v.boolean(),
});
export const term = v.object({
  id: v.string(),
  sourceId: v.string(),
  contractId: v.string(),
  vendorId: v.string(),
  label: v.string(),
  quantity: v.number(),
  rateCents: v.number(),
  start: v.string(),
  end: v.string(),
  scope: v.union(
    v.literal("original"),
    v.literal("additional"),
    v.literal("supersede"),
  ),
  supersedes: v.array(v.string()),
});
export const invoiceInput = v.object({
  code: v.string(),
  vendor: v.string(),
  vendorId: v.string(),
  contractId: v.string(),
  destination: v.string(),
  start: v.string(),
  end: v.string(),
  invoiceDate: v.string(),
  currency: v.literal("USD"),
  unit: v.union(
    v.literal("room-night"),
    v.literal("flight-leg"),
    v.literal("trip"),
  ),
  lines: v.array(
    v.object({
      label: v.string(),
      quantity: v.number(),
      rateCents: v.number(),
    }),
  ),
  terms: v.array(term),
  service: v.object({
    sourceId: v.string(),
    vendorId: v.string(),
    contractId: v.string(),
    quantity: v.number(),
    confirmed: v.boolean(),
  }),
  sources: v.array(source),
  deposit: v.optional(
    v.object({
      transactionId: v.string(),
      amountCents: v.number(),
      bankSourceId: v.string(),
      creditSourceId: v.string(),
    }),
  ),
});
export const cohort = v.object({
  termId: v.string(),
  sourceId: v.string(),
  label: v.string(),
  quantity: v.number(),
  rateCents: v.number(),
  amountCents: v.number(),
});
export const result = v.object({
  disposition: v.union(
    v.literal("matched"),
    v.literal("disputed"),
    v.literal("needs_info"),
  ),
  invoiceCents: v.number(),
  expectedCents: v.union(v.number(), v.null()),
  differenceCents: v.union(v.number(), v.null()),
  cohorts: v.array(cohort),
  evidenceIds: v.array(v.string()),
  explanation: v.string(),
  issues: v.array(v.string()),
  depositCents: v.optional(v.number()),
  invoiceOutstandingCents: v.optional(v.union(v.number(), v.null())),
  remainingDueCents: v.optional(v.union(v.number(), v.null())),
});
export const line = v.object({
  account: v.string(),
  debitCents: v.number(),
  creditCents: v.number(),
});
export const receipt = v.object({ ok: v.boolean(), message: v.string() });
