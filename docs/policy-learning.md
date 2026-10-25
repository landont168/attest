# Evidence-backed policy learning

Attest keeps procedural memory in Convex. It does not retrain the model. Historical learning and correction-driven improvement both produce inactive candidates, and only a controller can activate the exact evaluated version.

## Workflow

1. A controller answers a NEEDS_INFO proposal and explicitly selects an existing signed additional-room schedule as overlooked evidence. The source must exist unchanged in that proposal, and the independent finance engine must validate the original input. Notes, retry requests, newly supplied amendments, another vendor, or unsigned schedules do not qualify.
2. An immutable correction retains the original proposal/input/policy, selected source snapshots, explanation, actor and response revision. A new proposal links to that correction.
3. Human approval of the validated revised proposal schedules acceptance in a separate transaction. Acceptance creates one eligible precedent and one automatic learning job. A failed learning job cannot undo the case approval or its posting workflow.
4. The separate Policy Learner receives a bounded snapshot of applicable precedents, current vendor policy and the accepted triggering correction. It may propose either supported procedure, decline a change, or report insufficient evidence. No evaluation answer keys enter this context.
5. Application code validates exact citations and the versioned response. Same-procedure proposals become no_change. Candidates require two distinct active precedents and, for correction jobs, the triggering correction citation.
6. Seven deterministic scenario snapshots compare baseline and candidate behavior. The report retains inputs, expected/observed financial values, clarification decisions, suite version and benefit/regression counts. Improvement requires all safety checks, at least one avoided unnecessary clarification and no new unnecessary clarification. Onboarding requires the safety suite without claiming improvement.
7. Activation rechecks the evidence/baseline snapshot and recomputes the exact report. Stale candidates need reevaluation; changed cited precedent contents require a new proposal. Old evaluations are preserved. Candidate rejection records its reason.
8. Investigations pin their policy version at start, including resumed polling of the same provider run. Historical decisions never adopt a newly activated policy retroactively.

## Supported scope and limits

- Meridian Hospitality, USD hotel room-nights, and two reviewed procedures: controller_confirmation and signed_schedule_first.
- Existing synthetic historical records can support initial onboarding; accepted synthetic corrections add new precedents. This is not unrestricted procedure synthesis or production authorization.
- Current signature flags and roles remain simulated. Source text does not prove a cryptographic signature.
- Retrieval is indexed and bounded to 30 active vendor precedents plus 10 expired counterexamples. Expired records are labeled inactive and cannot support a candidate. Old records remain stored. This is a bounded simulation, not a complete enterprise archive.
- No vector database, MCP, training infrastructure, real accounting connector, or vendor communication is needed.

## Workshop rules enforced in code

The Hyphenate workshop distinguishes records from work, learning at onboarding from improvement after corrections, and proposals from authorized financial actions (slides 9 and 12–18).

- Contracts and confirmed services determine money. Policy only changes evidence-review procedure.
- Derive identity from the session and enforce sandbox ownership on public operations. Model text cannot grant authority.
- Corrections, candidates, evaluation reports, approvals and financial entries have separate records and stable references.
- Check actor, action and resource before changes. The agent proposes; the controller reviews policy; the gateway independently posts.
- Write learning transitions and denied-action audits in the same transaction as the decision. Return denials after saving; throwing would roll back their audit event.
- Preserve original records. Rejection, supersession and explicit retries create history rather than erase it.
- Use stable identifiers to deduplicate accepted corrections and automatic work. External source connectors, when implemented, will additionally require persistent source cursors and late-update handling.

## Agent setup

Follow [the Policy Learner setup bundle](../agents/policy-learner/README.md). Leave the existing Contract Investigator unchanged. The new agent takes one `prompt` text input, returns a strict schemaVersion 1 object, and persists the whole object through the `resultJson` scalar envelope. No per-field array persistence is allowed.

Set CREAO_POLICY_AGENT_ID in .env.integrations.local. CREAO_POLICY_API_KEY is optional only when the existing CREAO_API_KEY has access to the separate agent. Run `npm run configure:integrations` against the existing local/development deployment. Never print or commit keys.

The supplied normalizer validates native arrays without splitting commas, stringifying scalars, dropping unknown fields or repairing IDs. It validates syntax; application validation establishes citation applicability. Existing invoice normalizer files are not changed.

## Failure and recovery

Raw provider responses, parsed output, provider identifiers, input snapshots and validation failures are saved independently. Missing learner settings fail only learning. GET polling can resume a known unresolved run. An uncertain POST with no returned ID blocks automatic resubmission. A user-requested retry after a known terminal outcome creates a deduplicated linked job with a new request key and preserves the prior result. Repeated automatic callbacks still retain one automatic job per correction.

The manual case button reuses its correction's latest job. Failed jobs have an explicit retry/resume control. The original invoice v1 endpoint, agent ID and parser behavior remain intact.

## UI handoff

Existing snapshot fields and propose/activate calls remain available. Additions are optional correction information on cases.resume, learningCorrections in workspace.snapshot, corrections in cases.detail, and owned policies.detail/reject/reevaluate/retry operations.

Minimal integration lives in the existing response form and the isolated policy-learning component. No layout redesign is included. Policy details expose stored correction/evidence, comparison, approval metadata and latest 30 uses; new screens can use this query without another AI call.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run test:learner`
- `npm run build`
- `npm run evaluate:learning` for an isolated deterministic end-to-end run against the configured development backend.
- `npm run evaluate:learning:live` for an explicitly requested live run after both agents are configured.

Each evaluation signs into a new anonymous sandbox and preserves the synthetic records. It never resets the user's sandbox. Reports are written under .context with mode, code revision and source fingerprint, actual observations, case/policy/provider references and counts. The report stops and records failure if an expected outcome does not occur; it does not force an AI answer to complete the script. The session is signed out after evaluation.

Live checks include onboarding, accepted correction, candidate evaluation and role-denied activation, future-case use, missing-signature escalation, abstention and invoice-agent regression. Deterministic checks are not a live-agent accuracy benchmark.
