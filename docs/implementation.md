# Implementation review

## Current flow

1. Convex Auth issues an anonymous identity. The server derives ownership from that identity and creates an isolated sandbox; clients cannot choose another owner's identifier.
2. Ingestion validates a structured invoice, deduplicates its source identifier within the sandbox, persists the evidence, and starts a Convex workflow.
3. The workflow loads applicable signed evidence, active precedents, approved policy, and retained human answers. Deterministic mode reconciles directly. Live mode submits a CREAO run and persists its identifier, then polls it with bounded retries.
4. CREAO can propose scope and cite evidence. The independent finance engine checks source and term references and calculates integer-cent amounts. Unsupported interpretations and missing sources withhold the expected amount.
5. A proposal captures its complete input, policy reference, provider, attempt, revision, and result. A human can approve, reject, or request information. Answers resume the same case with a new attempt; changed decisions require a new proposal and approval.
6. The posting gateway checks the current proposal, revision, approval, actor role, period, source calculation, and vendor resolution. A disputed invoice cannot create a lower payable without documented resolution and a controller's new approval.
7. A successful transaction creates a balanced journal and audit record. Repeated execution uses a stable reference to retain one posting. Corrections create a separate reversal in the open March period.

## Code map

| Area | Location |
| --- | --- |
| Financial rules and result validation | `src/lib/finance/engine.ts` |
| Scoped evidence procedures | `src/lib/finance/memory.ts` |
| Synthetic records and history | `src/lib/simulation/fixtures.ts` |
| Data model and indexes | `convex/schema.ts` |
| Ownership and audit helpers | `convex/lib.ts` |
| Ingestion, modes, sandbox lifecycle | `convex/workspace.ts` |
| Durable investigation and policy jobs | `convex/workflows.ts` |
| Provider submission and polling | `convex/creao.ts` |
| Decisions, posting, and reversals | `convex/cases.ts` |
| Policy proposals and activation | `convex/policies.ts` |
| Application screens | `src/components/attest-app.tsx` |
| Investigation workspace | `src/components/investigation.tsx` |

## Policy learning

The versioned learning loop now captures explicit controller corrections against existing signed schedules, promotes them only after validated proposal approval, and automatically queues a separate Policy Learner. Candidates may abstain; application code checks exact citations, records a seven-scenario comparison, and requires controller approval of the exact passing version. Existing policies and case history remain readable.

See [policy learning](policy-learning.md) for rules, data flow, failure recovery, UI interfaces, and the separate [agent setup bundle](../agents/policy-learner/README.md). The initial live policy result below used the legacy shared agent; it does not verify the new separate learner.

## Recovery semantics

- Every v1 submission sends an `idempotencyKey` derived from the case/attempt or policy job. A repeat of the same logical submission keeps that key; a new investigation attempt receives a new one.
- GET polling retries are safe. A timed-out investigation with a known, still-unresolved provider run resumes polling that run.
- A human answer or rejected proposal starts a fresh investigation and includes the answer in the provider context.
- A known terminal provider failure can be retried as a fresh run.
- A POST timeout without a returned run ID is ambiguous. The app blocks blind resubmission; an operator must inspect the project run history. Operator reconciliation of an unknown external run is currently a backend maintenance operation, not a UI action.
- Missing credentials fail before a submission is recorded. Definitive HTTP 4xx rejections are recorded separately from uncertain submissions.
- Policy-job failures are visible in Policies. Known unresolved runs can resume polling; uncertain submissions without a run ID block resubmission. Explicit retries of terminal failures create linked jobs preserving previous results.

## Keys and integration blockers

| Integration | Current state | Needed next |
| --- | --- | --- |
| Local Convex | Running with auth, persistence, reactive updates, durable jobs | Nothing for local development |
| CREAO | Configured and live-verified: invoice dispute, missing evidence, vendor resolution, and policy activation | Broader scenario evaluation; see [live verification](live-verification.md) |
| Cloud Convex | Not deployed | Authorized cloud project when deployment is desired |
| Moss | Implemented and locally live-verified | Bounded semantic retrieval; see [scope and measured checks](moss-retrieval.md) |
| Figma / Apify / Bright Data | Not integrated | Not required for the current synthetic finance workflow |
| Accounting system / vendor communications | Synthetic records only | Explicit target systems and real authorization before operational use |

The v1 endpoint contract was checked against the [CREAO hackathon API guide](https://community.creao.ai/AI_hackathon_UCLA2026/tech) and [API Trigger documentation](https://docs.creao.ai/pro/api-trigger). Credentialed runs now establish compatibility for the scenarios in [the live verification report](live-verification.md). These focused checks are not an accuracy benchmark.

## Boundaries of this initial product

- The input is structured synthetic evidence, not OCR or automatic extraction from uploaded contracts. Signature flags are synthetic metadata, not cryptographic signature verification.
- Financial support is USD hotel room-nights. Taxes, FX, partial delivery allocation, multiple accounting entities, and real payment execution are outside this implementation.
- Anonymous session ownership is real, but the role selector is intentionally simulated. Production requires named identities, administrator-controlled roles, and appropriate separation between approvers.
- The workspace is capped at 40 cases, 12 investigation attempts per case, and bounded query windows. Case detail displays the most recent 200 audit events; the workspace feed displays 150. Older events remain stored. Pagination and an archive browser are future work.
- An anonymous account is tied to the browser's stored session. Clearing that storage can lose access to the old sandbox even though its records remain in Convex.
- Local backend data survives ordinary process restarts. This is not a backup or disaster-recovery guarantee.
- No real supplier messages, money movement, or production ledger writes occur.

## Remaining implementation order

1. Review the initial product PR with the passing automated checks and measured live verification report.
2. Expand live evaluation to legitimate supersession, conflicting dates, rejection/resumption, and correction-driven policy improvement. Existing automated tests cover these controls; the focused live pass does not establish their provider-level reliability.
3. If operational use is desired, agree on real source and accounting connectors, replace simulated roles, add document ingestion and archived-history navigation, and then prepare a separately authorized deployment.
