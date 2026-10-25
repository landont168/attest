# Policy learning output contract v1

Return exactly these seven fields:

| Field | Type | Constraint |
|---|---|---|
| schemaVersion | integer | 1 |
| outcome | string | candidate, no_change, insufficient_evidence |
| vendorId | string | Exact context.vendorId; currently VEN-MERIDIAN only |
| procedure | string or null | controller_confirmation or signed_schedule_first for candidate; null otherwise |
| description | string | 20–4000 characters explaining evidence, uncertainty, and review procedure |
| precedentCodes | array of strings | Exact active context.precedents[].code; at least two distinct for candidate |
| correctionCodes | array of strings | Exact context.corrections[].code; triggering correction required for correction-driven candidate |

`correctionCodes` is always a plural array, including `[]` for abstention. Never return singular correctionCode.

Do not add task, amounts, permissions, or arbitrary instructions. Arrays must be native arrays with unique nonempty strings. No comma splitting, scalar coercion, missing fields, or silently dropped fields.

Persistence: memory.persist_fields must contain ONLY resultJson. The envelope is {"resultJson":"<complete JSON object>"}. Backend parses this once and validates the object independently.

A normalizer pass proves structure only. It does not prove that citations exist, are applicable, or justify the proposal. Those checks belong to Attest.
