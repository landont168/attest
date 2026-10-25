import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

// Read only the requested integration values. Never echo secrets or pass them as CLI arguments.
const local = parseEnv(readFileSync(".env.local", "utf8"));
const target = local.CONVEX_DEPLOYMENT;
if (!target || !/^(anonymous|local|dev):/.test(target))
  throw new Error(
    "A local or development CONVEX_DEPLOYMENT is required in .env.local. This helper does not configure production.",
  );
if (process.env.CONVEX_DEPLOY_KEY || local.CONVEX_DEPLOY_KEY)
  throw new Error(
    "Remove the deploy-key override before using this development-only helper.",
  );
const credentials = parseEnv(readFileSync(".env.integrations.local", "utf8"));
const names = ["CREAO_API_KEY", "CREAO_AGENT_ID"];
const missing = names.filter((name) => !credentials[name]?.trim());
if (missing.length) {
  console.error(
    `Fill ${missing.join(" and ")} in .env.integrations.local, save the file, and rerun npm run configure:integrations.`,
  );
  process.exit(1);
}
if (!credentials.CREAO_API_KEY.trim().startsWith("capi_"))
  throw new Error(
    "Use a capi_ account or agent key from agent.creao.ai for the v1 API.",
  );
console.log(`Configuring Convex development target: ${target}`);
for (const name of names) {
  const result = spawnSync("npx", ["convex", "env", "set", name], {
    input: credentials[name].trim(),
    encoding: "utf8",
    env: { ...process.env, CONVEX_DEPLOYMENT: target },
  });
  if (result.status !== 0)
    throw new Error(
      `Could not configure ${name}. Check that the selected Convex backend is running and your account has access. Secret-bearing command output was suppressed.`,
    );
  console.log(`Configured ${name}.`);
}
console.log(
  "Configuration saved. Select Live CREAO in Integrations and create a new case to verify a real run.",
);
if (credentials.MOSS_PROJECT_ID || credentials.MOSS_PROJECT_KEY)
  console.log(
    "Moss credentials were not applied: the optional retrieval adapter is not implemented.",
  );
