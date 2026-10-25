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

**Live verification is partially passing; the full suite is not green yet.** The separate learner is reachable with the existing key. No production or existing-user-sandbox policy was changed; activation below occurred only in an isolated synthetic evaluation sandbox.

| Live run | Observed result |
|---|---|
| Initial onboarding, before persistence fix | Rejected extra top-level persisted fields; no candidate activated |
| Onboarding after persistence fix | Valid insufficient_evidence response accepted; candidate-path smoke assertion failed and later steps did not run |
| Correction diagnostic with explicit deterministic onboarding setup | 11 assertions passed, 1 failed, 2 not reached; the first 3 passing assertions were deterministic baseline setup |
| Independent invoice-agent live regression | 2 / 2 assertions passed: $750 discrepancy and no posting |

The correction diagnostic switched to live CREAO after creating and approving its deterministic baseline. It verified the invoice clarification request, accepted correction, automatic candidate generation, passing deterministic comparison, analyst denial, controller activation, subsequent-case use at $12,500, and missing-signature escalation. Its repeat-history request then returned no_change with procedure signed_schedule_first; the backend rejected it because abstention requires procedure null. The exact repository normalizer independently rejected the same object with exit code 1 and no response body, despite the agent's chat claim that its staged normalizer succeeded. Install the exact supplied normalizer and updated SKILL.md; do not weaken backend validation.

The onboarding abstention was structurally valid. Its explanation incorrectly required a new invoice's signed terms/service records before proposing a historical evidence-review procedure. The updated instructions distinguish history-based onboarding from safeguards that remain mandatory when the procedure is later used on invoices. Abstention remains supported; a candidate is never forced.

Retained local reports and provider references:

- Original envelope failure: `.context/learning-live-mvnrac1w.json`, run `23a5c3f4-a6ca-4928-9795-162fc3ebae25`.
- Post-fix onboarding abstention: `.context/learning-live-mvnrdgra.json`, run `cb16bdcc-9a37-46c3-b931-2eeeafa30b58`.
- Correction diagnostic: `.context/learning-correction-live-mvnreyt1.json`, successful learner run `df235872-7ce2-4bd0-83d3-0cc551ad7cf8`; rejected repeat-history run `3218746a-479e-4343-a0a4-59c46dd1d12b`.
- Independent invoice regression: `.context/invoice-regression-live-mvnrklb9.json`.

The correction diagnostic and invoice regression use separate local diagnostic scripts; they do not replace the strict full-suite command. Completion-error entries in reports are diagnostic, not additional scenarios. These few runs establish observed behavior only; no accuracy or success-rate claim is made.

After the saved Policy Learner is configured, run `npm run configure:integrations`, then `npm run evaluate:learning:live`. This explicitly invokes CREAO in a fresh synthetic sandbox and writes a separate live report with provider run IDs and observed business outcomes. It checks onboarding, correction-driven improvement, abstention, subsequent-case use, missing-signature escalation, and invoice-investigator regression. A successful provider response alone never counts as a business pass. An unexpected response ends the run with a recorded failure rather than forcing a candidate.

## Review and release

Ship backend, setup bundle, minimal UI integration, tests, and documentation in one PR. Keep it draft until the separate-agent live report is reviewed. No production deployment, policy activation in the user's existing sandbox, or data reset is part of this change. A separate development preview would be useful for shared provider testing, but no cloud environment has been provisioned.

The UI developer should integrate the small additions documented in [policy-learning.md](policy-learning.md#ui-handoff); this PR does not redesign page layouts.
