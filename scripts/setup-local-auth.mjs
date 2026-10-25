import { generateKeyPair, exportJWK, exportPKCS8 } from "jose";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const config = parseEnv(readFileSync(".env.local", "utf8"));
const deployment = config.CONVEX_DEPLOYMENT;
if (
  !deployment ||
  !/^(anonymous|local|dev):/.test(deployment) ||
  process.env.CONVEX_DEPLOY_KEY ||
  config.CONVEX_DEPLOY_KEY
)
  throw new Error(
    "Local authentication setup requires a development deployment without a deploy-key override.",
  );
console.log(`Initializing authentication on development target: ${deployment}`);
const { privateKey, publicKey } = await generateKeyPair("RS256", {
  extractable: true,
});
const settings = {
  JWT_PRIVATE_KEY: (await exportPKCS8(privateKey))
    .trimEnd()
    .replace(/\n/g, " "),
  JWKS: JSON.stringify({
    keys: [{ use: "sig", ...(await exportJWK(publicKey)) }],
  }),
  SITE_URL: "http://localhost:3000",
};
for (const [name, value] of Object.entries(settings)) {
  const result = spawnSync("npx", ["convex", "env", "set", name], {
    input: value,
    encoding: "utf8",
    env: { ...process.env, CONVEX_DEPLOYMENT: deployment },
  });
  if (result.status !== 0) throw new Error(`Could not configure ${name}.`);
  console.log(`Configured ${name}.`);
}
