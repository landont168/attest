import { v } from "convex/values";
export const mode = v.union(v.literal("deterministic"), v.literal("creao"));
export const humanRole = v.union(
  v.literal("human_accountant"),
  v.literal("human_controller"),
);
export const role = v.union(
  humanRole,
  v.literal("ai_agent"),
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
  unit: v.literal("room-night"),
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
});
export const line = v.object({
  account: v.string(),
  debitCents: v.number(),
  creditCents: v.number(),
});
export const receipt = v.object({ ok: v.boolean(), message: v.string() });
