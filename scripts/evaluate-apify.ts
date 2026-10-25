import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

async function main() {
  if (!process.argv.includes("--live"))
    throw new Error(
      "Explicit --live is required; this starts two billable Apify runs.",
    );
  const env = parseEnv(readFileSync(".env.local", "utf8"));
  if (
    !/^(anonymous|local|dev):/.test(env.CONVEX_DEPLOYMENT ?? "") ||
    process.env.CONVEX_DEPLOY_KEY ||
    env.CONVEX_DEPLOY_KEY
  )
    throw new Error(
      "Use a local/development backend without a deploy-key override.",
    );
  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL!);
  const path = `.context/apify-live-${Date.now().toString(36)}.json`;
  const report = {
    version: 1,
    startedAt: new Date().toISOString(),
    completed: false,
    sandboxId: "",
    caseId: "",
    error: null as string | null,
    runs: [] as Doc<"scheduleSyncs">[],
    observations: [] as unknown[],
    assertions: [] as { name: string; passed: boolean; observed: unknown }[],
    limitations: [
      "Two hosted observations cannot establish feed completeness or reliability.",
      "Source schedule changes are not manufactured. Change detection is tested separately with synthetic fixtures.",
      "All bookings in this check are synthetic; public events do not prove contractual liability.",
    ],
  };
  const save = () => {
    mkdirSync(".context", { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  };
  const check = (name: string, passed: boolean, observed: unknown) => {
    report.assertions.push({ name, passed, observed });
    save();
    console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
    if (!passed) throw new Error(`Check failed: ${name}`);
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function sync() {
    const receipt = await client.mutation(api.schedules.requestSync, {});
    check("Live sync accepted", receipt.ok, receipt);
    const started = await client.query(api.schedules.list, {});
    const id = started.jobs[0]._id;
    report.runs.push(started.jobs[0]);
    save();
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const feed = await client.query(api.schedules.list, {});
      const job = feed.jobs.find((j: Doc<"scheduleSyncs">) => j._id === id)!;
      report.runs[report.runs.length - 1] = job;
      save();
      if (["failed", "uncertain"].includes(job.status))
        throw new Error(
          "Live sync needs attention; inspect the retained job and provider run before retrying.",
        );
      if (job.status === "completed") {
        check(
          "Hosted run imported with run/build/dataset provenance",
          !!job.runId && !!job.buildId && !!job.datasetId,
          job,
        );
        report.observations.push(feed.events);
        save();
        return feed;
      }
      await sleep(1500);
    }
    throw new Error(
      "Live sync timed out; inspect the retained job instead of resubmitting.",
    );
  }
  let signedIn = false;
  try {
    const auth = await client.action(api.auth.signIn, {
      provider: "anonymous",
    });
    if (!auth.tokens) throw new Error("Anonymous sign-in returned no token.");
    client.setAuth(auth.tokens.token);
    signedIn = true;
    report.sandboxId = await client.mutation(api.workspace.initialize, {});
    save();
    check(
      "Backend Apify configuration is present",
      (await client.query(api.investigations.providers, {})).apify,
      true,
    );
    const first = await sync();
    check("Feed is explicitly bounded", first.events.length <= 20, {
      events: first.events.length,
    });
    // Empty data is a valid provider observation, but cannot verify linking.
    if (!first.events.length)
      throw new Error(
        "Live feed is empty; import passed but linking needs a later source observation.",
      );
    const event = first.events[0];
    if (!event.revision) throw new Error("Live event has no source revision.");
    const snapshot = await client.query(api.workspace.snapshot, {});
    if (!snapshot) throw new Error("Synthetic workspace not found.");
    const c = snapshot.cases.find(
      (row: Doc<"cases">) => row.input.code === "INV-HOTEL-001",
    );
    if (!c) throw new Error("Synthetic invoice not found.");
    report.caseId = c._id;
    save();
    let detail = await client.query(api.cases.detail, { id: c._id });
    const readyBy = Date.now() + 180000;
    while (!detail.proposals.length) {
      if (Date.now() > readyBy)
        throw new Error("Synthetic invoice investigation did not settle.");
      await sleep(1500);
      detail = await client.query(api.cases.detail, { id: c._id });
    }
    const before = JSON.stringify({
      case: detail.case,
      proposals: detail.proposals,
      approvals: detail.approvals,
      journals: detail.journals,
    });
    const args = {
      eventId: event._id,
      caseId: c._id,
      expectedVersion: event.version,
      reason:
        "LIVE SMOKE TEST: deliberately link a real public observation to a synthetic hotel booking to verify operational review. This is not a real booking association.",
    };
    check(
      "Explicit synthetic booking link accepted",
      (await client.mutation(api.schedules.link, args)).ok,
      { eventId: event._id, caseId: c._id },
    );
    await client.mutation(api.schedules.link, args);
    let scoped = await client.query(api.schedules.list, { caseId: c._id });
    check(
      "Repeated linking creates one link",
      scoped.links.length === 1,
      scoped.links.length,
    );
    if (
      event.revision.data.dateUtc < c.input.start ||
      event.revision.data.dateUtc > c.input.end
    )
      check(
        "Out-of-range observation opens a booking review",
        scoped.reviews.length === 1,
        scoped.reviews,
      );
    for (const review of scoped.reviews) {
      const response = await client.mutation(api.schedules.review, {
        id: review._id,
        reason:
          "Live smoke test acknowledged: real public date is outside the synthetic booking. No financial action authorized.",
      });
      check("Review acknowledgement saved", response.ok, response);
    }
    const waitMs = Math.max(0, first.jobs[0].requestedAt + 61000 - Date.now());
    if (waitMs) {
      console.log(
        "Waiting for the one-minute sync interval before a tracked refresh.",
      );
      await sleep(waitMs);
    }
    const second = await sync();
    check(
      "Next run refreshes the explicitly linked event",
      second.jobs[0].trackedEventIds.includes(event.externalId),
      second.jobs[0].trackedEventIds,
    );
    const history = await client.query(api.schedules.history, {
      eventId: event._id,
    });
    check(
      "Original source revision remains retrievable",
      history.some(
        (h: { revision: Doc<"scheduleRevisions"> }) =>
          h.revision._id === event.currentRevisionId,
      ),
      history,
    );
    detail = await client.query(api.cases.detail, { id: c._id });
    check(
      "Import, linking and review preserve financial records",
      JSON.stringify({
        case: detail.case,
        proposals: detail.proposals,
        approvals: detail.approvals,
        journals: detail.journals,
      }) === before,
      {
        expectedCents: detail.proposals[0].result.expectedCents,
        approvals: detail.approvals.length,
        journals: detail.journals.length,
      },
    );
    scoped = await client.query(api.schedules.list, { caseId: c._id });
    check(
      "Case-scoped query returns the linked event",
      scoped.events.length === 1 && scoped.events[0]._id === event._id,
      scoped.events.map((e: Doc<"scheduleEvents">) => e.externalId),
    );
    report.completed = true;
  } catch (e) {
    report.error =
      e instanceof Error &&
      /^(Check failed|Live |Anonymous |Synthetic )/.test(e.message)
        ? e.message
        : "Live Apify check failed. Inspect retained records; secret-bearing diagnostics omitted.";
    console.error(report.error);
    process.exitCode = 1;
  } finally {
    save();
    console.log(`Report: ${path}`);
    if (signedIn) await client.action(api.auth.signOut, {}).catch(() => {});
    client.clearAuth();
  }
}
main().catch(() => {
  console.error(
    "Apify evaluation could not start. Check local/development configuration; credentials omitted.",
  );
  process.exitCode = 1;
});
