# Moss evidence retrieval

Attest uses `@moss-js/moss` 1.21.0 in a Convex Node action to rank signed source excerpts and eligible historical decisions before investigation or policy learning. Convex remains the authoritative store. The finance engine still receives all current terms and sources; search never changes amounts, signatures, posting permission, or policy approval authority.

## Flow and scope

1. The durable workflow creates one retrieval record per case attempt or learning job. It captures the query, schema version, document identifiers and exact source versions.
2. An indexed Convex query reads at most 30 active precedents for the sandbox and vendor. Known synthetic history is explicitly labeled; correction precedents must still have a matching approved, financially validated proposal and valid original correction evidence. Invoice history excludes decisions dated after that invoice.
3. Invoice searches also include up to 50 existing signed contract/amendment sources whose terms match the contract, vendor and service dates. Superseded terms are excluded from search. Current financial evidence is always supplied in full to the finance engine and investigator, including conflicts and missing signatures.
4. The action opens a fresh Moss session, adds that bounded working set, and requests up to six hybrid matches (`alpha: 0.8`, the SDK default). Embedding/indexing/query run in process. Sessions are closed after use. No `pushIndex`, cloud document sync, uploaded index, separate database or embedding service is used. The SDK still authenticates, may fetch model assets, and reports usage to Moss; this is not an offline or zero-network claim.
5. Convex rechecks returned IDs and exact document versions on receipt and again when preparing agent context. Unknown, duplicate, stale and nonfinite-score hits are rejected. Only canonical stored text is exposed; provider excerpts and metadata are never trusted.
6. Ranked history narrows the learner's proposal context. Its triggering correction and inactive counterexamples remain mandatory, independent of ranking. The full original learning snapshot stays intact for evaluation, approval and stale-evidence checks. `proposalContextJson` retains exactly which precedents the learner received, and output citations are validated against it.
7. Missing credentials, an empty corpus or failed search are recorded explicitly. The application continues with validated structured Convex history. A 45-second action deadline prevents optional retrieval from blocking financial work. Existing known CREAO runs resume polling without repeating retrieval or replacing their context.

Retrieval searches existing procedural memory; it does not train a model. Search similarity is not financial confidence or policy eligibility. No evaluation table or held-out learning scenario is included in the searchable corpus.

## Configuration

In the ignored `.env.integrations.local`:

```dotenv
MOSS_PROJECT_ID=...
MOSS_PROJECT_KEY=...
```

Run `npm run configure:integrations` against the existing local/development backend. The helper applies both fields together without printing their values. CREAO configuration stays separate. To disable Moss, remove both variables from that development Convex deployment; clearing the local file alone does not remove deployed values.

`convex.json` externalizes the official SDK because it includes a native Node module. The package lock contains platform-specific optional binaries. `src/lib/integrations/moss.ts` is server-only; it is never imported into frontend components. Native model assets use `/tmp/attest-moss`; session data is never persisted there by Attest. Cold model/authentication/indexing time is measured separately from query time. Cloud deployment and its memory limits require separate verification; this implementation has been verified on the existing local backend.

## UI and audit

- Integrations shows configuration and the latest search outcome in the current sandbox.
- Agent activity → Provider runs → Evidence retrieval shows the query, eligible document count, timing, canonical excerpts and citations.
- Learning results and policy evidence review expose the same retained search.
- A search is marked as passed to an agent only after a provider run ID has been accepted. This is transport evidence, not proof the model reasoned from it.
- Source citations can be compared with the invoice result. The existing invoice-agent contract does not report historical precedent use, so the UI says that use is unreported. Policy outputs do report precedent citations.
- Search completion and rejected matches are recorded in the audit trail. Retrieval queries require identity and ownership of the case or job.

## Verification

```sh
npm run typecheck
npm test
npm run test:learner
npm run build
npm run evaluate:moss:live
```

The explicitly invoked live command authenticates to Moss, runs four labeled queries over ten separate synthetic snippets, then exercises invoice and learning workflows in a fresh anonymous sandbox. It records selected identifiers, query/setup times, precision and recall, provider outcomes, financial checks and the policy approval gate under `.context/moss-live-*.json`. The comparison baseline returns the same bounded corpus without ranking, matching the previous structured lookup; it is not an optimized keyword-search benchmark. These snippets are local to the evaluation command and are never loaded into production learner context.

The application smoke uses deterministic financial reconciliation to isolate real Moss behavior from CREAO availability. It does not claim a live CREAO quality measurement. A separate automated transport test proves that the ranked canonical evidence reaches the investigator, preserves full invoice terms, and records returned citations.

## Measured local results — October 25, 2026

Initial report: `.context/moss-live-mvnya2jy.json`. After rebasing onto PR #5, `.context/moss-live-mvnzal2t.json` passed the same 12/12 live assertions with the specialist handoffs and expanded role permissions in place. The query measurements below refer to the initial report.

- Automated verification after rebasing onto PR #5: 119/119 TypeScript/backend tests, including 12 focused retrieval tests and the finance-team suite; 6/6 Python learner-normalizer tests; type checking and production build passed.
- 12/12 live integration assertions passed: four actual SDK queries, configured backend, workflow Moss use, canonical revalidation, $12,500 expected amount, no posting, honest deterministic-mode labeling, learning retrieval and inactive candidate.
- Four synthetic queries / ten snippets: all five labeled relevant snippets were found in the top six results. Mean recall was 1.00; mean precision at six was 0.208. The unranked ten-document baseline had recall 1.00 and mean precision 0.125. This small curated sample does not establish general relevance or financial accuracy.
- Query times: 2, 2, 3, 2 ms. Setup, indexing and query totals: 1,709, 1,189, 1,116, 993 ms. These are observed local times, not a production latency promise.
- Browser verification: case `INV-MEM-MVNYEGS7` retrieved five canonical matches, then CREAO run `17aad612-63fd-4d3f-b714-f21693c86352` completed and cited both signed sources. The existing controller-confirmation policy correctly kept the case in `NEEDS_INFO`; no policy activation or posting was performed. Screenshot: `.context/moss-retrieval-ui.png`.
- Earlier diagnostic `.context/moss-live-mvny8q64.json` failed canonical revalidation because object-key ordering changed on Convex persistence. Comparison now uses explicit fields, and the completed rerun above verifies the fix. The failed report is retained.

## References

- [Moss sessions](https://docs.moss.dev/docs/reference/js/sessions)
- [Moss query options](https://docs.moss.dev/docs/reference/js/interfaces/QueryOptions)
- [Moss production guidance](https://docs.moss.dev/docs/integrate/deployment-production)
