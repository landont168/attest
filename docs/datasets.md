# Three synthetic datasets

Use the **Dataset** selector beside “Acting as” to load Demo, Company History, or Evaluation into your own authenticated workspace. Existing original workspaces remain intact. Dataset creation/reset requires a local development backend or `ATTEST_HOSTED_DEMO=true` set server-side on a dedicated hosted demo deployment. Hosted-demo visitors start in Demo automatically; subsequent visits retain their selected dataset. Authentication, role checks and per-visitor isolation apply in both environments. See [deployment setup](deployment.md).

| Dataset | Cases / invoices | Vendor references | Contract references | Bank payments | Deposit allocations |
|---|---:|---:|---:|---:|---:|
| Demo | 3 | 2 | 2 | 3 | 3 |
| Company History | 8 | 4 | 4 | 2 | 1 |
| Evaluation | 6 | 6 | 6 | 1 | 0 |

Vendor and contract references live in the existing case inputs and source documents; no new vendor/contract tables or generation service were introduced. The only schema addition is an optional sandbox dataset label and owner/dataset index. Existing unit validators now also accept flight legs and trips.

## Commands

With the existing local Convex backend running:

```sh
npm run seed:demo
npm run seed:history
npm run seed:eval
npm run evaluate:datasets
npm run seed:demo -- --reset
```

The first three commands idempotently select/seed a separate dataset. `evaluate:datasets` creates a fresh evaluation generation and runs all six checks through the local deterministic backend. Reset archives only the selected dataset generation; it never deletes financial history. In the UI, Simulation settings → Reset simulation preserves the selected dataset type.

CLI commands use a dedicated anonymous seed identity, persisted securely in ignored `.context/dataset-session.json`. They do not modify the browser user's private workspace. Use the browser Dataset selector to load the same fixtures for the live demo. Repeated CLI commands refresh the same identity and reuse stable invoice, source and payment codes; Convex document IDs remain stable within a generation and change only on explicit reset. The CLI commands still refuse cloud/production targets and deploy-key overrides; hosted visitors load fixtures through the authenticated UI.

## Demo

- `INV-TEAM-001` — Meridian Hospitality; `CTR-INV-TEAM-001`; 50 × $300 plus 20 × $250 = $20,000 supported gross. The $21,000 invoice has a verified $3,000 deposit: $18,000 invoiced outstanding, $17,000 supported remaining due, $1,000 proposed dispute.
- `DEMO-VALID-002` — Harbor Court Hotel; `CTR-VEN-HARBOR-2026`; 18 room-nights with a signed $35 late-check-in premium, and operational confirmation of the condition. $5,670 gross, no dispute; $500 deposit allocated once.
- `DEMO-MISSING-003` — Harbor Court Hotel under the same master agreement; 24 room-nights with a $600 deposit, missing delivery confirmation. Needs Information, assigned to Travel Operations; supported payable withheld.

These January/February 2027 records are explicitly synthetic future scenarios relative to October 2026. Every bank deposit uses `PAY-<invoice code>`, a `BANK-<invoice code>` source, and, when applied, `CREDIT-<invoice code>`.

## Company History

Eight imported synthetic cases, dated May–September 2026:

| Invoices | Vendor / recurring contract | Historical records |
|---|---|---|
| `HIST-MER-001`, `HIST-MER-002` | Meridian Hospitality / `CTR-VEN-MERIDIAN-2026` | May $3,000 approved/posted; June signed rate concession supports $2,750 against $3,000 billed, with a Controller-approved dispute awaiting correction |
| `HIST-HAR-001`, `HIST-HAR-002` | Harbor Court Hotel / `CTR-VEN-HARBOR-2026` | May $4,000 invoice, $1,000 deposit allocated; June $500 cancellation credit documented in a credit memo and incorporated once into the signed net rate, yielding $3,500 |
| `HIST-AIR-001`, `HIST-AIR-002` | Coastal Charter Air / `CTR-VEN-COASTAL-2026` | July $24,000 charter; August $26,400 with a signed 10% night-flight surcharge supported by departure logs |
| `HIST-GRD-001`, `HIST-GRD-002` | Bayline Ground Transport / `CTR-VEN-BAYLINE-2026` | August $2,520 invoice against $2,220 supported charges, proposal rejected pending vendor correction; September $1,850 invoice with a settled but unapplied $500 payment, held for review |

There are five imported balanced journals, one approved dispute, one rejected proposal, and one information hold. Decisions retain historical timestamps, distinct synthetic AP/Controller identities and source links. Import events use the current import timestamp and explicitly say “synthetic history”; no provider runs or specialist executions are fabricated. The records populate the existing overview, work queue/vendor filters, contract library, case detail, approvals and audit views when Company History is selected. There is no standalone Vendors page in this app.

The cancellation credit is represented as an explicitly amended net rate, supported by its separate memo, not a second deposit allocation. This reuses the existing rate-cohort engine without adding a general credit-note subsystem.

## Evaluation

Runtime records: `src/lib/simulation/datasets.ts`. Answer keys: `tests/fixtures/dataset-answers.ts`, imported only by tests and the CLI evaluator, never by application/Convex runtime code or agent context.

| Scenario | Required outcome | Measured backend result |
|---|---|---|
| EVAL-001: correctly invoiced amendment | $3,107 supported, $0 dispute, awaiting human review; amendment citation | Pass |
| EVAL-002: retroactive signed amendment | $4,879 supported, exact signed scope, $0 dispute | Pass |
| EVAL-003: uncredited deposit | Needs Information; payable withheld; bank evidence linked | Pass |
| EVAL-004: unsigned conflicting amendment | Needs Information; payable withheld | Pass |
| EVAL-005: unauthorized agent approval | Backend rejects and audits the agent attempt; no approval created | Pass |
| EVAL-006: unfamiliar quantity/rate | 37 × $193.75 = $7,168.75; $499.50 discrepancy | Pass |

Executed result: **6/6 deterministic backend workflow evaluations passed**. Full observed results, source references, states and authorization checks are written to `.context/dataset-evaluation.json`. This is actual local Convex execution with durable deterministic workflows; it is not a live LLM/CREAO quality benchmark. The authorization case invokes the existing backend agent-denial demonstration and verifies its audit record and absence of approval.

The adversarial suite exposed and fixed a missing citation: an uncredited deposit previously withheld approval correctly but omitted its bank source from the result. Failed settlement now retains available payment evidence without linking a nonexistent credit document.

## Verification

- `npm run test:report`: 118/118 tests passed, including all six adversarial cases, fixture references/dates, dataset isolation, idempotency, archive-only reset and historical consistency. Evaluation screen report regenerated.
- `npm run test:learner`: 6/6 passed.
- TypeScript, production build and whitespace checks passed.
- Demo, history and evaluation commands executed against the local backend; a second demo seed reused the exact workspace and three case records.
- No lint script is configured. No live AI evaluation or full browser visual QA was performed. No Claude/Anthropic service was used.
