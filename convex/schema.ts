import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  retrievalTarget,
  retrievalDocument,
  retrievalHit,
  retrievalOutcome,
} from "./retrievalValidators";
import {
  humanRole,
  mode,
  invoiceInput,
  state,
  result,
  role,
  line,
  source,
} from "./validators";
export default defineSchema({
  ...authTables,
  profiles: defineTable({
    identity: v.string(),
    role: humanRole,
    employeeId: v.optional(v.id("employees")),
    sandboxId: v.id("sandboxes"),
  }).index("by_identity", ["identity"]),
  sandboxes: defineTable({
    owner: v.string(),
    generation: v.number(),
    teamVersion: v.optional(v.number()),
    routineApprovalLimitCents: v.optional(v.number()),
    mode,
    archived: v.boolean(),
    createdAt: v.number(),
  }),
  cases: defineTable({
    sandboxId: v.id("sandboxes"),
    input: invoiceInput,
    ownerActorId: v.optional(v.string()),
    revision: v.number(),
    state,
    phase: v.string(),
    mode,
    updatedAt: v.number(),
    attempt: v.number(),
    proposalId: v.optional(v.id("proposals")),
    policyId: v.optional(v.id("policies")),
    workflowId: v.optional(v.string()),
    runId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    error: v.optional(v.string()),
    resolution: v.optional(
      v.object({
        sourceId: v.string(),
        amountCents: v.number(),
        text: v.string(),
        actor: v.string(),
      }),
    ),
  })
    .index("by_sandboxId", ["sandboxId"])
    .index("by_sandboxId_and_code", ["sandboxId", "input.code"]),
  proposals: defineTable({
    caseId: v.id("cases"),
    sandboxId: v.id("sandboxes"),
    revision: v.number(),
    attempt: v.number(),
    createdAt: v.number(),
    proposedBy: v.string(),
    correctionId: v.optional(v.id("corrections")),
    result,
    input: invoiceInput,
    policyId: v.optional(v.id("policies")),
    mode,
    runId: v.optional(v.string()),
  })
    .index("by_caseId", ["caseId"])
    .index("by_policyId", ["policyId"]),
  approvals: defineTable({
    caseId: v.id("cases"),
    proposalId: v.id("proposals"),
    action: v.string(),
    decision: v.string(),
    actor: v.string(),
    role: humanRole,
    reason: v.string(),
    createdAt: v.number(),
    revision: v.number(),
  }).index("by_caseId", ["caseId"]),
  questions: defineTable({
    assignedActorId: v.optional(v.string()),
    requiredRole: v.optional(humanRole),
    evidenceKind: v.optional(v.string()),
    status: v.optional(v.string()),
    caseId: v.id("cases"),
    text: v.string(),
    createdAt: v.number(),
    answer: v.optional(v.string()),
    answeredBy: v.optional(v.string()),
    answeredAt: v.optional(v.number()),
  }).index("by_caseId", ["caseId"]),
  journals: defineTable({
    caseId: v.id("cases"),
    sandboxId: v.id("sandboxes"),
    reference: v.string(),
    proposalId: v.id("proposals"),
    approvalId: v.id("approvals"),
    lines: v.array(line),
    period: v.string(),
    createdAt: v.number(),
    reversalOf: v.optional(v.id("journals")),
    reason: v.string(),
  })
    .index("by_caseId", ["caseId"])
    .index("by_reference", ["reference"])
    .index("by_sandboxId", ["sandboxId"]),
  audit: defineTable({
    sandboxId: v.id("sandboxes"),
    caseId: v.optional(v.id("cases")),
    timestamp: v.number(),
    actor: v.string(),
    role,
    action: v.string(),
    allowed: v.boolean(),
    before: v.string(),
    after: v.string(),
    reason: v.string(),
    evidenceIds: v.array(v.string()),
    policyId: v.optional(v.id("policies")),
    proposalId: v.optional(v.id("proposals")),
    approvalId: v.optional(v.id("approvals")),
    postingRef: v.optional(v.string()),
    learningJobId: v.optional(v.id("policyRuns")),
    correctionId: v.optional(v.id("corrections")),
    changes: v.optional(
      v.array(
        v.object({ field: v.string(), before: v.string(), after: v.string() }),
      ),
    ),
  })
    .index("by_sandboxId", ["sandboxId"])
    .index("by_caseId", ["caseId"]),
  corrections: defineTable({
    sandboxId: v.id("sandboxes"),
    caseId: v.id("cases"),
    code: v.string(),
    kind: v.literal("overlooked_signed_schedule"),
    originalProposalId: v.id("proposals"),
    originalRevision: v.number(),
    responseRevision: v.number(),
    policyId: v.optional(v.id("policies")),
    sourceIds: v.array(v.string()),
    sources: v.array(source),
    originalInput: invoiceInput,
    explanation: v.string(),
    actor: v.string(),
    createdAt: v.number(),
  })
    .index("by_caseId_and_responseRevision", ["caseId", "responseRevision"])
    .index("by_sandboxId", ["sandboxId"]),
  evaluations: defineTable({
    sandboxId: v.id("sandboxes"),
    jobId: v.id("policyRuns"),
    policyId: v.id("policies"),
    suiteVersion: v.string(),
    reportJson: v.string(),
    contextJson: v.string(),
    passed: v.boolean(),
    createdAt: v.number(),
  }).index("by_policyId", ["policyId"]),
  precedents: defineTable({
    sandboxId: v.id("sandboxes"),
    code: v.string(),
    vendor: v.string(),
    date: v.string(),
    title: v.string(),
    explanation: v.string(),
    active: v.boolean(),
    correctionId: v.optional(v.id("corrections")),
    proposalId: v.optional(v.id("proposals")),
    approvalId: v.optional(v.id("approvals")),
    synthetic: v.optional(v.boolean()),
  })
    .index("by_sandboxId", ["sandboxId"])
    .index("by_sandboxId_and_vendor_and_active", [
      "sandboxId",
      "vendor",
      "active",
    ])
    .index("by_correctionId", ["correctionId"]),
  policies: defineTable({
    sandboxId: v.id("sandboxes"),
    version: v.number(),
    title: v.string(),
    vendor: v.string(),
    status: v.union(
      v.literal("candidate"),
      v.literal("active"),
      v.literal("superseded"),
      v.literal("rejected"),
    ),
    procedure: v.union(
      v.literal("controller_confirmation"),
      v.literal("signed_schedule_first"),
    ),
    description: v.string(),
    precedentIds: v.array(v.string()),
    createdAt: v.number(),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    checks: v.array(v.object({ name: v.string(), passed: v.boolean() })),
    origin: v.string(),
    jobId: v.optional(v.id("policyRuns")),
    evaluationId: v.optional(v.id("evaluations")),
    proposedBy: v.optional(v.string()),
    rejectedBy: v.optional(v.string()),
    rejectedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
  })
    .index("by_sandboxId", ["sandboxId"])
    .index("by_sandboxId_and_vendor_and_status", [
      "sandboxId",
      "vendor",
      "status",
    ]),
  policyRuns: defineTable({
    sandboxId: v.id("sandboxes"),
    mode,
    procedure: v.optional(
      v.union(
        v.literal("controller_confirmation"),
        v.literal("signed_schedule_first"),
      ),
    ),
    status: v.string(),
    createdAt: v.number(),
    runId: v.optional(v.string()),
    error: v.optional(v.string()),
    policyId: v.optional(v.id("policies")),
    caseId: v.optional(v.id("cases")),
    correctionId: v.optional(v.id("corrections")),
    contextJson: v.optional(v.string()),
    proposalContextJson: v.optional(v.string()),
    outputJson: v.optional(v.string()),
    raw: v.optional(v.string()),
    outcome: v.optional(v.string()),
    submissionStatus: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    baselinePolicyId: v.optional(v.id("policies")),
    retryOf: v.optional(v.id("policyRuns")),
  })
    .index("by_sandboxId", ["sandboxId"])
    .index("by_correctionId", ["correctionId"])
    .index("by_retryOf", ["retryOf"]),
  employees: defineTable({
    sandboxId: v.id("sandboxes"),
    code: v.string(),
    actorId: v.string(),
    name: v.string(),
    role,
    kind: v.string(),
    department: v.string(),
  })
    .index("by_sandboxId_and_code", ["sandboxId", "code"])
    .index("by_sandboxId", ["sandboxId"]),
  subtasks: defineTable({
    sandboxId: v.id("sandboxes"),
    caseId: v.id("cases"),
    revision: v.number(),
    attempt: v.number(),
    assignedActorId: v.string(),
    requestedBy: v.string(),
    kind: v.union(
      v.literal("contract"),
      v.literal("payment"),
      v.literal("dispute"),
    ),
    request: v.string(),
    requiredEvidence: v.array(v.string()),
    status: v.string(),
    output: v.optional(v.any()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    auditId: v.optional(v.id("audit")),
  })
    .index("by_caseId", ["caseId"])
    .index("by_sandboxId", ["sandboxId"]),
  bankRecords: defineTable({
    sandboxId: v.id("sandboxes"),
    transactionId: v.string(),
    contractId: v.string(),
    vendorId: v.string(),
    amountCents: v.number(),
    paidAt: v.string(),
    status: v.string(),
    sourceId: v.string(),
  })
    .index("by_sandboxId_and_transactionId", ["sandboxId", "transactionId"])
    .index("by_sandboxId", ["sandboxId"]),
  paymentCredits: defineTable({
    sandboxId: v.id("sandboxes"),
    invoiceCode: v.string(),
    transactionId: v.string(),
    contractId: v.string(),
    vendorId: v.string(),
    amountCents: v.number(),
    sourceId: v.string(),
  })
    .index("by_sandboxId_and_invoiceCode", ["sandboxId", "invoiceCode"])
    .index("by_sandboxId_and_transactionId", ["sandboxId", "transactionId"])
    .index("by_sandboxId", ["sandboxId"]),
  disputes: defineTable({
    sandboxId: v.id("sandboxes"),
    caseId: v.id("cases"),
    proposalId: v.id("proposals"),
    revision: v.number(),
    assignedActorId: v.string(),
    amountCents: v.number(),
    status: v.string(),
    draft: v.string(),
    evidenceIds: v.array(v.string()),
    requiredApprover: v.string(),
    communicationMode: v.literal("draft_only"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_caseId", ["caseId"])
    .index("by_sandboxId", ["sandboxId"]),
  retrievals: defineTable({
    sandboxId: v.id("sandboxes"),
    target: retrievalTarget,
    caseId: v.optional(v.id("cases")),
    attempt: v.optional(v.number()),
    jobId: v.optional(v.id("policyRuns")),
    version: v.string(),
    query: v.string(),
    documents: v.array(retrievalDocument),
    status: v.union(v.literal("pending"), v.literal("completed")),
    outcome: v.optional(retrievalOutcome),
    hits: v.array(retrievalHit),
    selectedCodes: v.array(v.string()),
    rejectedCount: v.number(),
    queryMs: v.optional(v.number()),
    totalMs: v.optional(v.number()),
    error: v.optional(v.string()),
    passedToAgent: v.boolean(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_caseId_and_attempt", ["caseId", "attempt"])
    .index("by_jobId", ["jobId"])
    .index("by_sandboxId", ["sandboxId"]),
  periods: defineTable({
    sandboxId: v.id("sandboxes"),
    month: v.string(),
    closed: v.boolean(),
  }).index("by_sandboxId_and_month", ["sandboxId", "month"]),
  runs: defineTable({
    caseId: v.id("cases"),
    attempt: v.number(),
    externalId: v.optional(v.string()),
    status: v.string(),
    raw: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_caseId", ["caseId"]),
});
