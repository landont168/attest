import type { InvoiceInput, Result } from "./types";
export type BankRecord = {
  transactionId: string;
  contractId: string;
  vendorId: string;
  amountCents: number;
  paidAt: string;
  status: string;
  sourceId: string;
};
export type PaymentCredit = {
  invoiceCode: string;
  transactionId: string;
  contractId: string;
  vendorId: string;
  amountCents: number;
  sourceId: string;
};
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function paymentFinding(
  input: InvoiceInput,
  bank: BankRecord[],
  credits: PaymentCredit[],
) {
  const issues: string[] = [];
  const deposit = input.deposit;
  if (!deposit)
    return {
      kind: "payment" as const,
      depositCents: 0,
      creditedCents: 0,
      sourceIds: [] as string[],
      transactionIds: [] as string[],
      issues,
      summary: "No deposit obligation is recorded for this invoice.",
    };
  const matching = bank.filter(
    (b) => b.transactionId === deposit.transactionId,
  );
  const paid = matching[0];
  const source = input.sources.find((s) => s.id === deposit.bankSourceId);
  if (
    matching.length !== 1 ||
    !paid ||
    paid.status !== "settled" ||
    paid.vendorId !== input.vendorId ||
    paid.contractId !== input.contractId ||
    paid.amountCents !== deposit.amountCents ||
    paid.sourceId !== deposit.bankSourceId ||
    !validDate(paid.paidAt) ||
    paid.paidAt > input.invoiceDate ||
    source?.date !== paid.paidAt ||
    !Number.isSafeInteger(paid.amountCents) ||
    paid.amountCents <= 0 ||
    !source?.signed ||
    source.kind !== "payment"
  )
    issues.push(
      "A unique settled bank payment matching the vendor, contract, amount and dated bank evidence is required.",
    );
  const applied = credits.filter(
    (c) => c.transactionId === deposit.transactionId,
  );
  const creditSource = input.sources.find(
    (s) => s.id === deposit.creditSourceId,
  );
  if (
    applied.length !== 1 ||
    applied[0]?.invoiceCode !== input.code ||
    applied[0]?.vendorId !== input.vendorId ||
    applied[0]?.contractId !== input.contractId ||
    applied[0]?.amountCents !== deposit.amountCents ||
    applied[0]?.sourceId !== deposit.creditSourceId ||
    !creditSource?.signed ||
    creditSource.kind !== "credit" ||
    !validDate(creditSource.date) ||
    creditSource.date > input.invoiceDate
  )
    issues.push(
      "The deposit must be credited exactly once to this invoice; duplicate, missing or misapplied credits require review.",
    );
  return {
    kind: "payment" as const,
    depositCents: issues.length ? 0 : paid.amountCents,
    creditedCents: issues.length ? 0 : applied[0].amountCents,
    sourceIds: [deposit.bankSourceId, deposit.creditSourceId],
    transactionIds: [deposit.transactionId],
    issues,
    summary: issues.length
      ? "Deposit reconciliation requires review."
      : "Settled deposit verified against the bank record and credited exactly once in AP.",
  };
}
export function applySettlement(
  input: InvoiceInput,
  result: Result,
  finding: ReturnType<typeof paymentFinding>,
): Result {
  if (!input.deposit) return result;
  const issues = [...result.issues, ...finding.issues];
  const due =
    result.expectedCents === null
      ? null
      : result.expectedCents - finding.depositCents;
  if (due !== null && due < 0)
    issues.push("Deposit exceeds the supported gross charge.");
  if (issues.length)
    return {
      ...result,
      disposition: "needs_info",
      expectedCents: null,
      differenceCents: null,
      cohorts: [],
      depositCents: finding.depositCents,
      remainingDueCents: null,
      invoiceOutstandingCents: null,
      issues: [...new Set(issues)],
      explanation:
        "Contract, delivery and payment evidence must all validate before approval.",
    };
  return {
    ...result,
    depositCents: finding.depositCents,
    invoiceOutstandingCents: result.invoiceCents - finding.depositCents,
    remainingDueCents: due,
    evidenceIds: [...new Set([...result.evidenceIds, ...finding.sourceIds])],
  };
}
