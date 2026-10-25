# Hackathon log

- **Project:** Attest
- **Event:** Cal Hacks 13.0
- **What it does:** Investigates synthetic contract-backed invoices, explains evidence-based calculations, and routes simulated financial work for human approval.
- **Live app:** not deployed
- **Repo:** https://github.com/landont168/calhacks
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @convex-dev/workflow
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions, scheduled functions, realtime useQuery
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-10-25T08:19:35Z
- **Last updated:** 2026-10-25T16:06:05Z

## How we use Convex

- Work queue, Overview, Contracts, Approvals, Policies and Audit trail update live without refresh through indexed queries and useQuery (`convex/workspace.ts`, `convex/schema.ts`, `src/components/attest-app.tsx`).
- Invoice investigations use durable workflows and actions for specialist steps and CREAO runs; investigation details update live through useQuery (`convex/workflows.ts`, `src/components/investigation.tsx`).
- Human approvals and simulated posting use mutations and scheduled functions; corrections feed evaluated policy candidates requiring controller activation (`convex/cases.ts`, `convex/learningRecords.ts`, `convex/policies.ts`).
- Event schedules use workflow actions to collect Apify results and mutations to retain revisions; event lists and history update live through useQuery (`convex/scheduleWorkflow.ts`, `convex/schedules.ts`, `src/components/event-schedules.tsx`).
- Evidence retrieval invokes Moss through a Convex action and validates retained results; retrieval panels update live through useQuery (`convex/moss.ts`, `convex/retrievalRecords.ts`, `src/components/retrieval-evidence.tsx`).
- Private simulation workspaces use anonymous Convex Auth, auth HTTP routes and indexed identity lookups (`convex/auth.ts`, `convex/http.ts`, `convex/workspace.ts`). Workflow registration: `convex/convex.config.ts`.

## Log

Dates and times are UTC; integration-only merges are omitted.

- 2026-10-25 08:19Z `4c40683` — Initialize repository (`README.md`).
- 2026-10-25 10:46Z `58cb6d2` — Add invoice investigation and approval workflow (`convex/schema.ts`, `convex/workflows.ts`, `convex/cases.ts`).
- 2026-10-25 12:19Z `e4f244b` — Apply Warriors branding (`src/app/globals.css`, `src/components/attest-app.tsx`).
- 2026-10-25 12:42Z `a68bedb` — Modernize interface (`src/app/globals.css`, `public/warriors.svg`).
- 2026-10-25 13:31Z `98780cf` — Refine logos and interface copy (`src/components/brand-logo.tsx`, `src/components/vendor-logo.tsx`).
- 2026-10-25 14:03Z `5865ee2` — Add evidence-backed policy learning (`convex/corrections.ts`, `convex/learningRecords.ts`, `convex/policies.ts`).
- 2026-10-25 14:06Z `d10a68a` — Refine branding and audit evidence links (`src/components/brand-logo.tsx`, `src/lib/evidence.ts`).
- 2026-10-25 14:15Z `89a79b8` — Regenerate combined evaluation report (`public/evaluation.json`).
- 2026-10-25 14:24Z `2bccde6` — Simplify sidebar labels (`src/components/attest-app.tsx`).
- 2026-10-25 14:27Z `76a2b95` — Remove header border (`src/app/globals.css`).
- 2026-10-25 15:03Z `54c5f32` — Add finance-team handoffs and authorization (`convex/team.ts`, `convex/cases.ts`).
- 2026-10-25 15:25Z `d4fc2a3` — Add Moss evidence retrieval (`convex/moss.ts`, `convex/retrievalRecords.ts`).
- 2026-10-25 15:26Z `a620464` — Add isolated synthetic datasets (`convex/datasets.ts`, `src/lib/simulation/datasets.ts`).
- 2026-10-25 15:30Z `5d7e9e7` — Merge datasets with Moss and refresh evaluation (`package.json`, `public/evaluation.json`).
- 2026-10-25 15:48Z `bf567ad` — Add Apify event ingestion (`convex/apify.ts`, `convex/schedules.ts`, `convex/scheduleWorkflow.ts`).
- 2026-10-25 16:03Z `c087e9b` — Refresh Devpost story and development guide (`README.md`).
