import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import type { FunctionReturnType } from "convex/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { searchMoss } from "../src/lib/integrations/moss";
import {
  RETRIEVAL_VERSION,
  type RetrievalDocument,
} from "../src/lib/retrieval";
import { hotelFixture } from "../src/lib/simulation/fixtures";

// Evaluation examples are never imported by application indexing or learner context.
const examples = [
  [
    "RATE-ORIGINAL",
    "Original room rates",
    "The signed original agreement keeps 30 original room nights at $240. An addition does not change their rate.",
  ],
  [
    "RATE-ADDITIONAL",
    "Additional room rates",
    "The controller accepted the signed itemized amendment: only the 20 added room nights use $265; original rooms retain their earlier rate.",
  ],
  [
    "SIGNATURE",
    "Unsigned room amendment",
    "An unsigned rate amendment cannot support the revised rate. Request the signed agreement before financial approval.",
  ],
  [
    "CONFLICT",
    "Conflicting schedules",
    "Conflicting effective dates and ambiguous room groups require clarification. Do not guess which amendment applies.",
  ],
  [
    "CANCEL",
    "Cancellation charges",
    "The cancellation fee requires the signed notice deadline and the date the hotel received notice.",
  ],
  [
    "DEPOSIT",
    "Deposit deduction",
    "Deduct a prepaid deposit only after locating its ledger entry and matching the hotel booking.",
  ],
  [
    "TAX",
    "Tax exemption",
    "Review the exemption certificate and jurisdiction before adjusting lodging taxes.",
  ],
  [
    "MEALS",
    "Breakfast packages",
    "Breakfast packages require separate meal quantities and rates; room nights do not establish meal delivery.",
  ],
  [
    "PARKING",
    "Bus parking",
    "Parking invoices need parking dates and the number of buses; do not use guest room counts.",
  ],
  [
    "LAUNDRY",
    "Laundry services",
    "Laundry bills require item counts and a separate service confirmation.",
  ],
];
const documents: RetrievalDocument[] = examples.map(([id, title, text]) => ({
  id,
  kind: "precedent",
  code: id,
  title,
  text,
  version: "synthetic-eval-v1",
  synthetic: true,
}));
const queries = [
  {
    query:
      "Do the newly booked rooms change the nightly price of the original room block?",
    relevant: ["RATE-ORIGINAL", "RATE-ADDITIONAL"],
  },
  {
    query:
      "The hotel supplied a rate change without a signature. Can we approve?",
    relevant: ["SIGNATURE"],
  },
  {
    query:
      "The booking was cancelled; how do we establish whether a penalty is due?",
    relevant: ["CANCEL"],
  },
  {
    query:
      "Should the amount paid in advance be deducted from this hotel's invoice?",
    relevant: ["DEPOSIT"],
  },
];
async function main() {
  if (!process.argv.includes("--live"))
    throw new Error(
      "Explicit --live is required; this uses Moss credentials and records provider usage.",
    );
  const env = parseEnv(readFileSync(".env.local", "utf8"));
  const keys = parseEnv(readFileSync(".env.integrations.local", "utf8"));
  if (
    !/^(anonymous|local|dev):/.test(env.CONVEX_DEPLOYMENT ?? "") ||
    process.env.CONVEX_DEPLOY_KEY ||
    env.CONVEX_DEPLOY_KEY
  )
    throw new Error(
      "Use a local/development deployment without a deploy-key override.",
    );
  if (!keys.MOSS_PROJECT_ID?.trim() || !keys.MOSS_PROJECT_KEY?.trim())
    throw new Error(
      "Moss credentials are missing. Fill .env.integrations.local and run configure:integrations.",
    );
  const config = {
    projectId: keys.MOSS_PROJECT_ID.trim(),
    projectKey: keys.MOSS_PROJECT_KEY.trim(),
  };
  const stamp = Date.now().toString(36);
  const path = `.context/moss-live-${stamp}.json`;
  const report = {
    version: RETRIEVAL_VERSION,
    startedAt: new Date().toISOString(),
    completed: false,
    error: null as string | null,
    sandboxId: "",
    caseId: "",
    measurements: [] as unknown[],
    assertions: [] as { name: string; passed: boolean; observed: unknown }[],
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
  try {
    for (const [i, q] of queries.entries()) {
      const result = await searchMoss(
        config,
        `attest-eval-${stamp}-${i}`,
        documents,
        q.query,
      );
      const returned = result.hits.map((h) => h.id);
      const found = q.relevant.filter((id) => returned.includes(id)).length;
      report.measurements.push({
        query: q.query,
        relevant: q.relevant,
        returned,
        recall: found / q.relevant.length,
        precision: returned.length ? found / returned.length : 0,
        structuredBaseline: {
          returned: documents.map((d) => d.id),
          recall: 1,
          precision: q.relevant.length / documents.length,
        },
        queryMs: result.queryMs,
        totalMs: result.totalMs,
      });
      check(
        `Moss query ${i + 1} returns known document IDs`,
        returned.length > 0 &&
          returned.every((id) => documents.some((d) => d.id === id)),
        returned,
      );
    }
    const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL!);
    const auth = await client.action(api.auth.signIn, {
      provider: "anonymous",
    });
    if (!auth.tokens) throw new Error("Anonymous sign-in returned no token.");
    client.setAuth(auth.tokens.token);
    report.sandboxId = await client.mutation(api.workspace.initialize, {});
    const providers = await client.query(api.investigations.providers, {});
    check(
      "Backend Moss credentials configured",
      providers.moss,
      providers.moss,
    );
    // Deterministic finance isolates the real Moss integration from CREAO availability.
    const id = await client.mutation(api.workspace.inject, {
      input: hotelFixture(`MOSS-SMOKE-${stamp}`),
    });
    if (!id) throw new Error("Workflow check: case creation was denied.");
    report.caseId = id;
    save();
    const deadline = Date.now() + 150000;
    let rows: FunctionReturnType<typeof api.retrievalRecords.list> = [];
    let detail;
    do {
      rows = await client.query(api.retrievalRecords.list, { caseId: id });
      detail = await client.query(api.cases.detail, { id });
      if (rows[0]?.status === "completed" && detail.proposals.length) break;
      if (Date.now() > deadline)
        throw new Error(
          "Workflow check timed out; inspect retained sandbox/case before repeating.",
        );
      await new Promise((r) => setTimeout(r, 1500));
    } while (true);
    check("Workflow used real Moss", rows[0]?.outcome === "moss", rows[0]);
    check(
      "Authoritative records revalidated",
      rows[0].matches.length > 0 &&
        rows[0].matches.every((m: { selected: boolean }) => m.selected),
      rows[0].matches,
    );
    check(
      "Financial amount remains $12,500",
      detail.proposals[0].result.expectedCents === 1250000,
      detail.proposals[0].result,
    );
    check(
      "No financial posting",
      detail.journals.length === 0,
      detail.journals.length,
    );
    check(
      "Deterministic run does not claim agent consumption",
      rows[0].passedToAgent === false,
      rows[0].passedToAgent,
    );
    await client.mutation(api.policies.propose, {});
    const jobDeadline = Date.now() + 150000;
    do {
      const snapshot = await client.query(api.workspace.snapshot, {});
      const job = snapshot?.policyRuns[0];
      if (job && ["completed", "failed"].includes(job.status)) {
        const retrieval = await client.query(api.retrievalRecords.list, {
          jobId: job._id,
        });
        check(
          "Learning workflow used Moss",
          retrieval[0]?.outcome === "moss",
          retrieval,
        );
        check(
          "Learning preserves controller activation gate",
          job.status === "completed" &&
            snapshot?.policies.some(
              (p: { jobId?: string; status: string }) =>
                p.jobId === job._id && p.status === "candidate",
            ),
          { jobId: job._id, status: job.status, outcome: job.outcome },
        );
        break;
      }
      if (Date.now() > jobDeadline)
        throw new Error(
          "Learning check timed out; inspect retained sandbox before repeating.",
        );
      await new Promise((r) => setTimeout(r, 1500));
    } while (true);
    report.completed = true;
  } catch (e) {
    // Never serialize native/provider exceptions, which can include credentials.
    report.error =
      e instanceof Error &&
      /^(Check failed|Workflow check|Learning check|Anonymous sign-in)/.test(
        e.message,
      )
        ? e.message
        : "Live Moss check failed; check credentials, model availability and the native runtime. Provider diagnostics omitted.";
    process.exitCode = 1;
  } finally {
    save();
    console.log(`Report: ${path}`);
  }
}
main().catch(() => {
  console.error(
    "Moss evaluation could not start. Check local configuration; secret-bearing diagnostics omitted.",
  );
  process.exitCode = 1;
});
