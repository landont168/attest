import { z } from "zod";
export const sourceSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "contract",
    "amendment",
    "service",
    "invoice",
    "communication",
    "resolution",
    "payment",
    "credit",
  ]),
  title: z.string(),
  date: z.string(),
  text: z.string(),
  clause: z.string(),
  signed: z.boolean(),
});
export const termSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  contractId: z.string(),
  vendorId: z.string(),
  label: z.string(),
  quantity: z.number().int().positive(),
  rateCents: z.number().int().nonnegative(),
  start: z.string(),
  end: z.string(),
  scope: z.enum(["original", "additional", "supersede"]),
  supersedes: z.array(z.string()),
});
export const inputSchema = z.object({
  code: z.string().min(1).max(80),
  vendor: z.string(),
  vendorId: z.string(),
  contractId: z.string(),
  destination: z.string(),
  start: z.string(),
  end: z.string(),
  invoiceDate: z.string(),
  currency: z.literal("USD"),
  unit: z.literal("room-night"),
  lines: z
    .array(
      z.object({
        label: z.string(),
        quantity: z.number().int().positive(),
        rateCents: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(30),
  terms: z.array(termSchema).max(30),
  service: z.object({
    sourceId: z.string(),
    vendorId: z.string(),
    contractId: z.string(),
    quantity: z.number().int().positive(),
    confirmed: z.boolean(),
  }),
  sources: z.array(sourceSchema).max(50),
  deposit: z.optional(
    z.object({
      transactionId: z.string(),
      amountCents: z.number().int().positive(),
      bankSourceId: z.string(),
      creditSourceId: z.string(),
    }),
  ),
});
export type InvoiceInput = z.infer<typeof inputSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Term = z.infer<typeof termSchema>;
export type Cohort = {
  termId: string;
  sourceId: string;
  label: string;
  quantity: number;
  rateCents: number;
  amountCents: number;
};
export type Result = {
  disposition: "matched" | "disputed" | "needs_info";
  invoiceCents: number;
  expectedCents: number | null;
  differenceCents: number | null;
  cohorts: Cohort[];
  evidenceIds: string[];
  explanation: string;
  issues: string[];
  depositCents?: number;
  invoiceOutstandingCents?: number | null;
  remainingDueCents?: number | null;
};
export type State =
  | "NEW"
  | "INVESTIGATING"
  | "NEEDS_INFO"
  | "PROPOSED"
  | "APPROVED"
  | "POSTED"
  | "REJECTED"
  | "REVISION_REQUIRED"
  | "FAILED_RETRYABLE";
export type Role =
  | "human_accountant"
  | "human_controller"
  | "travel_coordinator"
  | "vendor_manager"
  | "internal_auditor"
  | "contract_finance"
  | "payment_reconciliation"
  | "vendor_dispute"
  | "ai_agent"
  | "posting_gateway"
  | "sync_job";
export type Mode = "deterministic" | "creao";
export const interpretationSchema = z.object({
  invoiceId: z.string(),
  disposition: z.enum(["matched", "disputed", "needs_info"]),
  termIds: z.array(z.string()).max(30),
  evidenceIds: z.array(z.string()).max(50),
  explanation: z.string().min(1).max(8000),
  missingEvidence: z.array(z.string()).max(20),
});
export type Interpretation = z.infer<typeof interpretationSchema>;
export type JournalLine = {
  account: string;
  debitCents: number;
  creditCents: number;
};
