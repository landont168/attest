export const TEAM_ID = "134865";
export const SOURCE_URL = "https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=134865";
export const MAX_TRACKED = 10;

function text(value, required = false) {
  if (value == null || value === "") {
    if (required) throw new Error("Required source field missing.");
    return null;
  }
  if (typeof value !== "string" || value.length > 200) throw new Error("Invalid source field.");
  return value;
}
export function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid event.");
  if (raw.idLeague !== "4387" || (raw.idHomeTeam !== TEAM_ID && raw.idAwayTeam !== TEAM_ID)) throw new Error("Event outside Warriors NBA scope.");
  if (!/^\d{1,12}$/.test(raw.idEvent ?? "")) throw new Error("Invalid event identifier.");
  const date = text(raw.dateEvent, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Invalid event date.");
  const time = text(raw.strTime);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) throw new Error("Invalid UTC event time.");
  const sourceStatus = text(raw.strStatus);
  const status = raw.strPostponed === "yes" || sourceStatus === "PST" ? "postponed"
    : ["CANC", "Cancelled", "Canceled"].includes(sourceStatus) ? "cancelled"
    : ["FT", "AOT"].includes(sourceStatus) ? "completed"
    : sourceStatus === "NS" ? "scheduled"
    : ["1Q", "2Q", "3Q", "4Q", "HT", "OT"].includes(sourceStatus) ? "live" : "unknown";
  return {
    externalId: raw.idEvent,
    sourceUrl: `https://www.thesportsdb.com/event/${raw.idEvent}`,
    dateUtc: date,
    startsAtUtc: time ? `${date}T${time}Z` : null,
    homeTeam: text(raw.strHomeTeam, true),
    awayTeam: text(raw.strAwayTeam, true),
    venue: text(raw.strVenue),
    city: text(raw.strCity),
    country: text(raw.strCountry),
    status,
    sourceStatus,
  };
}
export function validateInput(input) {
  if (!input || input.schemaVersion !== 1 || Object.keys(input).some(k => !["schemaVersion", "trackedEventIds", "requestKey"].includes(k))) throw new Error("Expected schemaVersion and trackedEventIds only.");
  if (typeof input.requestKey !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(input.requestKey)) throw new Error("Invalid request key.");
  const ids = input.trackedEventIds ?? [];
  if (!Array.isArray(ids) || ids.length > MAX_TRACKED || ids.some(id => typeof id !== "string" || !/^\d{1,12}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error("Invalid tracked event identifiers.");
  return { schemaVersion: 1, trackedEventIds: ids, requestKey: input.requestKey };
}
export function recordFromRaw(raw) {
  // Retain the exact data fields used for normalization; omit artwork and unrelated descriptions.
  const fields = ["idEvent", "idLeague", "idHomeTeam", "idAwayTeam", "dateEvent", "strTime", "strHomeTeam", "strAwayTeam", "strVenue", "strCity", "strCountry", "strStatus", "strPostponed"];
  const source = Object.fromEntries(fields.map(k => [k, raw[k] ?? null]));
  return { ...normalizeEvent(source), rawJson: JSON.stringify(source) };
}
