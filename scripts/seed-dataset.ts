import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { datasetCases, type Dataset } from "../src/lib/simulation/datasets";
import { datasetAnswers } from "../tests/fixtures/dataset-answers";

async function main() {
  const dataset = process.argv[2] as Dataset;
  if (!["demo", "history", "evaluation"].includes(dataset))
    throw new Error("Choose demo, history, or evaluation.");
  const config = parseEnv(readFileSync(".env.local", "utf8"));
  const deployment = process.env.CONVEX_DEPLOYMENT ?? config.CONVEX_DEPLOYMENT;
  const url =
    process.env.NEXT_PUBLIC_CONVEX_URL ?? config.NEXT_PUBLIC_CONVEX_URL;
  if (
    !deployment ||
    !/^(anonymous|local):/.test(deployment) ||
    !url ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) ||
    process.env.CONVEX_DEPLOY_KEY ||
    config.CONVEX_DEPLOY_KEY
  )
    throw new Error(
      "Dataset commands require a local development deployment without a deploy-key override.",
    );
  const client = new ConvexHttpClient(url);
  mkdirSync(".context", { recursive: true });
  const sessionFile = ".context/dataset-session.json";
  const saved = existsSync(sessionFile)
    ? JSON.parse(readFileSync(sessionFile, "utf8"))
    : null;
  const auth = await client.action(
    api.auth.signIn,
    saved?.url === url && saved?.refreshToken
      ? { refreshToken: saved.refreshToken }
      : { provider: "anonymous" },
  );
  if (!auth.tokens)
    throw new Error(
      "No authenticated session. Remove .context/dataset-session.json only if intentionally starting a new seed identity.",
    );
  writeFileSync(sessionFile, JSON.stringify({ url, ...auth.tokens }), {
    mode: 0o600,
  });
  client.setAuth(auth.tokens.token);
  const seeded = await client.mutation(api.datasets.select, {
    dataset,
    reset: process.argv.includes("--reset"),
  });
  if (!seeded.ok) throw new Error(seeded.message);
  const deadline = Date.now() + 60000;
  let snapshot = await client.query(api.workspace.snapshot, {});
  while (
    snapshot?.cases.some((c) => ["NEW", "INVESTIGATING"].includes(c.state)) &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 500));
    snapshot = await client.query(api.workspace.snapshot, {});
  }
  if (
    !snapshot ||
    snapshot.cases.some((c) =>
      ["NEW", "INVESTIGATING", "FAILED_RETRYABLE"].includes(c.state),
    )
  )
    throw new Error(
      "Dataset investigation did not finish successfully; existing case history is retained.",
    );
  const fixtures = datasetCases(dataset);
  const counts = {
    cases: snapshot.cases.length,
    vendors: new Set(fixtures.map((f) => f.input.vendorId)).size,
    contracts: new Set(fixtures.map((f) => f.input.contractId)).size,
    invoices: fixtures.length,
    bankPayments: fixtures.reduce((n, f) => n + f.bank.length, 0),
    depositAllocations: fixtures.reduce((n, f) => n + f.credits.length, 0),
  };
  console.log(
    JSON.stringify(
      {
        dataset,
        sandboxId: snapshot.sandbox?._id,
        ...counts,
        states: snapshot.cases.map((c) => ({
          code: c.input.code,
          state: c.state,
        })),
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--evaluate")) {
    if (dataset !== "evaluation")
      throw new Error("Evaluation requires the evaluation dataset.");
    const results = [];
    for (const answer of datasetAnswers) {
      const c = snapshot.cases.find((c) => c.input.code === answer.code);
      if (!c) throw new Error(`Missing ${answer.code}`);
      let authorization =
        answer.authorization === "withheld"
          ? c.state === "NEEDS_INFO"
          : c.state === "PROPOSED";
      if (answer.authorization === "agent_denied_and_audited") {
        const receipt = await client.mutation(api.cases.demonstrateDenial, {
          id: c._id,
          action: "approve",
        });
        const detail = await client.query(api.cases.detail, { id: c._id });
        authorization =
          !receipt.ok &&
          detail.audit.some(
            (a) =>
              a.action === "agent_approve_denied" &&
              !a.allowed &&
              a.actor === "attest-investigator",
          ) &&
          detail.approvals.length === 0;
      }
      const passed =
        c.result?.expectedCents === answer.expectedCents &&
        c.result?.differenceCents === answer.differenceCents &&
        c.state === answer.state &&
        answer.evidence.every((id) => c.result?.evidenceIds.includes(id)) &&
        authorization;
      results.push({
        code: answer.code,
        passed,
        expected: answer,
        observed: {
          state: c.state,
          result: c.result,
          authorizationPassed: authorization,
        },
      });
    }
    const report = {
      mode: "deterministic_backend_workflow",
      liveAI: false,
      executedAt: new Date().toISOString(),
      sandboxId: snapshot.sandbox?._id,
      passed: results.filter((r) => r.passed).length,
      total: results.length,
      results,
    };
    writeFileSync(
      ".context/dataset-evaluation.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      `Measured deterministic backend evaluation: ${report.passed}/${report.total}. Report: .context/dataset-evaluation.json`,
    );
    if (report.passed !== report.total) process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Dataset seed failed.",
  );
  process.exitCode = 1;
});
