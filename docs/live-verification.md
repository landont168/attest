# Live verification — October 25, 2026

Verified against the local Convex backend and the configured saved CREAO agent. All business records, approvals, and ledger entries are synthetic. These are focused integration checks, not an accuracy benchmark.

| Scenario | Observed result |
| --- | --- |
| Invoice dispute | `INV-SIM-MVNNW461`, attempt 7: CREAO returned valid evidence references through `resultJson`. Independent calculation produced $12,500 against the $13,250 invoice, a $750 proposed discrepancy. |
| Vendor resolution and posting | Approving the dispute withheld posting. A synthetic vendor acceptance started attempt 8 and produced a fresh proposal. An AP Analyst approval was denied and audited. Controller approval produced exactly one balanced journal: $12,500 travel-expense debit and accounts-payable credit. Original invoice and prior proposal remained available. |
| Missing signed amendment | `INV-SIM-MVNP2U0G`, attempt 1: completed as `NEEDS_INFO`, requested the missing signed authority, withheld the expected amount, and offered a response/resume action instead of approval. |
| Policy learning | Initial run was rejected because the agent cited database IDs rather than precedent codes. After removing internal database identifiers from policy context and explicitly requesting `code` values, the next run produced a candidate citing `HIST-MER-101` and `HIST-MER-102`; all four safety checks passed. |
| Policy activation | Candidate remained inactive until approval. AP Analyst activation was denied. Controller activation made version 2 active; the original baseline and historical case policy references were retained. |

## Provider run references

- Original dispute: `b186b65d-704c-49dc-b775-7ba9dd98b4d1`
- Vendor-resolution investigation: `e857ddce-7f24-43fc-acc4-466d85910add`
- Missing evidence: `3cfea203-0a0a-4c75-903d-d19f4a0aa19e`
- Rejected policy citation output: `f2f5fe2a-82ba-49e0-a490-d1021d53fcb6`
- Successful policy candidate: `270fef0e-88d1-42d2-874a-01a91b8b49bf`

Provider status alone is not a pass: the observed results above include application validation, persisted state, and browser checks.

## Automated verification

- `npm run typecheck` — passed.
- `npm run test:report` — 69/69 tests passed: 35 finance, 14 workflow, 20 CREAO adapter tests.
- `npm run build` — passed.
- `git diff --check` — passed.
- Local credential files and diagnostic artifacts are ignored by Git. A pattern scan of candidate source files found no API tokens or private-key blocks; this is not a comprehensive security audit.

The added policy regression test proves that provider context excludes internal identifiers, database IDs are still rejected as citations, valid wrapped output creates an inactive candidate, and fixture checks pass.

## Remaining boundaries

Live supersession, date-conflict, rejection/resumption, and correction-driven policy improvement scenarios still need broader evaluation. Their automated coverage is separate from live-provider verification. No cloud deployment, real vendor communication, or real accounting transaction was performed.

CREAO MCP setup remains unresolved. The discovered `@creao-ai/builder-mcp` package documents Builder database/SDK operations and a separate `CREAO_AUTH_TOKEN`; it is not documented as an interface to the saved investigator agent. The working app integration uses the existing `capi_` key through the v1 run API. No MCP connection was configured or claimed as verified.
