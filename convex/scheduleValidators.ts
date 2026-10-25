import { v } from "convex/values";
const nullableText = v.union(v.string(), v.null());
export const eventData = v.object({
  externalId: v.string(),
  sourceUrl: v.string(),
  dateUtc: v.string(),
  startsAtUtc: nullableText,
  homeTeam: v.string(),
  awayTeam: v.string(),
  venue: nullableText,
  city: nullableText,
  country: nullableText,
  status: v.union(
    v.literal("scheduled"),
    v.literal("live"),
    v.literal("completed"),
    v.literal("postponed"),
    v.literal("cancelled"),
    v.literal("unknown"),
  ),
  sourceStatus: nullableText,
});
export const tripSnapshot = v.object({
  revision: v.number(),
  invoiceCode: v.string(),
  contractId: v.string(),
  vendorId: v.string(),
  destination: v.string(),
  start: v.string(),
  end: v.string(),
});
export const change = v.object({
  field: v.string(),
  before: v.string(),
  after: v.string(),
});
export const syncStatus = v.union(
  v.literal("queued"),
  v.literal("submitting"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("uncertain"),
);
