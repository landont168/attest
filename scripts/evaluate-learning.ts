import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { Snapshot, Detail } from "../src/lib/view-types";
import { hotelFixture } from "../src/lib/simulation/fixtures";

async function main() {
  const live = process.argv.includes("--live");
  const config = parseEnv(readFileSync(".env.local", "utf8"));
  if (
    !config.CONVEX_DEPLOYMENT ||
    !/^(anonymous|local|dev):/.test(config.CONVEX_DEPLOYMENT) ||
    process.env.CONVEX_DEPLOY_KEY ||
    config.CONVEX_DEPLOY_KEY
  )
    throw new Error(
      "Evaluation requires the configured local/development deployment without a deploy-key override.",
    );
  const url = config.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is missing.");
  const client = new ConvexHttpClient(url);
  const auth = await client.action(api.auth.signIn, { provider: "anonymous" });
  if (!auth.tokens) throw new Error("Anonymous sign-in returned no token.");
  client.setAuth(auth.tokens.token);
  const results: { name: string; passed: boolean; observed: unknown }[] = [];
  const sourceHash = createHash("sha256");
  const sourceFiles = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(
      (name) =>
        /^(src|convex|scripts|agents)\//.test(name) &&
        /\.(ts|tsx|py|md|json)$/.test(name),
    )
    .sort();
  for (const name of sourceFiles)
    sourceHash
      .update(name)
      .update("\0")
      .update(readFileSync(name))
      .update("\0");
  const report = {
    sourceFingerprint: sourceHash.digest("hex"),
    mode: live ? "live_creao" : "deterministic",
    startedAt: new Date().toISOString(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    sandboxId: "",
    results,
  };
  const stamp = Date.now().toString(36);
  mkdirSync(".context", { recursive: true });
  const path = `.context/learning-${live ? "live" : "deterministic"}-${stamp}.json`;
  const save = () =>
    writeFileSync(
      path,
      JSON.stringify(
        {
          ...report,
          finishedAt: new Date().toISOString(),
          sampleCount: results.length,
          passed: results.filter((r) => r.passed).length,
        },
        null,
        2,
      ) + "\n",
    );
  const check = (name: string, passed: boolean, observed: unknown) => {
    results.push({ name, passed, observed });
    save();
    console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
    if (!passed)
      throw new Error(
        `${name} did not meet its acceptance condition; see ${path}`,
      );
  };
  async function waitFor<T>(
    read: () => Promise<T>,
    done: (x: T) => boolean,
  ): Promise<T> {
    const deadline = Date.now() + 17 * 60 * 1000;
    while (Date.now() < deadline) {
      const value = await read();
      if (done(value)) return value;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      "Evaluation timed out; existing run identifiers remain in the sandbox. Do not blindly resubmit.",
    );
  }
  const snapshot = async () =>
    (await client.query(api.workspace.snapshot, {})) as Snapshot;
  const detail = async (id: Id<"cases">) =>
    (await client.query(api.cases.detail, { id })) as Detail;
  const waitCase = (id: Id<"cases">) =>
    waitFor(
      () => detail(id),
      (d) =>
        ["PROPOSED", "NEEDS_INFO", "FAILED_RETRYABLE"].includes(d.case.state),
    );
  const waitJob = (test: (j: Doc<"policyRuns">) => boolean) =>
    waitFor(snapshot, (s) =>
      s.policyRuns.some(
        (j) => test(j) && ["completed", "failed"].includes(j.status),
      ),
    ).then((s) => s.policyRuns.find(test)!);
  try {
    report.sandboxId = await client.mutation(api.workspace.initialize, {});
    console.log(
      `Created isolated synthetic evaluation sandbox; report: ${path}`,
    );
    await waitFor(snapshot, (s) =>
      s.cases.every((c) => !["NEW", "INVESTIGATING"].includes(c.state)),
    );
    const providers = await client.query(api.investigations.providers, {});
    if (live && (!providers.creao || !providers.policyLearner))
      throw new Error(
        "Configure both invoice investigator and policy learner before live evaluation.",
      );
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    await client.mutation(api.workspace.setMode, {
      mode: live ? "creao" : "deterministic",
    });
    const start = await client.mutation(api.policies.propose, {});
    if (!start.ok) throw new Error(start.message);
    const onboarding = await waitJob((j) => !j.correctionId);
    check(
      "Onboarding returns a validated candidate",
      onboarding.outcome === "candidate" && !!onboarding.policyId,
      onboarding,
    );
    const candidate = (
      await client.query(api.policies.detail, { id: onboarding.policyId! })
    ).policy;
    check(
      "Onboarding yields review-first baseline for correction comparison",
      candidate.procedure === "controller_confirmation",
      { procedure: candidate.procedure, runId: onboarding.runId },
    );
    check(
      "Controller activates evaluated baseline",
      (await client.mutation(api.policies.activate, { id: candidate._id })).ok,
      { policyId: candidate._id },
    );
    const input = hotelFixture(`LIVE-LEARN-${stamp}`);
    input.sources[1].title = "Block extension · signed room schedule";
    const caseId = await client.mutation(api.workspace.inject, { input });
    const before = await waitCase(caseId);
    check(
      "Baseline asks for scope confirmation",
      before.case.state === "NEEDS_INFO",
      { caseId, runId: before.case.runId, state: before.case.state },
    );
    const response = await client.mutation(api.cases.resume, {
      id: caseId,
      answer:
        "AMD-HOTEL-001 is the existing signed itemized schedule separating original and additional rooms.",
      evidence: "note",
      correction: {
        kind: "overlooked_signed_schedule",
        sourceIds: ["AMD-HOTEL-001"],
      },
    });
    if (!response.ok) throw new Error(response.message);
    const corrected = await waitCase(caseId);
    check(
      "Corrected proposal validates supported amount",
      corrected.case.state === "PROPOSED" &&
        corrected.proposals[0].result.expectedCents === 1250000,
      { runId: corrected.case.runId, result: corrected.proposals[0].result },
    );
    const approve = await client.mutation(api.cases.review, {
      id: caseId,
      proposalId: corrected.case.proposalId!,
      operation: "approve",
      reason: "Accept evidence-backed schedule correction",
    });
    if (!approve.ok) throw new Error(approve.message);
    const learned = await waitJob((j) => !!j.correctionId);
    check(
      "Accepted correction automatically produces evaluated candidate",
      learned.outcome === "candidate" && !!learned.policyId,
      learned,
    );
    const packet = await client.query(api.policies.detail, {
      id: learned.policyId!,
    });
    check(
      "Comparison has benefit without regression",
      packet.evaluation?.passed === true &&
        packet.evaluation.report.improved > 0 &&
        packet.evaluation.report.regressed === 0,
      packet.evaluation?.report,
    );
    await client.mutation(api.workspace.setRole, { role: "human_accountant" });
    check(
      "Analyst cannot activate learning",
      !(await client.mutation(api.policies.activate, { id: learned.policyId! }))
        .ok,
      { policyId: learned.policyId },
    );
    await client.mutation(api.workspace.setRole, { role: "human_controller" });
    check(
      "Controller activates improved procedure",
      (await client.mutation(api.policies.activate, { id: learned.policyId! }))
        .ok,
      { policyId: learned.policyId },
    );
    const next = hotelFixture(`LIVE-NEXT-${stamp}`);
    next.sources[1].title = input.sources[1].title;
    const nextId = await client.mutation(api.workspace.inject, { input: next });
    const after = await waitCase(nextId);
    check(
      "Subsequent invoice uses learned procedure and correct amount",
      after.case.state === "PROPOSED" &&
        after.case.policyId === learned.policyId &&
        after.proposals[0].result.expectedCents === 1250000,
      {
        caseId: nextId,
        runId: after.case.runId,
        result: after.proposals[0].result,
      },
    );
    const missing = hotelFixture(`LIVE-MISSING-${stamp}`);
    missing.sources[1].title = input.sources[1].title;
    missing.sources[1].signed = false;
    const missingId = await client.mutation(api.workspace.inject, {
      input: missing,
    });
    const held = await waitCase(missingId);
    check(
      "Missing signature still withholds amount",
      held.case.state === "NEEDS_INFO" &&
        held.proposals[0].result.expectedCents === null,
      {
        caseId: missingId,
        runId: held.case.runId,
        result: held.proposals[0].result,
      },
    );
    const priorJobs = new Set((await snapshot()).policyRuns.map((j) => j._id));
    await client.mutation(api.policies.propose, {});
    const abstention = await waitJob((j) => !priorJobs.has(j._id));
    check(
      "History-only review may abstain instead of creating a duplicate",
      ["no_change", "insufficient_evidence"].includes(abstention.outcome ?? ""),
      abstention,
    );
    const regression = hotelFixture(`LIVE-REGRESSION-${stamp}`);
    const regressionId = await client.mutation(api.workspace.inject, {
      input: regression,
    });
    const final = await waitCase(regressionId);
    check(
      "Existing invoice investigator still finds the discrepancy",
      final.case.state === "PROPOSED" &&
        final.proposals[0].result.differenceCents === 75000,
      {
        caseId: regressionId,
        runId: final.case.runId,
        result: final.proposals[0].result,
      },
    );
    check(
      "No evaluation dispute caused a posting",
      (await snapshot()).journals.length === 0,
      { journals: (await snapshot()).journals.length },
    );
  } catch (error) {
    results.push({
      name: "Evaluation completion",
      passed: false,
      observed: error instanceof Error ? error.message : "Failed",
    });
    process.exitCode = 1;
  } finally {
    save();
    await client.action(api.auth.signOut, {}).catch(() => {});
    console.log(`Report saved: ${path}`);
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Evaluation failed");
  process.exitCode = 1;
});
