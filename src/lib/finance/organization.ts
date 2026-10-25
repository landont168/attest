import type { Role } from "./types";

export type FinanceAction =
  | "delegate"
  | "contract_review"
  | "payment_review"
  | "draft_dispute"
  | "approve"
  | "post"
  | "policy"
  | "correct"
  | "respond"
  | "record_resolution"
  | "ingest"
  | "revise"
  | "configure"
  | "propose_policy"
  | "transfer";
export const DEFAULT_APPROVAL_LIMIT = 1_500_000; // Fictional demo policy: $15,000.
export const ROLE_TITLES: Record<string, string> = {
  ai_agent: "Accounts Payable Analyst",
  contract_finance: "Contract Finance Analyst",
  payment_reconciliation: "Payment Reconciliation Analyst",
  vendor_dispute: "Vendor Dispute Specialist",
  human_accountant: "Accounts Payable Manager",
  human_controller: "Financial Controller",
  travel_coordinator: "Travel Operations Coordinator",
  vendor_manager: "Vendor Relationship Manager",
  internal_auditor: "Internal Auditor",
  posting_gateway: "Posting Gateway",
  sync_job: "Source Sync",
};
export const HUMAN_ROLES = [
  "human_accountant",
  "human_controller",
  "travel_coordinator",
  "vendor_manager",
  "internal_auditor",
] as const;
export type HumanRole = (typeof HUMAN_ROLES)[number];
export type EmployeeDefinition = {
  code: string;
  actorId: string;
  name: string;
  role: Role;
  kind: "human" | "specialist" | "orchestrator" | "gateway";
  department: string;
  responsibilities: string[];
  tools: string[];
  allowed: FinanceAction[];
  restrictions: string[];
  escalatesTo: string;
};
export const EMPLOYEES: EmployeeDefinition[] = [
  {
    code: "ap",
    actorId: "attest-investigator",
    name: "Attest AP",
    role: "ai_agent",
    kind: "orchestrator",
    department: "Accounts Payable",
    responsibilities: [
      "Own invoice cases through review and resolution",
      "Delegate evidence reviews and assemble proposals",
    ],
    tools: [
      "AP records",
      "Specialist assignments",
      "Proposal builder",
      "Human requests",
    ],
    allowed: ["delegate"],
    restrictions: [
      "Cannot approve its proposals",
      "Cannot change signed agreements or bank records",
      "Cannot bypass the posting gateway",
    ],
    escalatesTo: "ap-manager",
  },
  {
    code: "contract",
    actorId: "attest-contract-finance",
    name: "Contract Finance",
    role: "contract_finance",
    kind: "specialist",
    department: "Contract Finance",
    responsibilities: [
      "Identify governing versions, rate cohorts and clauses",
      "Flag unsigned or conflicting authority",
    ],
    tools: ["Contract sources", "Amendments", "Approved precedents"],
    allowed: ["contract_review"],
    restrictions: [
      "Read-only contract access",
      "No approval or posting authority",
    ],
    escalatesTo: "ap",
  },
  {
    code: "payment",
    actorId: "attest-payment-reconciliation",
    name: "Payment Reconciliation",
    role: "payment_reconciliation",
    kind: "specialist",
    department: "Treasury Controls",
    responsibilities: [
      "Match settled bank deposits to AP credits",
      "Detect duplicate, missing or misapplied credits",
    ],
    tools: ["Bank records (read only)", "AP credit records (read only)"],
    allowed: ["payment_review"],
    restrictions: [
      "Cannot transfer funds or change bank records",
      "Cannot post adjustments",
    ],
    escalatesTo: "ap",
  },
  {
    code: "dispute",
    actorId: "attest-vendor-dispute",
    name: "Vendor Disputes",
    role: "vendor_dispute",
    kind: "specialist",
    department: "Accounts Payable",
    responsibilities: [
      "Draft source-backed dispute packages",
      "Route proposed disputes for human authorization",
    ],
    tools: ["Approved evidence bundles", "Dispute drafts"],
    allowed: ["draft_dispute"],
    restrictions: [
      "Draft only; no external email integration",
      "No self-approval or fabricated vendor acceptance",
    ],
    escalatesTo: "ap-manager",
  },
  {
    code: "travel",
    actorId: "travel-coordinator",
    name: "Avery Chen",
    role: "travel_coordinator",
    kind: "human",
    department: "Travel Operations",
    responsibilities: [
      "Confirm bookings and delivered services",
      "Answer assigned fulfillment requests",
    ],
    tools: ["Assigned request inbox", "Service confirmation form"],
    allowed: ["respond"],
    restrictions: ["Cannot approve postings or amend contract rates"],
    escalatesTo: "ap-manager",
  },
  {
    code: "ap-manager",
    actorId: "ap-manager",
    name: "Morgan Ellis",
    role: "human_accountant",
    kind: "human",
    department: "Accounts Payable",
    responsibilities: [
      "Review routine proposals within the demo approval limit",
      "Reject with reasons and return work for revision",
    ],
    tools: ["Approval inbox", "Case evidence", "Work queue"],
    allowed: [
      "approve",
      "respond",
      "ingest",
      "revise",
      "configure",
      "propose_policy",
    ],
    restrictions: [
      "Approval limit enforced server-side",
      "Cannot override posted entries or resolve exceptions",
    ],
    escalatesTo: "controller",
  },
  {
    code: "controller",
    actorId: "financial-controller",
    name: "Jordan Reyes",
    role: "human_controller",
    kind: "human",
    department: "Finance",
    responsibilities: [
      "Authorize exceptions and corrected payables",
      "Approve policy activation and linked reversals",
    ],
    tools: [
      "Approval gateway",
      "Evidence review",
      "Authorization settings",
      "Policy review",
    ],
    allowed: [
      "approve",
      "policy",
      "correct",
      "respond",
      "record_resolution",
      "ingest",
      "revise",
      "configure",
      "propose_policy",
    ],
    restrictions: [
      "Cannot alter historical audit events",
      "Cannot approve their own restricted proposal",
    ],
    escalatesTo: "auditor",
  },
  {
    code: "vendor-manager",
    actorId: "vendor-relationship-manager",
    name: "Samira Patel",
    role: "vendor_manager",
    kind: "human",
    department: "Vendor Relations",
    responsibilities: [
      "Supply vendor correction documents",
      "Coordinate dispute responses",
    ],
    tools: ["Dispute drafts", "Vendor response form"],
    allowed: ["record_resolution"],
    restrictions: [
      "No accounting approval",
      "Cannot send through an unconfigured email integration",
    ],
    escalatesTo: "controller",
  },
  {
    code: "auditor",
    actorId: "internal-auditor",
    name: "Taylor Brooks",
    role: "internal_auditor",
    kind: "human",
    department: "Internal Audit",
    responsibilities: [
      "Reconstruct decisions and inspect source-linked history",
    ],
    tools: ["Read-only cases, sources, approvals and audit history"],
    allowed: [],
    restrictions: ["Read-only: no case, financial or policy mutations"],
    escalatesTo: "controller",
  },
  {
    code: "gateway",
    actorId: "posting-gateway",
    name: "Posting Gateway",
    role: "posting_gateway",
    kind: "gateway",
    department: "Financial Controls",
    responsibilities: [
      "Revalidate current authorization and evidence",
      "Post balanced, idempotent journal entries",
    ],
    tools: ["Authorization validator", "Simulated ledger writer"],
    allowed: ["post"],
    restrictions: [
      "Requires current independent human approval",
      "No real bank transfers",
    ],
    escalatesTo: "controller",
  },
];
export function authorizeFinance(
  actor: { id: string; role: Role },
  action: FinanceAction,
  resource: {
    proposer?: string;
    requiresController?: boolean;
    amountCents?: number;
    limitCents?: number;
  } = {},
) {
  if (
    ["approve", "post", "policy", "correct"].includes(action) &&
    actor.id === resource.proposer
  )
    return {
      ok: false,
      reason:
        "The proposing actor cannot approve or execute its own financial action.",
    };
  const definition = EMPLOYEES.find((e) => e.role === actor.role);
  if (!definition?.allowed.includes(action))
    return {
      ok: false,
      reason: `${ROLE_TITLES[actor.role] ?? actor.role} is not authorized to ${action.replaceAll("_", " ")}.`,
    };
  if (
    ["approve", "policy", "correct"].includes(action) &&
    (resource.requiresController || action !== "approve") &&
    actor.role !== "human_controller"
  )
    return {
      ok: false,
      reason: "Financial Controller approval is required for this action.",
    };
  if (
    action === "approve" &&
    actor.role === "human_accountant" &&
    Math.abs(resource.amountCents ?? 0) >
      (resource.limitCents ?? DEFAULT_APPROVAL_LIMIT)
  )
    return {
      ok: false,
      reason:
        "Proposal exceeds the configured AP Manager approval limit; escalate to the Financial Controller.",
    };
  return { ok: true, reason: "Authorized." };
}
