# Public event schedules through Apify

Attest runs a private custom Apify Actor to collect structured Warriors NBA observations from TheSportsDB. A human can link an event to a synthetic trip and contract case. Later date, time, venue, team, postponement or cancellation changes open an operational review with the previous and current source revisions.

Public events cannot establish negotiated rates, signatures, delivered services, approval authority or payable amounts. This integration never modifies invoice inputs, proposals, approvals, journals or policy-learning eligibility. Public source text is not passed to CREAO or Moss. Acknowledging a booking review records the human's note; financial changes still require the existing evidence and approval workflow.

## Setup and use

Install the [Actor bundle](../integrations/apify-actor/README.md). Save `APIFY_API_TOKEN` in the ignored `.env.integrations.local`, leave `APIFY_ACTOR_ID` blank for initial setup, then run:

```sh
npm run deploy:apify
npm run configure:integrations
npm run evaluate:apify:live
```

The deploy helper creates a private Actor, builds its allowlisted source files and writes the returned Actor ID locally. It retains creation/build state in `.context/apify-deployment.json`. Use `npm run deploy:apify -- --update` for source changes to that same Actor. Nothing is published to Apify Store. The configuration helper only targets local/development Convex backends and never logs credential values. No new secrets are exposed to the browser.

In Attest, open **Event schedules → Sync with Apify**. Select an observed event and a synthetic booking, enter the reason they belong together, and link them. The case's **Event schedule** tab shows its links and review history. The global page shows open reviews and source revision history. Links preserve the original case revision and contract identity even if the case later changes. An initial link outside the booking dates, or to a cancelled/postponed event, opens a review immediately. Date comparisons use the source's UTC date and explicitly ask the reviewer to verify time zones.

AP Managers and Controllers can sync or reconcile runs. They and Travel Operations can link events and acknowledge reviews. Other roles can inspect records. These are simulated roles within an authenticated, isolated sandbox, not organization-wide production permissions.

## Source and coverage

- [TheSportsDB API documentation](https://www.thesportsdb.com/documentation) documents the public free key `123`, next-team-events and event-lookup endpoints. This key is not a secret.
- [TheSportsDB terms](https://www.thesportsdb.com/docs_terms_of_use.php) permit API data use for development; broader use needs an appropriate source plan.
- One next-events request is followed by sequential lookups for linked events absent from that response, with 2.1 seconds between requests.
- The free feed is limited and may be delayed or return completed games. This does not provide a complete/current season schedule or independent verification of the source.
- An absent tracked event is recorded as unavailable. Its last observation remains intact; absence never means cancellation.
- No third-party artwork, scores or unrelated descriptive text is ingested. No arbitrary URLs, scraping redirects, access-control bypass or proxy services are accepted.
- There is no automatic recurring schedule. Sync is explicit, with one unresolved run at a time and a one-minute interval per sandbox.

Supported bounds: 10 linked events, 40 event/case links, 20 events per batch, 100 retained event identities per sandbox. The UI returns the latest 10 sync jobs, latest 10 revisions per event and at most 100 reviews. Immutable older revisions are retained in Convex.

## Persistence and recovery

The existing Convex durable-workflow component performs a submission step with retries disabled and retryable read-only polling steps. An atomic claim allows only one provider POST. The saved request contains the Actor ID, sandbox, requesting actor, tracked IDs and stable request key. The Actor receives no invoice or contract content.

Every completed run verifies its Actor ID, input request key and tracked IDs before reading its dataset. Exactly one strict, versioned envelope is accepted. Convex recomputes every normalized event from retained source fields, rejects mismatched scope/IDs/dates or duplicate events, and verifies observation timestamps and tracked-event coverage. Data revisions, review creation and audit events commit together. Duplicate callbacks are harmless. Older observations cannot replace newer ones.

If submission might have succeeded but its response was lost, the job is **uncertain**. Attest blocks another sync. Find the existing run in Apify Console using the saved request key, enter its run ID, and choose **Resume existing run**. Attest verifies ownership and input before importing anything. A wrong unverified run ID can be corrected. A verified run ID cannot be substituted. A known run that timed out while polling resumes polling only; it never starts another provider run. Definitive failed/aborted/timed-out runs allow a new request after the interval. Archived workspaces ignore late callbacks.

The Actor setup helper applies the same rule to uncertain Actor creation and build submissions: retain the state file, inspect the account, and reconcile the returned ID. Do not delete the state to retry creation.

New tables are additive: `scheduleSyncs`, `scheduleEvents`, `scheduleRevisions`, `scheduleLinks`, and `scheduleReviews`. Existing user data is not reset. Denied user mutations return structured results after saving their audit event, preserving the reason rather than rolling it back with an exception.

## Verification

```sh
npm run typecheck
npm run test:report
npm run test:apify-actor
npm run test:learner
npm run build
```

The backend tests use real Convex mutations/workflows with mocked external HTTP. They cover immutable revisions, duplicate callbacks/submissions, uncertain-run recovery, wrong Actor/input rejection, missing/stale observations, malformed normalized data, role/ownership denials, booking reviews and preservation of financial records. Actor tests cover bounded collection, exact source fields, tracked lookups, missing events and rejected source errors.

`npm run evaluate:apify:live` explicitly starts **two hosted runs** and uses a fresh anonymous sandbox. It retains the sandbox/job/run/build/dataset IDs and observations in `.context/apify-live-*.json`, verifies linking/review and financial invariants, then signs out. It does not reset another sandbox or manufacture source changes. Empty live data can verify collection but cannot verify linking, and is reported as incomplete. If a run fails or is uncertain, inspect the retained job before repeating the command. Builds and runs use Apify account resources.

Automated test counts and live observations are reported separately. A small live sample does not establish feed accuracy, freshness or reliability. Bright Data independent verification and production deployment remain outside this integration.

### Measured result — October 25, 2026

- Type checking, production build and whitespace checks passed. The full suite passed **139 TypeScript/backend tests**, including **20 Apify backend tests**. Separately, **7 Actor tests** and **6 Policy Learner Python tests** passed.
- Private Actor `49in8QRVJkoatauwT` built successfully as `o4PyUkUikmXGJg5ba`. The initial build rejected missing input-schema descriptions; the corrected build reused the same private Actor. Its privacy was read back as `isPublic:false`.
- Fresh-sandbox live report: `.context/apify-live-mvnzvtv9.json`, **14/14 assertions passed across two hosted runs**. First run `Vdl3dU55pXcV8BN9I` imported event `2601700` (Warriors at Suns, October 25, PHX Arena). Tracked refresh `8ljiIgG1YHXauWkGq` retained that event at version 1, with zero new events and zero revised events.
- The source reported the event as completed. No real schedule change was observed. Date/venue-change review creation was verified using synthetic automated scenarios, not presented as a live-source change.
- A deliberately mismatched link to a synthetic booking opened an out-of-range review. Acknowledgement and refresh preserved the invoice input, proposal, approval list and journal list; the supported hotel amount remained **$12,500**.
- Browser run `kUzbRNa10Fu5tAYhp` also succeeded. Browser verification covered sync status, explicit linking, review acknowledgement, case navigation and revision history. The browser test link is labeled as verification only. Existing financial state was not changed.
- The frontend and Convex backend ran locally. The Actor ran on Apify; no production Convex or frontend deployment was performed.

After rebasing onto the merged synthetic-dataset PR #7, type checking, production build and all **150 TypeScript/backend tests** passed. The 7 Actor tests and 6 Python normalizer tests also passed again. The live results above were measured before this rebase; no additional provider run was needed for the package-script, CSS and generated-report conflict resolutions.
