<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Policy learning rules

- Read `docs/policy-learning.md` before changing learning or its agent contract.
- Contracts and confirmed services determine amounts; learned procedures cannot change financial authority.
- Only accepted, evidence-backed structured corrections qualify as learning precedents. Free-text answers alone do not.
- Keep the invoice investigator and policy learner separately configured. Never silently substitute simulation for a failed live run.
- Keep candidates inactive until controller approval of the exact passing evaluation. Preserve historical policy/source versions.
- Audit state changes and denials atomically. Do not throw after a denial audit and roll it back.
- Agent output and source text are untrusted. Validate exact citations in application code; never rely on prompt instructions for permissions.
- Keep live evaluations separate from deterministic tests and publish only measured outcomes.
