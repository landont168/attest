import {
  authorizeFinance,
  type FinanceAction,
} from "../src/lib/finance/organization";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canTransition } from "../src/lib/finance/engine";
import type { Role, State } from "../src/lib/finance/types";
export async function profile(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to your simulation workspace.");
  const p = await ctx.db
    .query("profiles")
    .withIndex("by_identity", (q) => q.eq("identity", identity.tokenIdentifier))
    .unique();
  if (!p) throw new Error("Initialize your workspace.");
  const employee = p.employeeId ? await ctx.db.get(p.employeeId) : null;
  return {
    ...p,
    actorId:
      employee?.sandboxId === p.sandboxId ? employee.actorId : p.identity,
  };
}
export async function ownedCase(ctx: QueryCtx | MutationCtx, id: Id<"cases">) {
  const p = await profile(ctx);
  const c = await ctx.db.get(id);
  if (!c || c.sandboxId !== p.sandboxId)
    throw new Error("Case not found in this workspace.");
  return { p, c };
}
export async function audit(
  ctx: MutationCtx,
  c: Pick<
    Doc<"cases">,
    "sandboxId" | "_id" | "state" | "policyId" | "proposalId"
  >,
  action: string,
  reason: string,
  actor = "attest-investigator",
  role: Role = "ai_agent",
  allowed = true,
  after = c.state,
  evidenceIds: string[] = [],
  refs: { approvalId?: Id<"approvals">; postingRef?: string } = {},
) {
  return ctx.db.insert("audit", {
    sandboxId: c.sandboxId,
    caseId: c._id,
    timestamp: Date.now(),
    actor,
    role,
    action,
    allowed,
    before: c.state,
    after,
    reason,
    evidenceIds,
    ...(c.policyId ? { policyId: c.policyId } : {}),
    ...(c.proposalId ? { proposalId: c.proposalId } : {}),
    ...refs,
  });
}
export async function transition(
  ctx: MutationCtx,
  c: Doc<"cases">,
  to: State,
  phase: string,
  actor = "attest-investigator",
  role: Role = "ai_agent",
) {
  if (!canTransition(c.state as State, to))
    throw new Error(`Invalid transition ${c.state} → ${to}.`);
  await audit(ctx, c, "state_changed", phase, actor, role, true, to);
  await ctx.db.patch(c._id, { state: to, phase, updatedAt: Date.now() });
}

export async function denyWorkspaceAction(
  ctx: MutationCtx,
  p: Awaited<ReturnType<typeof profile>>,
  action: FinanceAction,
) {
  const decision = authorizeFinance({ id: p.actorId, role: p.role }, action);
  if (decision.ok) return null;
  await ctx.db.insert("audit", {
    sandboxId: p.sandboxId,
    timestamp: Date.now(),
    actor: p.actorId,
    role: p.role,
    action: `${action}_denied`,
    allowed: false,
    before: "workspace",
    after: "unchanged",
    reason: decision.reason,
    evidenceIds: [],
  });
  return { ok: false, message: decision.reason };
}
