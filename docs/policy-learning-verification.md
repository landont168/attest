# Policy learning verification — 2026-10-25

## Executed checks

| Check | Result |
|---|---|
| TypeScript type checking | Passed |
| Complete Vitest suite | 93 / 93 tests across 4 files |
| Python agent normalizer | 6 / 6 tests |
| Next.js production build | Passed |
| Isolated local-backend end-to-end run | 14 / 14 assertions |
| Focused browser verification | Correction selection → revised proposal approval → automatic inactive candidate → stored comparison and review controls |

The local end-to-end run used a new anonymous sandbox and preserved all existing user data. It exercised four new synthetic invoices (including the corrected invoice), three policy-learning jobs, and the seeded history. Fourteen is a count of workflow assertions, not independent accuracy samples. The browser check used a separately labeled synthetic learning case, left the candidate inactive, and restored the original live CREAO mode afterward.

The stored deterministic comparison covers seven versioned scenarios: signed schedule, missing signature, ambiguous scope, conflicting dates, unrelated vendor, superseding amendment, and instructions embedded in evidence. Moving from controller_confirmation to signed_schedule_first avoided clarification in three supported cases, introduced zero clarification regressions, and passed all seven mandatory safety scenarios. Amounts remained $12,500 for the normal supported case and $13,250 for the explicit superseding-rate scenario. Missing authority continued to withhold a financial amount.

The automated suite also covers duplicate callbacks, malformed provider output, exact citations, expired counterexamples, separate agent credentials, uncertain submission recovery, retained raw responses, concurrent activation, stale or withdrawn support, cross-sandbox denials with retained audit events, and preservation of policy references for work already started.

## Evidence and limitations

Local execution report: `.context/learning-deterministic-mvnqyew6.json`.
Source fingerprint (SHA-256): `9ed590638f2874575270f9411abe2526abda36b7c59ddb8ee42eafbc8e31cf0b`.
The fingerprint covers application, backend, script and agent-bundle source bytes; local credentials are excluded. The JSON report also records the Git revision and actual observations. Browser capture: `.context/learning-review.png`. These local artifacts are intentionally gitignored.

**Separate-agent live verification was attempted and is blocked by saved-output configuration.** The learner ID is configured and the existing key successfully reached the separate agent. The first live onboarding checkpoint failed because the outer persisted object contained `prompt`, `outcome`, `vendorId`, and `procedure` alongside `resultJson`. The strict backend correctly rejected those unexpected fields. No candidate was activated.

Live provider run: `23a5c3f4-a6ca-4928-9795-162fc3ebae25`. Report: `.context/learning-live-mvnrac1w.json`; diagnosis: `.context/learner-live-diagnosis.json`. Exactly one live learner run was observed. The first of 14 planned workflow assertions failed; the remaining 13 were not executed. The report also includes a completion-error entry, which is diagnostic and not an additional scenario.

Separately parsing the retained resultJson payload confirmed the correct seven fields, valid historical citations, and a controller_confirmation candidate passing seven deterministic safety scenarios. This diagnostic does not turn the failed integration checkpoint into a pass. Update the saved agent's `memory.persist_fields` to only `["resultJson"]`, keeping `prompt` as an input and all policy fields inside the serialized payload, then rerun the full live evaluation. The invoice-agent live regression remains pending. No live accuracy or success-rate claim is made.

After the saved Policy Learner is configured, run `npm run configure:integrations`, then `npm run evaluate:learning:live`. This explicitly invokes CREAO in a fresh synthetic sandbox and writes a separate live report with provider run IDs and observed business outcomes. It checks onboarding, correction-driven improvement, abstention, subsequent-case use, missing-signature escalation, and invoice-investigator regression. A successful provider response alone never counts as a business pass. An unexpected response ends the run with a recorded failure rather than forcing a candidate.

## Review and release

Ship backend, setup bundle, minimal UI integration, tests, and documentation in one PR. Keep it draft until the separate-agent live report is reviewed. No production deployment, policy activation in the user's existing sandbox, or data reset is part of this change. A separate development preview would be useful for shared provider testing, but no cloud environment has been provisioned.

The UI developer should integrate the small additions documented in [policy-learning.md](policy-learning.md#ui-handoff); this PR does not redesign page layouts.
