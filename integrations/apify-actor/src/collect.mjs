import { SOURCE_URL, validateInput, recordFromRaw } from "./normalize.mjs";

export async function collect(input, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const { trackedEventIds, requestKey } = validateInput(input);
  const records = new Map();
  const missingTrackedIds = [];
  async function read(url) {
    const r = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Schedule source returned HTTP ${r.status}.`);
    const body = await r.text();
    if (body.length > 250000) throw new Error("Schedule source response too large.");
    const data = JSON.parse(body);
    if (!data || !Object.hasOwn(data, "events") || !(data.events === null || Array.isArray(data.events))) throw new Error("Source did not return an event list.");
    if ((data.events?.length ?? 0) > 20) throw new Error("Source exceeded the supported window.");
    return data.events ?? [];
  }
  const next = await read(SOURCE_URL);
  for (const raw of next) {
    const record = recordFromRaw(raw);
    if (records.has(record.externalId)) throw new Error("Duplicate source event.");
    records.set(record.externalId, record);
  }
  for (const id of trackedEventIds) {
    if (records.has(id)) continue;
    await pause(2100);
    const rows = await read(`https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id=${id}`);
    if (!rows.length) { missingTrackedIds.push(id); continue; }
    if (rows.length !== 1 || rows[0].idEvent !== id) throw new Error("Tracked event lookup returned a different identifier.");
    records.set(id, recordFromRaw(rows[0]));
  }
  if (records.size > 20) throw new Error("Combined event window exceeded.");
  return {
    schemaVersion: 1, requestKey, source: "thesportsdb", teamId: "134865", coverage: "limited_next_and_tracked",
    sourceUrl: SOURCE_URL, observedAt: new Date().toISOString(),
    events: [...records.values()], missingTrackedIds,
  };
}
