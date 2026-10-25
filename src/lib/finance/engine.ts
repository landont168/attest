import { authorizeFinance } from "./organization";
import {
  inputSchema,
  interpretationSchema,
  type InvoiceInput,
  type Result,
  type JournalLine,
  type State,
  type Role,
} from "./types";
const date = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const safe = (n: number) => Number.isSafeInteger(n) && n >= 0;
export function invoiceTotal(input: InvoiceInput) {
  const total = input.lines.reduce((n, l) => n + l.quantity * l.rateCents, 0);
  if (!safe(total))
    throw new Error("Invoice amount is outside safe integer cents.");
  return total;
}
export function reconcile(raw: InvoiceInput): Result {
  const input = inputSchema.parse(raw);
  const invoiceCents = invoiceTotal(input);
  const issues: string[] = [];
  const ids = input.sources.map((s) => s.id);
  if (new Set(ids).size !== ids.length)
    issues.push("Duplicate evidence identifiers.");
  if (
    !date(input.start) ||
    !date(input.end) ||
    !date(input.invoiceDate) ||
    input.start > input.end ||
    input.end > input.invoiceDate
  )
    issues.push("Invalid service period or invoice date.");
  const serviceSource = input.sources.find(
    (s) => s.id === input.service.sourceId,
  );
  if (
    !input.service.confirmed ||
    serviceSource?.kind !== "service" ||
    !serviceSource.signed
  )
    issues.push("A confirmed service record is required.");
  if (!input.sources.some((s) => s.kind === "invoice" && s.id === input.code))
    issues.push("The original invoice source is required.");
  if (
    serviceSource &&
    (!date(serviceSource.date) || serviceSource.date > input.invoiceDate)
  )
    issues.push("Service evidence is not valid as of the invoice.");
  if (
    input.service.vendorId !== input.vendorId ||
    input.service.contractId !== input.contractId
  )
    issues.push("Service record belongs to a different vendor or contract.");
  const eligible = input.terms.filter(
    (t) => t.start <= input.start && t.end >= input.end,
  );
  for (const t of input.terms) {
    if (
      !date(t.start) ||
      !date(t.end) ||
      t.start > t.end ||
      !safe(t.rateCents) ||
      !safe(t.quantity * t.rateCents)
    )
      issues.push(`Invalid term ${t.id}.`);
  }
  for (const t of eligible) {
    const source = input.sources.find((s) => s.id === t.sourceId);
    if (!source?.signed) issues.push(`Signed evidence is missing for ${t.id}.`);
    if (
      source &&
      source.kind !== (t.scope === "original" ? "contract" : "amendment")
    )
      issues.push(`Source type cannot authorize term ${t.id}.`);
    if (source && (!date(source.date) || source.date > input.invoiceDate))
      issues.push(`Source ${source.id} is not valid as of the invoice.`);
    if (t.vendorId !== input.vendorId || t.contractId !== input.contractId)
      issues.push(`Term ${t.id} references a different vendor or contract.`);
  }
  const bases = eligible.filter((t) => t.scope !== "supersede");
  if (!bases.some((t) => t.scope === "original"))
    issues.push("No original contract covers the full service period.");
  if (new Set(input.terms.map((t) => t.id)).size !== input.terms.length)
    issues.push("Duplicate contract term identifiers.");
  const overrides = eligible.filter((t) => t.scope === "supersede");
  for (const t of overrides) {
    if (
      !t.supersedes.length ||
      t.supersedes.some((id) => !bases.some((b) => b.id === id))
    )
      issues.push(`Supersession scope is unresolved for ${t.id}.`);
    if (
      t.quantity !==
      bases
        .filter((b) => t.supersedes.includes(b.id))
        .reduce((n, b) => n + b.quantity, 0)
    )
      issues.push(
        `Supersession quantity does not match the replaced room groups for ${t.id}.`,
      );
  }
  const cohorts = bases.map((t) => {
    const replacement = overrides.filter((r) => r.supersedes.includes(t.id));
    if (replacement.length > 1)
      issues.push(`Conflicting amendments for ${t.id}.`);
    const r = replacement[0] ?? t;
    return {
      termId: r.id,
      sourceId: r.sourceId,
      label: t.label,
      quantity: t.quantity,
      rateCents: r.rateCents,
      amountCents: t.quantity * r.rateCents,
    };
  });
  const qty = cohorts.reduce((n, c) => n + c.quantity, 0);
  if (qty !== input.service.quantity)
    issues.push(
      "Contract quantities do not match confirmed delivered room-nights.",
    );
  if (
    input.lines.reduce((n, l) => n + l.quantity, 0) !== input.service.quantity
  )
    issues.push("Invoice quantities do not match confirmed services.");
  const expected = cohorts.reduce((n, c) => n + c.amountCents, 0);
  if (!safe(expected))
    issues.push("Calculated amount exceeds safe integer cents.");
  if (issues.length)
    return {
      disposition: "needs_info",
      invoiceCents,
      expectedCents: null,
      differenceCents: null,
      cohorts: [],
      evidenceIds: ids,
      explanation:
        "Additional evidence or authorized review is required before a financial proposal can proceed.",
      issues: [...new Set(issues)],
    };
  const difference = invoiceCents - expected;
  return {
    disposition: difference === 0 ? "matched" : "disputed",
    invoiceCents,
    expectedCents: expected,
    differenceCents: difference,
    cohorts,
    evidenceIds: [
      ...new Set([
        ...cohorts.map((c) => c.sourceId),
        ...bases.map((t) => t.sourceId),
        input.service.sourceId,
        ...input.sources.filter((s) => s.kind === "invoice").map((s) => s.id),
      ]),
    ],
    explanation:
      difference === 0
        ? "The invoice agrees with the signed terms and confirmed services."
        : difference > 0
          ? "The invoice exceeds the supported contractual charge. Prepare a dispute; vendor resolution is required before posting."
          : "The invoice is below the supported contractual charge. Request clarification before posting.",
    issues: [],
  };
}
export function validateInterpretation(
  input: InvoiceInput,
  raw: unknown,
): Result {
  const output = interpretationSchema.parse(raw);
  if (output.invoiceId !== input.code)
    throw new Error("Agent referenced a different invoice.");
  if (output.evidenceIds.some((id) => !input.sources.some((s) => s.id === id)))
    throw new Error("Agent cited evidence that does not exist.");
  if (output.termIds.some((id) => !input.terms.some((t) => t.id === id)))
    throw new Error("Agent cited a contract term that does not exist.");
  const result = reconcile(input);
  if (output.disposition === "needs_info")
    return {
      ...result,
      disposition: "needs_info",
      expectedCents: null,
      differenceCents: null,
      cohorts: [],
      explanation: output.explanation,
      issues: output.missingEvidence.length
        ? output.missingEvidence
        : ["Agent requested human review."],
    };
  if (result.disposition === "needs_info") return result;
  if (result.disposition !== output.disposition)
    throw new Error(
      "Agent disposition conflicts with validated financial evidence.",
    );
  const required = [...new Set(result.cohorts.map((c) => c.termId))];
  if (
    required.some((id) => !output.termIds.includes(id)) ||
    output.termIds.some((id) => !required.includes(id))
  )
    throw new Error(
      "Agent rate selection does not match applicable signed terms.",
    );
  if (result.evidenceIds.some((id) => !output.evidenceIds.includes(id)))
    throw new Error("Agent omitted required supporting evidence.");
  return { ...result, explanation: output.explanation };
}
const transitions: Record<State, State[]> = {
  NEW: ["INVESTIGATING"],
  INVESTIGATING: ["PROPOSED", "NEEDS_INFO", "FAILED_RETRYABLE"],
  NEEDS_INFO: ["REVISION_REQUIRED"],
  PROPOSED: ["APPROVED", "REJECTED", "NEEDS_INFO", "REVISION_REQUIRED"],
  APPROVED: ["POSTED", "REVISION_REQUIRED", "NEEDS_INFO"],
  POSTED: [],
  REJECTED: ["REVISION_REQUIRED"],
  REVISION_REQUIRED: ["INVESTIGATING"],
  FAILED_RETRYABLE: ["INVESTIGATING", "REVISION_REQUIRED"],
};
export function canTransition(from: State, to: State) {
  return transitions[from].includes(to);
}
export function permission(
  role: Role,
  action: "approve" | "post" | "policy" | "correct",
  actor: string,
  proposer: string,
  requiresController: boolean,
) {
  return authorizeFinance({ id: actor, role }, action, {
    proposer,
    requiresController,
  });
}
export function validateJournal(lines: JournalLine[]) {
  if (
    lines.length < 2 ||
    lines.some(
      (l) =>
        !safe(l.debitCents) ||
        !safe(l.creditCents) ||
        l.debitCents > 0 === l.creditCents > 0,
    )
  )
    throw new Error("Each journal line needs one positive debit or credit.");
  const debits = lines.reduce((n, l) => n + l.debitCents, 0),
    credits = lines.reduce((n, l) => n + l.creditCents, 0);
  if (!safe(debits) || debits !== credits)
    throw new Error("Journal debits and credits must balance.");
  return debits;
}
export function payableJournal(amount: number, deposit = 0): JournalLine[] {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Posting requires a positive amount in cents.");
  if (!Number.isSafeInteger(deposit) || deposit < 0 || deposit > amount)
    throw new Error("Invalid prepaid deposit allocation.");
  const lines = [
    {
      account: "6100 · Team travel expense",
      debitCents: amount,
      creditCents: 0,
    },
    {
      account: "2100 · Accounts payable",
      debitCents: 0,
      creditCents: amount - deposit,
    },
  ].filter((line) => line.debitCents > 0 || line.creditCents > 0);
  if (deposit)
    lines.push({
      account: "1480 · Prepaid travel deposits",
      debitCents: 0,
      creditCents: deposit,
    });
  validateJournal(lines);
  return lines;
}
