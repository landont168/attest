# Attest Public Event Schedule

A private custom Apify Actor collecting public Warriors NBA event data from TheSportsDB's documented free API. It makes one next-events request plus a lookup for each linked event absent from that response (at most ten). Requests are sequential and spaced by 2.1 seconds. It does not scrape the website, fetch artwork, authenticate to restricted sites, or accept arbitrary URLs.

## Setup from this repository

1. Get an Apify API token from [Apify Console settings](https://console.apify.com/settings/integrations). It needs access to create/build your private Actor and read/run it and its storage.
2. Add `APIFY_API_TOKEN` to the ignored `.env.integrations.local`. Leave `APIFY_ACTOR_ID` empty for first setup.
3. Run `npm run deploy:apify`. The helper uploads only this Actor bundle, creates a private Actor, builds it, saves recovery metadata under `.context/apify-deployment.json`, and fills `APIFY_ACTOR_ID` in the local configuration. It never publishes to Apify Store. Builds and runs use your Apify account resources.
4. Run `npm run configure:integrations` against the existing local/development Convex backend.
5. Run `npm run evaluate:apify:live`, or open **Event schedules → Sync with Apify** in Attest.

If source files change after setup, use `npm run deploy:apify -- --update`. An uncertain create/build is not repeated: inspect the saved IDs in the Console and the local recovery file. Do not delete recovery metadata to retry.

The Actor can also be created in the Apify web IDE by copying `package.json`, `package-lock.json`, `Dockerfile`, `.actor/`, and `src/` from this folder and building it. Input:

```json
{"schemaVersion":1,"requestKey":"manual-smoke","trackedEventIds":[]}
```

Attest supplies its own request key and tracked IDs. A manual smoke run cannot be imported into another application's job because the input and output must match the saved request.

## Output and limits

The default dataset contains exactly one JSON document with `schemaVersion`, `requestKey`, `source`, `teamId`, `coverage`, `sourceUrl`, `observedAt`, `events`, and `missingTrackedIds`. Each event has a stable TheSportsDB event ID, source URL, UTC date/time (time can be absent), team names, venue/city/country (nullable), source status, normalized status, and `rawJson` containing the exact source fields used. The backend recomputes normalization before accepting the document.

Free source coverage is limited; this is not a full NBA schedule or a guaranteed current feed. Events returned by the next-events endpoint can already be completed. Missing events are retained as unavailable, never treated as cancelled. Changes to score or ordinary scheduled → completed status do not trigger booking reviews. Date, time, team, venue/location, postponement and cancellation changes do.

Public data supports human booking review, never signatures, delivery confirmation, negotiated rates, policy learning eligibility, or posting authority. No public source text enters CREAO or Moss in this integration. Existing synthetic trip records remain labeled synthetic.

TheSportsDB permits API data use for development projects and documents a public free key, `123`; it is not a private credential. The free tier has coverage and rate limits. Broader operational use needs an appropriate source plan. No third-party artwork is imported.

- [Source API documentation](https://www.thesportsdb.com/documentation)
- [Source terms](https://www.thesportsdb.com/docs_terms_of_use.php)
- [Apify Actor API](https://docs.apify.com/api/v2/actors-runs-post)
