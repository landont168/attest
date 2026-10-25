import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const raw = JSON.parse(fs.readFileSync(".context/test-results.json", "utf8"));
const tests = raw.testResults.flatMap((s) =>
  s.assertionResults.map((t) => ({
    name: t.fullName,
    status: t.status,
    duration: t.duration ?? 0,
  })),
);
let revision = "local";
try {
  revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {}
const source = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .sort();
const hash = createHash("sha256");
for (const file of source) hash.update(fs.readFileSync(file));
const report = {
  generatedAt: new Date(raw.startTime).toISOString(),
  revision: `${revision} + source ${hash.digest("hex").slice(0, 12)}`,
  total: tests.length,
  passed: tests.filter((t) => t.status === "passed").length,
  failed: tests.filter((t) => t.status === "failed").length,
  tests,
};
fs.writeFileSync(
  "public/evaluation.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `Published ${report.passed}/${report.total} executed test results.`,
);
