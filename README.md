# Attest

_An autonomous accounts payable platform_

[Open the hosted synthetic demo](https://attest-demo-lemon.vercel.app/work) · [Attest on GitHub](https://github.com/landont168/attest)

Attest investigates financial exceptions across contracts, amendments, operational records, invoices, and payments. It reconstructs what a company owes, explains discrepancies with supporting evidence, and coordinates the work needed to resolve them.

## 🏀 Inspiration

We missed the first day of Cal Hacks to watch the Golden State Warriors lose after giving up 17 straight points. So we figured the least we could do was help them stop losing money off the court.

Professional basketball teams negotiate hotels, transportation, and vendor contracts months in advance. Then plans change. Finance teams have to reconcile what was agreed to, what changed, what was delivered, and what was billed—across systems that each hold only part of the story.

Companies have spent decades building software to store financial information. Humans still have to piece it together and do the work. We built Attest to take responsibility for that investigation.

## What Attest does

Attest organizes financial work around specialized roles:

| Role                           | Responsibility                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Accounts Payable Analyst       | Owns persistent investigations, delegates reviews, and coordinates resolutions |
| Contract Finance Analyst       | Identifies governing agreements, amendment scope, and applicable rate cohorts  |
| Payment Reconciliation Analyst | Verifies deposits, credits, and outstanding balances                           |
| Vendor Dispute Specialist      | Prepares evidence-backed dispute packages and routes them for authorization    |

These roles work with Travel Operations, an AP Manager, a Financial Controller, a Vendor Relationship Manager, and an Internal Auditor. Missing information becomes an assigned request. Rejections preserve the previous proposal and return the case for revision. Every handoff, finding, approval, and denied action is recorded.

**Autonomy doesn’t mean unlimited authority.** Restricted financial decisions require independent human approval. Agents cannot approve their own proposals, change bank records, or bypass the posting gateway.

The investigation workspace connects three views:

- **Agreement lineage:** Contracts, amendments, delivery records, invoices, and resolutions over time.
- **Financial proof:** Rate cohorts, deposit reconciliation, and calculations linked to their sources.
- **Decision control:** Agent activity, proposed actions, human approvals, authorization boundaries, and audit history.

The existing AP orchestrator can use CREAO for interpretation; specialist reviews and financial calculations use deterministic services with persisted assignments and results. The separate Policy Learner proposes evidence-backed procedural improvements that require Controller approval. See the [role and permission matrix](docs/finance-team.md) for the execution model and authority of each role.

## The demo: one invoice, months of history

Our fictional Warriors-inspired finance team signs an October agreement for **50 room-nights at $300**, paying a **$3,000 deposit**. A January amendment adds **20 room-nights at $250** while preserving the original rate for the first 50. In February, all 70 room-nights are delivered—but the hotel bills all 70 at $300.

| Financial reconciliation                         |     Amount |
| ------------------------------------------------ | ---------: |
| Vendor invoice, gross                            |    $21,000 |
| Vendor outstanding after deposit                 |    $18,000 |
| Correct contractual total: 50 × $300 + 20 × $250 |    $20,000 |
| Deposit already paid and credited once           |     $3,000 |
| Correct outstanding balance                      |    $17,000 |
| **Proposed dispute**                             | **$1,000** |

Attest reconstructs the governing terms, verifies the deposit, identifies the overcharge, and prepares a dispute with supporting evidence. Approving the dispute does not post a lower payable. A referenced vendor response produces a revised proposal, which requires fresh Controller approval before the gateway posts a balanced, idempotent journal.

To try it, select **Demo**, open **INV-TEAM-001**, and inspect **Team handoffs** and the calculation evidence. See the [complete demo walkthrough](docs/finance-team.md#demo-path).

## Three connected synthetic environments

| Dataset         | Cases | Purpose                                                                                                                                           |
| --------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo            |     3 | Canonical overcharge, authorized amended charge, and missing delivery evidence                                                                    |
| Company History |     8 | Recurring relationships across four vendors, contract amendments, deposits, cancellation credits, surcharges, and historical Controller decisions |
| Evaluation      |     6 | Independent adversarial cases covering amendment scope, payment exceptions, financial calculations, and authorization                             |

Choose a dataset in the application to load it into your authenticated workspace. Historical imports are labeled as synthetic records. Evaluation answer keys are stored separately from runtime source records and are not supplied to investigating agents.

The financial records and staff are fictional. January and February 2027 records are synthetic future scenarios relative to October 2026. Acting-role selection is simulated within each visitor’s isolated workspace; accounting entries and vendor responses are also simulated. No real funds are transferred or vendor messages sent.

## How we built it

Attest is a system of work across systems of record.

| Technology                               | Role                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Next.js, React, TypeScript, Tailwind CSS | Interactive investigation workspace                                                                        |
| Convex                                   | Persistent records, authenticated workspaces, work items, and durable workflows                            |
| CREAO AI                                 | Contract Investigator and separate Policy Learner agents                                                   |
| Moss                                     | Retrieval of relevant signed clauses and eligible historical decisions, revalidated against Convex records |
| Apify                                    | Structured public NBA schedule and event data that enriches travel operations context                      |
| Deterministic TypeScript                 | Integer-cent financial calculations, evidence validation, approval limits, and balanced journal entries    |

The hardest problems were deciding which contract version governs a charge, connecting fragmented records, and making uncertainty actionable. Separating interpretation from deterministic financial controls lets Attest ask for evidence or escalate when it cannot safely proceed.

## How we use Convex

- Convex queries keep work, investigation, and approval screens live.
- Workflows coordinate investigations; mutations record approvals and simulated postings.
- Convex Auth isolates visitor sandboxes. See the [hackathon log](hackathon.md).

## Hosted synthetic demo

The [live demo](https://attest-demo-lemon.vercel.app/work) runs on Vercel with a dedicated Convex Cloud backend. New visitors sign in anonymously and start with the three-case Demo. Company History and Evaluation are available through the Dataset selector, and each visitor's records remain isolated.

The checked-in `vercel.json` deploys the backend and UI together, passing the cloud backend URL to the frontend build. `ATTEST_HOSTED_DEMO=true` on the dedicated Convex deployment enables dataset selection and automatic Demo initialization. Existing visitors retain their selected workspace.

The hosted demo runs in deterministic simulation mode; live CREAO, Moss and Apify integrations are not enabled there. See [deployment setup and measured verification](docs/deployment.md) for configuration, live URLs and checks.

## Run locally

Use **Node.js 22 or newer**.

```sh
npm ci
```

Start these in separate terminals:

```sh
# Terminal 1: Convex backend and function watcher
npm run convex

# Terminal 2: Next.js application
npm run dev
```

Open [localhost:3000/work](http://localhost:3000/work).

### First-time backend setup

Use an existing Convex development project if signed in. To create a local backend without a Convex account:

```sh
CONVEX_AGENT_MODE=anonymous npx convex dev
```

Convex writes its deployment settings to `.env.local`. Keep that backend running, then initialize development authentication **once**:

```sh
node scripts/setup-local-auth.mjs
```

This script replaces authentication keys on the selected development deployment. An already configured workspace only needs its backend and frontend restarted; do not regenerate keys during normal restarts. `NEXT_PUBLIC_CONVEX_URL` must point to the selected backend. Its local HTTP endpoint supplies the JWT issuer used by `convex/auth.config.ts`.

### Environment configuration

Use [.env.example](.env.example) as the variable reference. Keep local values in the ignored environment files.

| Location                   | Values / purpose                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `.env.local`               | Convex-generated `CONVEX_DEPLOYMENT` and frontend `NEXT_PUBLIC_CONVEX_URL`                                                   |
| `.env.integrations.local`  | `CREAO_API_KEY`, `CREAO_AGENT_ID`; optional learner, Moss, and Apify credentials below                                      |
| Convex backend environment | Server-side integration credentials applied by the configuration helper; authentication keys created during first-time setup |

Never put provider secrets in `NEXT_PUBLIC_*` variables. The default financial workflow and automated tests work without CREAO, Moss, or Apify credentials.

## Configure integrations

### CREAO Contract Investigator

1. Create `.env.integrations.local` and set `CREAO_API_KEY` and `CREAO_AGENT_ID`.
2. Use a **`capi_` key from agent.creao.ai** and the saved Agent ID, sent as `appId`. Configure one required text input named **`prompt`** using the [agent contract](docs/creao-agent.md), a non-Anthropic model, and no connected write tools.
3. Apply the values to the running development backend:

   ```sh
   npm run configure:integrations
   ```

4. In **Integrations**, select **Live CREAO investigation**, then create a new scenario. Existing cases retain their original execution mode.
5. Inspect **Agent activity → Provider runs** for the external run ID, status, and retained output. Unsupported or invalid output withholds financial approval.

The helper reads only the supported integration fields, avoids printing secrets, and refuses production deployments or deploy-key overrides.

### Policy Learner

Configure the separate agent using the [Policy Learner setup bundle](agents/policy-learner/README.md). Add `CREAO_POLICY_AGENT_ID` to `.env.integrations.local`; add `CREAO_POLICY_API_KEY` if the existing key is not authorized for both agents. Run `npm run configure:integrations` again.

Accepted, source-backed corrections can become learning precedents. Proposed procedural changes remain inactive until the Controller approves the exact evaluated version. See [policy learning](docs/policy-learning.md) for the acceptance loop, safety gates, and recovery behavior.

### Moss retrieval

Add both `MOSS_PROJECT_ID` and `MOSS_PROJECT_KEY` to `.env.integrations.local`, then apply them with `npm run configure:integrations`. The helper also requires the CREAO fields above. Missing or failed Moss retrieval falls back to validated structured Convex lookup.

Every retrieved match is checked against canonical records before use. See [Moss setup and measured verification](docs/moss-retrieval.md) for SDK behavior, deployment requirements, and recorded outcomes. Removing keys from a local file does not remove values already configured on the backend.

### Apify event schedules

Save `APIFY_API_TOKEN` in `.env.integrations.local` and leave `APIFY_ACTOR_ID` blank for initial setup, then run:

```sh
npm run deploy:apify
npm run configure:integrations
```

The deployment helper creates a private Actor, builds its source, and saves its ID locally. It retains recovery metadata in `.context/apify-deployment.json`; keep that file if a deployment is interrupted. Use `npm run deploy:apify -- --update` to update the same Actor. The configuration helper also requires the CREAO fields above.

Open **Event schedules → Sync with Apify** to collect public Warriors schedule observations from TheSportsDB, then explicitly link an event to a synthetic booking. Schedule changes can open an operational review; public events do not establish contract rates, delivery evidence, or financial authority. Collection runs on explicit sync.

See [Apify setup and verification](docs/apify-schedules.md) and the [Actor bundle](integrations/apify-actor/README.md) for deployment, source coverage, and recovery details.

## Seed and reset datasets

With the local backend running:

```sh
npm run seed:demo
npm run seed:history
npm run seed:eval
npm run evaluate:datasets

# Start a fresh demo generation; preserve the archived records
npm run seed:demo -- --reset
```

Seeding is idempotent. These commands are restricted to a local development backend and use a dedicated anonymous seed identity, retained in ignored `.context/dataset-session.json`. The browser’s Dataset selector loads the same fixtures into the browser user’s own workspace. Reset archives only the selected dataset generation rather than deleting its financial history.

See [dataset inventory, commands, and evaluation results](docs/datasets.md). The original $750 example remains available in the original workspace for compatibility with earlier demonstrations and verification reports.

## Verify

```sh
npm run typecheck
npm run test:report
npm run test:apify-actor
npm run test:learner
npm run build

# Six adversarial scenarios through the local deterministic backend
npm run evaluate:datasets
```

The latest [recorded verification](docs/deployment.md#verified-release--october-25-2026) passed **156 TypeScript/backend tests**, **seven Apify Actor tests**, **six Policy Learner tests**, typechecking, and the production build. The six dataset evaluations also passed through the local deterministic backend before the Moss merge. These checks cover financial rules, source references, duplicate posting, workspace isolation, stale decisions, corrections, authorization, retrieval, and policy learning.

The Evaluation screen reads `public/evaluation.json`, generated from executed Vitest assertions with a source hash and timestamp. This is not a live AI accuracy benchmark. Workflow-component logging during tests is expected. No lint script is currently configured.

Additional integration checks:

```sh
npm run evaluate:learning
npm run evaluate:learning:live
npm run evaluate:moss:live
npm run evaluate:apify:live
```

The live commands require their respective configured providers and contact external services. Reports are retained under `.context/`. See [invoice live verification](docs/live-verification.md), [policy learning verification](docs/policy-learning-verification.md), [Moss verification](docs/moss-retrieval.md), and [Apify verification](docs/apify-schedules.md#verification) for the scope and limitations of recorded runs. The hosted synthetic demo is deployed to Vercel and Convex Cloud; the earlier live-provider verification results do not imply those providers are enabled on that deployment.

## What we learned and what’s next

An autonomous finance employee needs more than invoice extraction: organizational context, persistent ownership, specialized responsibilities, reliable calculations, and accountability. Realistic synthetic environments help test whether the system can handle unfamiliar cases instead of reproducing an expected answer.

We’re expanding the approach toward prepaid expenses, accruals, procurement compliance, and financial close, while deepening the use of approved corrections and historical decisions in future investigations. See [architecture and implementation status](docs/implementation.md) for current controls, limits, and production requirements.

Traditional software records what happened. Attest takes responsibility for what happens next.
