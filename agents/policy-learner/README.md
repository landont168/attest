# Create Attest Policy Learner

1. Create a separate saved agent at https://agent.creao.ai/ named **Attest Policy Learner**. Keep the existing Contract Investigator unchanged.
2. Give it one required text input named `prompt`. Use the existing non-Anthropic model choice. Instructions configure the saved agent; do not paste SKILL.md as a runtime prompt.
3. Install SKILL.md as its instructions; stage output-contract.md and normalize_output.py as agent files. Permit its sandbox Python execution for validation only; do not attach application write tools.
4. Set the persisted output mapping to `memory.persist_fields: [resultJson]`. Return the resultJson envelope in the main API result.
5. Publish/save the agent and copy its ID into CREAO_POLICY_AGENT_ID in .env.integrations.local. If the existing capi key is agent-scoped, provide an authorized key as CREAO_POLICY_API_KEY.
6. Run `npm run configure:integrations`. This configures only the existing local/development Convex target.
7. Run `npm run evaluate:learning:live`. The command uses an isolated anonymous sandbox and writes a private report under .context/. An agent success status alone is not a passed scenario.

examples.json contains input/output examples. They are illustrations, not answer keys for arbitrary requests. Never put credentials into these files.

## First manual smoke test

After saving the agent and its files, copy the entire contents of `smoke-request.json` into the agent's **prompt text input** and run it. This is an intentionally evidence-free, valid Meridian request. Expect `insufficient_evidence`, null procedure, empty precedentCodes and correctionCodes, schemaVersion 1, and vendorId VEN-MERIDIAN. The description may vary. `smoke-expected-envelope.json` shows valid serialization, including escaped quotes inside resultJson.

A response to setup prose with no context does not test the integration. Do not use UNKNOWN, singular correctionCode, or omit schemaVersion. Never hand-build the escaped envelope: run the supplied normalizer with `--envelope` and return stdout unchanged. An agent that returns those older field names has not installed or followed the current output-contract.md.

If configuring the agent through a CREAO builder chat, ask it to **update the saved agent**, not execute the setup instructions as a learning job. Confirm the saved agent has these staged files and only the scalar resultJson persistence field before copying its ID.
