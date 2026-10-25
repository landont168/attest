import { v } from "convex/values";

export const retrievalTarget = v.union(
  v.object({
    kind: v.literal("case"),
    caseId: v.id("cases"),
    attempt: v.number(),
    revision: v.number(),
  }),
  v.object({ kind: v.literal("policy"), jobId: v.id("policyRuns") }),
);
export const retrievalDocument = v.object({
  id: v.string(),
  kind: v.union(v.literal("precedent"), v.literal("source")),
  code: v.string(),
  title: v.string(),
  text: v.string(),
  version: v.string(),
  synthetic: v.boolean(),
});
export const retrievalHit = v.object({ id: v.string(), score: v.number() });
export const retrievalOutcome = v.union(
  v.literal("moss"),
  v.literal("disabled"),
  v.literal("unavailable"),
  v.literal("empty"),
);
