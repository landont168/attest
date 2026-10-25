"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { Snapshot } from "@/lib/view-types";
import type { Notify } from "./attest-app";
import { Button } from "./ui/button";
import { Empty, Notice, Panel, SectionTitle, Status } from "./primitives";

type EventRow = Doc<"scheduleEvents"> & {
  revision: Doc<"scheduleRevisions"> | null;
};
type Feed = {
  configured: boolean;
  canSync: boolean;
  canReview: boolean;
  events: EventRow[];
  jobs: Doc<"scheduleSyncs">[];
  links: Doc<"scheduleLinks">[];
  reviews: Doc<"scheduleReviews">[];
};
function History({ id }: { id: Id<"scheduleEvents"> }) {
  const history = useQuery(api.schedules.history, { eventId: id }) as
    | { revision: Doc<"scheduleRevisions">; job: Doc<"scheduleSyncs"> }[]
    | undefined;
  return (
    <div>
      {history?.map(({ revision: r, job }) => (
        <article className="source-article schedule-entry" key={r._id}>
          <strong>
            Version {r.version} · {r.data.dateUtc} ·{" "}
            {r.data.venue ?? "Venue unknown"}
          </strong>
          <p>
            {r.data.startsAtUtc ?? "Time not supplied"} · {r.data.status} ·
            Observed {r.observedAt}
          </p>
          <p className="small muted">
            Apify run: {job.runId ?? "Unavailable"} · Build:{" "}
            {job.buildId ?? "Unavailable"}
          </p>
          <details>
            <summary>Source fields used for normalization</summary>
            <pre className="schedule-json">
              {JSON.stringify(JSON.parse(r.rawJson), null, 2)}
            </pre>
          </details>
        </article>
      ))}
    </div>
  );
}
export function EventSchedules({
  snapshot,
  notify,
  caseId,
}: {
  snapshot: Snapshot;
  notify: Notify;
  caseId?: Id<"cases">;
}) {
  const feed = useQuery(api.schedules.list, caseId ? { caseId } : {}) as
    Feed | undefined;
  const sync = useMutation(api.schedules.requestSync),
    link = useMutation(api.schedules.link),
    review = useMutation(api.schedules.review),
    resume = useMutation(api.schedules.resumeSync);
  const [busy, setBusy] = useState(false),
    [eventId, setEventId] = useState(""),
    [selectedCase, setCase] = useState(caseId ?? ""),
    [reason, setReason] = useState(""),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({}),
    [runId, setRunId] = useState("");
  const [history, setHistory] = useState<Id<"scheduleEvents"> | null>(null);
  const act = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      notify(r.message, r.ok);
      if (r.ok) setReason("");
    } catch {
      notify(
        "This operation could not complete. Refresh and check the recorded status.",
        false,
      );
    } finally {
      setBusy(false);
    }
  };
  if (!feed) return <p className="muted">Loading public event evidence…</p>;
  const selectedEvent = feed.events.find((event) => event._id === eventId);
  const selectedBooking = snapshot.cases.find((c) => c._id === selectedCase);
  const latest = feed.jobs[0];
  const active =
    latest &&
    ["queued", "submitting", "running", "uncertain"].includes(latest.status);
  return (
    <>
      {!caseId && (
        <SectionTitle
          eyebrow="OPERATIONAL EVIDENCE"
          title="Event schedules"
          description="Public schedule observations linked to synthetic trips and contract cases."
          action={
            <Button
              disabled={busy || !feed.configured || !feed.canSync || !!active}
              onClick={() => void act(() => sync({}))}
            >
              Sync with Apify
            </Button>
          }
        />
      )}
      <Notice>
        Data from{" "}
        <a href="https://www.thesportsdb.com" target="_blank" rel="noreferrer">
          TheSportsDB
        </a>{" "}
        via Apify. This limited feed may be delayed or incomplete. Public events
        support booking review; signed agreements and confirmed services
        determine financial amounts.
      </Notice>
      {!feed.configured && (
        <p className="small muted">
          Apify is not configured. No live schedule collection has run.
          Configure the server token and saved Actor ID in Integrations.
        </p>
      )}
      {!caseId && latest && (
        <Panel
          title="Latest schedule sync"
          meta={<Status state={latest.status} />}
        >
          <div className="panel-body">
            <p>
              {latest.status === "completed"
                ? `${latest.imported ?? 0} new events · ${latest.changed ?? 0} revised · ${latest.stale ?? 0} older observations ignored`
                : (latest.error ??
                  "Waiting for the saved Actor run to finish.")}
            </p>
            <p className="small muted">
              Requested {new Date(latest.requestedAt).toLocaleString()}{" "}
              {latest.observedAt && `· Source observed ${latest.observedAt}`}
            </p>
            {latest.runId && (
              <a
                href={`https://console.apify.com/actors/runs/${latest.runId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open Apify run
              </a>
            )}
            {!!latest.missingTrackedIds?.length && (
              <p>
                Unavailable tracked events:{" "}
                {latest.missingTrackedIds.join(", ")}. Previous records are
                retained; cancellation is not inferred.
              </p>
            )}
            {["failed", "uncertain"].includes(latest.status) &&
              !latest.terminalFailure &&
              feed.canSync && (
                <div className="schedule-controls">
                  {!latest.buildId && (
                    <label>
                      Run ID from Apify
                      <input
                        value={runId}
                        onChange={(e) => setRunId(e.target.value)}
                        placeholder="Verify the request key in the run input"
                      />
                    </label>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy || (!latest.runId && !runId.trim())}
                    onClick={() =>
                      void act(() =>
                        resume({
                          jobId: latest._id,
                          ...(!latest.buildId && runId.trim()
                            ? { runId: runId.trim() }
                            : {}),
                        }),
                      )
                    }
                  >
                    Resume existing run
                  </Button>
                </div>
              )}
          </div>
        </Panel>
      )}
      {feed.reviews.length > 0 && (
        <Panel
          title={
            caseId ? "Schedule reviews for this case" : "Open booking reviews"
          }
          meta={
            <span className="small muted">{feed.reviews.length} shown</span>
          }
        >
          {feed.reviews.map((r) => (
            <article className="source-article schedule-entry" key={r._id}>
              <div className="row-between">
                <Link href={`/work/${r.caseId}`}>
                  {r.trip.invoiceCode} · {r.trip.destination}
                </Link>
                <Status state={r.status} />
              </div>
              <p>{r.reason}</p>
              <p className="small muted">
                Contract {r.trip.contractId} · Booking {r.trip.start} to{" "}
                {r.trip.end} · Case revision {r.trip.revision}
              </p>
              {r.changes.map((c) => (
                <p key={c.field}>
                  <strong>{c.field}:</strong> {c.before} → {c.after}
                </p>
              ))}
              {r.status === "reviewed" ? (
                <p>Review note: {r.resolution}</p>
              ) : (
                feed.canReview && (
                  <div className="schedule-controls">
                    <label>
                      Review note
                      <textarea
                        value={reviewNotes[r._id] ?? ""}
                        maxLength={2000}
                        onChange={(e) =>
                          setReviewNotes({
                            ...reviewNotes,
                            [r._id]: e.target.value,
                          })
                        }
                        placeholder="What booking evidence was checked, and what follow-up is needed?"
                      />
                    </label>
                    <Button
                      variant="outline"
                      disabled={busy || !reviewNotes[r._id]?.trim()}
                      onClick={() =>
                        void act(() =>
                          review({ id: r._id, reason: reviewNotes[r._id] }),
                        )
                      }
                    >
                      Acknowledge review
                    </Button>
                  </div>
                )
              )}
            </article>
          ))}
        </Panel>
      )}
      {!caseId && feed.events.length > 0 && feed.canReview && (
        <Panel title="Link an event to a synthetic booking">
          <div className="panel-body schedule-controls">
            <label>
              Observed event
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                <option value="">Select event</option>
                {feed.events.map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.revision?.data.dateUtc} · {e.revision?.data.awayTeam} at{" "}
                    {e.revision?.data.homeTeam}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trip / contract case
              <select
                value={selectedCase}
                onChange={(e) => setCase(e.target.value as Id<"cases">)}
              >
                <option value="">Select case</option>
                {snapshot.cases.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.input.code} · {c.input.destination} · {c.input.start}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Why this event belongs to the booking
              <textarea
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button
              disabled={
                busy || !selectedEvent || !selectedBooking || !reason.trim()
              }
              onClick={() => {
                if (!selectedEvent || !selectedBooking) {
                  notify(
                    "Select an event and a booking from the current workspace.",
                    false,
                  );
                  return;
                }
                void act(() =>
                  link({
                    eventId: selectedEvent._id,
                    caseId: selectedBooking._id,
                    expectedVersion: selectedEvent.version,
                    reason,
                  }),
                );
              }}
            >
              Link booking
            </Button>
          </div>
        </Panel>
      )}
      <Panel
        title={caseId ? "Linked public events" : "Observed Warriors events"}
        meta={
          <span className="small muted">
            {feed.events.length} shown · Limited coverage
          </span>
        }
      >
        {!feed.events.length ? (
          <Empty
            title={caseId ? "No event linked" : "No public events imported"}
          >
            {caseId ? (
              <Link href="/events">
                Link a public event from Event schedules.
              </Link>
            ) : (
              "Sync the configured Actor to collect a real observation. No sample event is presented as live data."
            )}
          </Empty>
        ) : (
          feed.events.map((e) => {
            const d = e.revision?.data;
            if (!d) return null;
            return (
              <article className="source-article schedule-entry" key={e._id}>
                <div className="row-between">
                  <h3>
                    {d.awayTeam} at {d.homeTeam}
                  </h3>
                  <Status state={d.status} />
                </div>
                <p>
                  {d.startsAtUtc ?? `${d.dateUtc} · time unknown`} ·{" "}
                  {d.venue ?? "Venue unknown"} · {d.city ?? "City not supplied"}
                </p>
                <p className="small muted">
                  Version {e.version} · Last observed {e.lastObservedAt} · Event{" "}
                  {e.externalId}
                </p>
                <div className="schedule-controls">
                  <a href={d.sourceUrl} target="_blank" rel="noreferrer">
                    View source
                  </a>
                  <Button
                    variant="ghost"
                    onClick={() => setHistory(history === e._id ? null : e._id)}
                  >
                    View revision history
                  </Button>
                </div>
                {feed.links
                  .filter((l) => l.eventId === e._id)
                  .map((l) => (
                    <p className="small" key={l._id}>
                      Linked synthetic booking:{" "}
                      <Link href={`/work/${l.caseId}`}>
                        {l.trip.invoiceCode}
                      </Link>{" "}
                      · {l.reason}
                    </p>
                  ))}
                {history === e._id && <History id={e._id} />}
              </article>
            );
          })
        )}
      </Panel>
    </>
  );
}
