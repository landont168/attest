import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";

const root = "integrations/apify-actor";
const statePath = ".context/apify-deployment.json";
const configPath = ".env.integrations.local";
function save(data) {
  mkdirSync(".context", { recursive: true });
  writeFileSync(`${statePath}.tmp`, JSON.stringify(data, null, 2) + "\n");
  renameSync(`${statePath}.tmp`, statePath);
}
async function main() {
  if (!process.argv.includes("--deploy"))
    throw new Error(
      "Use --deploy to create/build the private Actor in your Apify account.",
    );
  const config = parseEnv(readFileSync(configPath, "utf8"));
  if (!config.APIFY_API_TOKEN?.trim())
    throw new Error("Fill APIFY_API_TOKEN in .env.integrations.local first.");
  const files = [
    "package.json",
    "package-lock.json",
    "Dockerfile",
    "README.md",
    ".actor/actor.json",
    ".actor/input_schema.json",
    "src/main.mjs",
    "src/collect.mjs",
    "src/normalize.mjs",
  ];
  const sourceFiles = files.map((name) => ({
    name,
    format: "TEXT",
    content: readFileSync(`${root}/${name}`, "utf8"),
  }));
  const hash = createHash("sha256")
    .update(JSON.stringify(sourceFiles))
    .digest("hex");
  let state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : {};
  async function request(path, method = "GET", body) {
    const r = await fetch(`https://api.apify.com/v2/${path}`, {
      method,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${config.APIFY_API_TOKEN.trim()}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok)
      throw new Error(
        `Apify HTTP ${r.status}; inspect the saved deployment state before retrying.`,
      );
    return (await r.json()).data;
  }
  if (!state.actorId) {
    if (state.creationAttempted)
      throw new Error(
        "Previous Actor creation is uncertain. Inspect .context/apify-deployment.json and Apify Console; record its actorId there before retrying.",
      );
    if (config.APIFY_ACTOR_ID?.trim())
      throw new Error(
        "An Actor ID is already configured. This helper will not overwrite an untracked Actor; use its Console to install the bundle or retain the original deployment state.",
      );
    state = {
      name: `attest-event-schedule-${Date.now().toString(36)}`,
      sourceHash: hash,
      creationAttempted: true,
    };
    save(state);
    const actor = await request("acts", "POST", {
      name: state.name,
      title: "Attest Public Event Schedule",
      isPublic: false,
      description:
        "Bounded TheSportsDB Warriors observations for Attest operational booking review.",
      versions: [
        {
          versionNumber: "0.1",
          sourceType: "SOURCE_FILES",
          buildTag: "latest",
          sourceFiles,
        },
      ],
      defaultRunOptions: {
        build: "latest",
        timeoutSecs: 120,
        memoryMbytes: 256,
        restartOnError: false,
      },
    });
    state.actorId = actor.id;
    save(state);
    console.log(`Created private Actor: ${actor.id}`);
  } else if (state.sourceHash !== hash) {
    if (!process.argv.includes("--update"))
      throw new Error(
        "Source changed. Use --deploy --update to update the recorded Actor and rebuild.",
      );
    await request(`acts/${state.actorId}/versions/0.1`, "PUT", {
      versionNumber: "0.1",
      sourceType: "SOURCE_FILES",
      buildTag: "latest",
      sourceFiles,
    });
    state.sourceHash = hash;
    delete state.buildId;
    delete state.buildAttempted;
    delete state.buildStatus;
    save(state);
  }
  if (!state.buildId) {
    if (state.buildAttempted)
      throw new Error(
        "Build submission is uncertain. Inspect Apify Console and record its buildId before retrying.",
      );
    state.buildAttempted = true;
    save(state);
    const build = await request(
      `acts/${state.actorId}/builds?version=0.1&tag=latest`,
      "POST",
    );
    state.buildId = build.id;
    save(state);
  }
  for (let i = 0; i < 60; i++) {
    const build = await request(`actor-builds/${state.buildId}`);
    state.buildStatus = build.status;
    save(state);
    if (build.status === "SUCCEEDED") break;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(build.status))
      throw new Error(
        `Actor build ${build.status}; inspect the recorded build in Apify Console.`,
      );
    if (i === 59)
      throw new Error(
        "Build remains in progress. Rerun this command to inspect the same build.",
      );
    if (i % 5 === 0)
      console.log(`Actor build ${state.buildId}: ${build.status}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  let text = readFileSync(configPath, "utf8");
  const assignment = `APIFY_ACTOR_ID=${state.actorId}`;
  text = /^APIFY_ACTOR_ID=.*$/m.test(text)
    ? text.replace(/^APIFY_ACTOR_ID=.*$/m, assignment)
    : text + `\n${assignment}\n`;
  writeFileSync(configPath, text, { mode: 0o600 });
  console.log(
    `Private Actor ready: https://console.apify.com/actors/${state.actorId}`,
  );
  console.log(
    "Saved APIFY_ACTOR_ID locally. Run npm run configure:integrations, then npm run evaluate:apify:live.",
  );
}
main().catch((e) => {
  console.error(
    e instanceof Error &&
      /^(Use |Fill |Previous |An Actor |Source changed|Build |Actor build|Apify HTTP)/.test(
        e.message,
      )
      ? e.message
      : "Deployment could not complete; inspect saved state and account access. Secret-bearing provider diagnostics omitted.",
  );
  process.exitCode = 1;
});
