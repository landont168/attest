import { z } from "zod";
import {
  normalizeEvent,
  SOURCE_URL,
} from "../../../integrations/apify-actor/src/normalize.mjs";

export const eventDataSchema = z
  .object({
    externalId: z.string().regex(/^\d{1,12}$/),
    sourceUrl: z.string().max(150),
    dateUtc: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startsAtUtc: z.string().max(30).nullable(),
    homeTeam: z.string().min(1).max(200),
    awayTeam: z.string().min(1).max(200),
    venue: z.string().max(200).nullable(),
    city: z.string().max(200).nullable(),
    country: z.string().max(200).nullable(),
    status: z.enum([
      "scheduled",
      "live",
      "completed",
      "postponed",
      "cancelled",
      "unknown",
    ]),
    sourceStatus: z.string().max(200).nullable(),
  })
  .strict();
export type EventData = z.infer<typeof eventDataSchema>;
export const batchSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestKey: z.string().max(100),
    source: z.literal("thesportsdb"),
    teamId: z.literal("134865"),
    coverage: z.literal("limited_next_and_tracked"),
    sourceUrl: z.literal(SOURCE_URL),
    observedAt: z.iso.datetime(),
    missingTrackedIds: z.array(z.string().regex(/^\d{1,12}$/)).max(10),
    events: z
      .array(eventDataSchema.extend({ rawJson: z.string().max(12000) }))
      .max(20),
  })
  .strict();
export function validateBatch(
  value: unknown,
  requestKey: string,
  tracked: string[],
  requestedAt: number,
  now: number,
) {
  const batch = batchSchema.parse(value);
  const timestamp = Date.parse(batch.observedAt);
  if (
    batch.requestKey !== requestKey ||
    timestamp < requestedAt - 60000 ||
    timestamp > now + 60000
  )
    throw new Error("Stale or mismatched source observation.");
  const seen = new Set<string>();
  for (const { rawJson, ...event } of batch.events) {
    if (seen.has(event.externalId))
      throw new Error("Duplicate event identifier.");
    seen.add(event.externalId);
    const normalized = normalizeEvent(JSON.parse(rawJson));
    for (const key of Object.keys(event) as (keyof EventData)[]) {
      if (normalized[key] !== event[key])
        throw new Error("Normalized event does not match its source fields.");
    }
  }
  const missing = new Set(batch.missingTrackedIds);
  if (
    missing.size !== batch.missingTrackedIds.length ||
    [...missing].some((id) => !tracked.includes(id) || seen.has(id)) ||
    tracked.some((id) => !seen.has(id) && !missing.has(id))
  )
    throw new Error("Tracked event coverage is inconsistent.");
  return batch;
}
export function materialChanges(before: EventData, after: EventData) {
  const keys = [
    "dateUtc",
    "startsAtUtc",
    "homeTeam",
    "awayTeam",
    "venue",
    "city",
    "country",
  ] as const;
  const changes = keys
    .filter((key) => before[key] !== after[key])
    .map((key) => ({
      field: key as string,
      before: before[key] ?? "unknown",
      after: after[key] ?? "unknown",
    }));
  if (
    before.status !== after.status &&
    (["cancelled", "postponed"].includes(before.status) ||
      ["cancelled", "postponed"].includes(after.status))
  )
    changes.push({
      field: "status",
      before: before.status,
      after: after.status,
    });
  return changes;
}
export function sameEvent(a: EventData, b: EventData) {
  return (Object.keys(a) as (keyof EventData)[]).every((k) => a[k] === b[k]);
}

export class ApifyHttpError extends Error {
  constructor(public status: number) {
    super(`Apify returned HTTP ${status}.`);
  }
}
export async function apifyRequest(
  token: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const r = await fetch(`https://api.apify.com/v2/${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new ApifyHttpError(r.status);
  const text = await r.text();
  if (text.length > 400000) throw new Error("Apify response too large.");
  return JSON.parse(text);
}
export const runSchema = z.object({
  data: z.object({
    id: z.string().regex(/^[a-zA-Z0-9]{1,50}$/),
    actId: z.string(),
    status: z.string(),
    defaultDatasetId: z.string().regex(/^[a-zA-Z0-9]{1,50}$/),
    defaultKeyValueStoreId: z.string().regex(/^[a-zA-Z0-9]{1,50}$/),
    buildId: z.string(),
  }),
});
