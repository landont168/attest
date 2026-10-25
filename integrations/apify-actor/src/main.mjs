import { Actor } from "apify";
import { collect } from "./collect.mjs";
await Actor.main(async () => {
  const input = await Actor.getInput();
  const result = await collect(input);
  await Actor.pushData(result);
  console.log(`Collected ${result.events.length} public event records; ${result.missingTrackedIds.length} tracked events unavailable. Coverage is limited.`);
});
