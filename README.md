# Attest

**Every number has a reason.** Built for Cal Hacks 13.0.

Attest investigates contract-backed invoices, explains the calculation from signed evidence, and asks an authorized human to approve financial work. The application uses Next.js and Convex, including durable workflows that survive an interrupted browser session.

The current implementation is an independent finance simulation using fictional Golden State Warriors travel records. It does not connect to a real accounting ledger, vendor inbox, or bank. The role selector changes a simulated role within the visitor's own authenticated sandbox.

## Run locally

Use Node 22 or newer and `npm ci`. In separate terminals:

```sh
npm run convex
npm run dev
```

Open http://localhost:3000/work. The current workspace already has a running local Convex backend and authentication keys. Do not regenerate authentication keys during ordinary restarts.

For a fresh installation, use your existing Convex development project if signed in. Without a Convex account, `CONVEX_AGENT_MODE=anonymous npx convex dev` creates a local backend and writes `.env.local`. Once that backend is running, run `node scripts/setup-local-auth.mjs` **once** to initialize its authentication keys. This script is for a development backend; it replaces authentication keys on the selected deployment. `NEXT_PUBLIC_CONVEX_URL` must point to that backend. The local HTTP endpoint supplies the JWT issuer used by `convex/auth.config.ts`.

## Implemented

- Live work queue with vendor/search/status filters, sorting, and editable synthetic scenario ingestion.
- Autonomous investigation on ingestion and resumption after human clarification.
- Evidence timeline, linked source clauses, immutable proposal snapshots, rate-group calculation, original invoice comparison, and activity history.
- Integer-cent financial engine with contract/vendor/date/signature/scope/service checks, explicit rate supersession, and safe abstention when evidence is missing.
- Approval, rejection, information requests, documented synthetic vendor resolution, and controller-only corrected payable approval.
- Server-side posting gateway with current-proposal approval checks, open-period checks, deduplication, balanced journal entries, and linked reversals preserving the original.
- Persisted authorization denials, policy references, approvals, source revisions, and provider runs.
- Scoped policy proposals from historical precedents, controller activation, safety backtests, correction-driven policy improvement, and retained versions.
- Finance team directory and acting-role inbox, persisted contract/payment specialist handoffs, assigned Travel Operations requests, and draft-only disputes.
- Configurable AP Manager authorization limits, stable fictional staff identities, verified deposit allocation, and controller-approved corrected payables.
- Contracts, approvals, overview, audit, evaluation, and integration screens.
- Anonymous authentication with isolated sandboxes. Reset archives the old sandbox and starts a new one.

The canonical finance-team example, **INV-TEAM-001**, calculates 50 × $300 + 20 × $250 = **$20,000**, against a **$21,000** invoice. The independently verified **$3,000** deposit reduces the supported remaining due to **$17,000**. Dispute approval alone never posts a lower payable. A referenced vendor response creates a revised proposal requiring fresh controller approval. The gateway posts expense, remaining AP and prepaid deposit allocation exactly once.

The original $750 example remains available for compatibility. See [Finance team implementation](docs/finance-team.md) for the role/permission matrix, organization diagram, schema migration, execution model, demo walkthrough and limits.

## Synthetic datasets

Use the Dataset selector for three isolated environments: **Demo (3 cases)**, **Company History (8 cases)**, and **Evaluation (6 cases)**. Local commands: `npm run seed:demo`, `npm run seed:history`, `npm run seed:eval`, and `npm run evaluate:datasets`. See [dataset commands, inventory and measured evaluation results](docs/datasets.md).

## Connect CREAO

The default mode runs the real deterministic finance engine without an AI call. It is explicitly labeled as simulation. Live CREAO invoice investigation, missing-evidence escalation, and policy proposal/activation have been verified against the configured saved agent.

1. Open `.env.integrations.local` in VS Code and fill `CREAO_API_KEY` and `CREAO_AGENT_ID`.
2. Use your **`capi_` key from agent.creao.ai** and the saved Agent ID (sent as `appId`). Configure one required text input named **`prompt`** and use [the agent contract](docs/creao-agent.md), using a non-Anthropic model and no connected write tools.
3. Run `npm run configure:integrations`. It sends only the required values to the local/development Convex backend without printing secrets or placing them in command arguments. It refuses a production deployment or deploy-key override.
4. In **Integrations**, select **Live CREAO investigation**, then create a new scenario. Existing cases retain their original mode.
5. Inspect **Agent activity → Provider runs** for the external run ID, actual status, and retained output. Invalid or unsupported output withholds financial approval.

Keys are needed only for live CREAO. Local simulation, financial controls, policy workflows, and tests work without them. Moss retrieval is implemented: configure `MOSS_PROJECT_ID` and `MOSS_PROJECT_KEY` to rank eligible historical decisions and signed clauses. Every result is revalidated in Convex; missing or failed Moss falls back to structured lookup. See [Moss retrieval and measured checks](docs/moss-retrieval.md). No Anthropic SDK or API is used by this repository.

## Verify

```sh
npm run typecheck
npm run test:report
npm run build
```

The evaluation screen reads `public/evaluation.json`, generated from actual Vitest assertions with a source hash and timestamp. `test:report` covers domain rules and Convex workflows, including concurrent duplicate posting, access isolation, corrections, stale decisions, and policy learning. It does not benchmark live CREAO quality. Workflow-component logging during tests is expected.

## Implementation review and next steps

See [architecture and implementation status](docs/implementation.md) for data flow, controls, supported limits, remaining integration work, and production requirements. A live CREAO invoice investigation passed on October 25, 2026: the adapter read the saved agent's `resultJson` wrapper, validated its evidence, and proposed the expected $750 discrepancy against a $12,500 contractual total. A follow-up verification passed missing-evidence escalation, controller-gated policy activation, and the full vendor-resolution-to-simulated-posting flow; see [the live verification report](docs/live-verification.md). No cloud production deployment has been performed.

## Evidence-backed policy learning

See [policy learning](docs/policy-learning.md) for the accepted-correction loop, evaluation gates and technical rules. Create the separate learner using [the setup bundle](agents/policy-learner/README.md). Invoice-agent configuration is unchanged. Live learning requires CREAO_POLICY_AGENT_ID; no live learning verification is claimed until its evaluation report passes.
