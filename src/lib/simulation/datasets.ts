import type { InvoiceInput } from "../finance/types";
import type { BankRecord, PaymentCredit } from "../finance/settlement";
import { canonicalFixture } from "./finance-team";

export type Dataset = "demo" | "history" | "evaluation";
export type DatasetCase = {
  label: string;
  input: InvoiceInput;
  bank: BankRecord[];
  credits: PaymentCredit[];
  history?: {
    decision: "approved" | "rejected" | "needs_info";
    reason: string;
    date: string;
  };
};
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
function invoiceText(input: InvoiceInput) {
  const total = input.lines.reduce(
    (sum, line) => sum + line.quantity * line.rateCents,
    0,
  );
  input.sources.find((s) => s.id === input.code)!.text =
    input.lines
      .map((l) => `${l.quantity} ${input.unit} × ${usd(l.rateCents)}`)
      .join(" + ") + ` = ${usd(total)} gross.`;
}
function record(
  input: InvoiceInput,
  label: string,
  deposit = 0,
  credited = true,
): DatasetCase {
  const bank: BankRecord[] = [];
  const credits: PaymentCredit[] = [];
  if (deposit) {
    const transactionId = `PAY-${input.code}`,
      bankSourceId = `BANK-${input.code}`,
      creditSourceId = `CREDIT-${input.code}`;
    const paidAt = input.start.startsWith("2027")
      ? "2026-10-20"
      : input.start.slice(0, 8) + "01";
    input.deposit = {
      transactionId,
      amountCents: deposit,
      bankSourceId,
      creditSourceId,
    };
    input.sources.push({
      id: bankSourceId,
      kind: "payment",
      title: "Settled bank deposit",
      date: paidAt,
      clause: "Bank settlement reference",
      signed: true,
      text: `${transactionId}: ${usd(deposit)} paid to ${input.vendor} for ${input.contractId}.`,
    });
    bank.push({
      transactionId,
      contractId: input.contractId,
      vendorId: input.vendorId,
      amountCents: deposit,
      paidAt,
      status: "settled",
      sourceId: bankSourceId,
    });
    if (credited) {
      input.sources.push({
        id: creditSourceId,
        kind: "credit",
        title: "AP deposit allocation",
        date: input.invoiceDate,
        clause: "Deposit applied once",
        signed: true,
        text: `${transactionId}: ${usd(deposit)} credited once to ${input.code}.`,
      });
      credits.push({
        invoiceCode: input.code,
        transactionId,
        contractId: input.contractId,
        vendorId: input.vendorId,
        amountCents: deposit,
        sourceId: creditSourceId,
      });
    } else
      input.sources.push({
        id: `UNAPPLIED-${input.code}`,
        kind: "communication",
        title: "Unapplied bank receipt",
        date: input.invoiceDate,
        clause: "AP allocation exception",
        signed: true,
        text: `${transactionId} is settled but has no invoice allocation. Do not subtract it from AP without reconciliation.`,
      });
    const invoice = input.sources.find((s) => s.id === input.code)!;
    invoice.text += credited
      ? ` Deposit credit ${usd(deposit)}; invoice outstanding ${usd(input.lines.reduce((n, l) => n + l.quantity * l.rateCents, 0) - deposit)}.`
      : " Deposit remains unapplied in AP.";
  }
  return { input, label, bank, credits };
}
function simple(
  code: string,
  vendor: string,
  vendorId: string,
  unit: InvoiceInput["unit"],
  quantity: number,
  rateCents: number,
  month = "2027-02",
): InvoiceInput {
  const contractId = `CTR-${vendorId}-2026`,
    start = `${month}-10`,
    end = `${month}-12`,
    invoiceDate = `${month}-15`,
    sourceId = `SERVICE-${code}`;
  return {
    code,
    vendor,
    vendorId,
    contractId,
    destination: "Team travel",
    currency: "USD",
    unit,
    start,
    end,
    invoiceDate,
    lines: [{ label: "Confirmed services", quantity, rateCents }],
    terms: [
      {
        id: `BASE-${code}`,
        sourceId: contractId,
        contractId,
        vendorId,
        label: "Original agreed services",
        quantity,
        rateCents,
        start,
        end,
        scope: "original",
        supersedes: [],
      },
    ],
    service: { sourceId, vendorId, contractId, quantity, confirmed: true },
    sources: [
      {
        id: contractId,
        kind: "contract",
        title: `${vendor} master agreement`,
        date: "2026-01-05",
        clause: "§ 3 · Monthly service orders",
        signed: true,
        text: `Signed master agreement: confirmed monthly ${unit} orders at ${usd(rateCents)} each. Signed amendments must specify the affected service period and scope.`,
      },
      {
        id: sourceId,
        kind: "service",
        title: "Operational delivery record",
        date: end,
        clause: "Confirmed service order",
        signed: true,
        text: `Operations confirms ${quantity} ${unit} delivered under ${contractId}, ${start} to ${end}.`,
      },
      {
        id: code,
        kind: "invoice",
        title: "Vendor invoice",
        date: invoiceDate,
        clause: "Service line items",
        signed: false,
        text: `${quantity} × ${usd(rateCents)} = ${usd(quantity * rateCents)} gross.`,
      },
    ],
  };
}
function replaceRate(
  input: InvoiceInput,
  rate: number,
  text: string,
  signed = true,
  date = `${input.start.slice(0, 7)}-05`,
) {
  const id = `AMD-${input.code}`;
  input.terms.push({
    ...input.terms[0],
    id: `RATE-${input.code}`,
    sourceId: id,
    scope: "supersede",
    rateCents: rate,
    supersedes: [input.terms[0].id],
  });
  input.sources.push({
    id,
    kind: "amendment",
    title: "Scoped rate amendment",
    date,
    clause: "§ 4 · Explicit replacement",
    signed,
    text: `${text} Effective ${input.start}–${input.end}; replaces only ${input.terms[0].id} with ${input.service.quantity} ${input.unit} at ${usd(rate)} each.`,
  });
}
export function demoCases(): DatasetCase[] {
  const hero = canonicalFixture();
  // Give the original contract its actual stable reference instead of a legacy fixture alias.
  const old = hero.terms[0].sourceId;
  hero.terms[0].sourceId = hero.contractId;
  hero.sources.find((s) => s.id === old)!.id = hero.contractId;
  hero.sources = hero.sources.filter(
    (s) => !["payment", "credit"].includes(s.kind),
  );
  delete hero.deposit;
  invoiceText(hero);
  const valid = simple(
    "DEMO-VALID-002",
    "Harbor Court Hotel",
    "VEN-HARBOR",
    "room-night",
    18,
    28000,
  );
  replaceRate(
    valid,
    31500,
    "Signed event-night surcharge of $35 per room-night is authorized only when the team uses the late check-in block. Operations confirms that condition occurred.",
  );
  valid.sources.find((s) => s.kind === "service")!.text +=
    " The signed late check-in condition was met for all 18 room-nights.";
  valid.lines[0].rateCents = 31500;
  invoiceText(valid);
  const missing = simple(
    "DEMO-MISSING-003",
    "Harbor Court Hotel",
    "VEN-HARBOR",
    "room-night",
    24,
    28000,
  );
  missing.service.confirmed = false;
  missing.sources = missing.sources.filter((s) => s.kind !== "service");
  return [
    record(hero, "Canonical hotel overcharge", 300000),
    record(valid, "Authorized late check-in surcharge", 50000),
    record(missing, "Missing delivery confirmation", 60000),
  ];
}
export function evaluationCases(): DatasetCase[] {
  const correct = simple(
    "EVAL-001",
    "Atlas Hotel",
    "EVAL-ATLAS",
    "room-night",
    13,
    21700,
  );
  replaceRate(
    correct,
    23900,
    "Signed conference block premium authorized for these 13 delivered room-nights.",
  );
  correct.lines[0].rateCents = 23900;
  invoiceText(correct);
  const retro = simple(
    "EVAL-002",
    "Cedar Hotel",
    "EVAL-CEDAR",
    "room-night",
    17,
    30100,
  );
  replaceRate(
    retro,
    28700,
    "Signed after delivery, before invoice issuance; explicitly retroactive to the specified service period only.",
    true,
    "2027-02-14",
  );
  retro.lines[0].rateCents = 28700;
  invoiceText(retro);
  const deposit = simple(
    "EVAL-003",
    "Orchard Hotel",
    "EVAL-ORCHARD",
    "room-night",
    9,
    26300,
  );
  const unsigned = simple(
    "EVAL-004",
    "Northline Hotel",
    "EVAL-NORTHLINE",
    "room-night",
    11,
    22700,
  );
  replaceRate(
    unsigned,
    19900,
    "Unsigned proposed concession; no executed authority.",
    false,
  );
  unsigned.lines[0].rateCents = 19900;
  invoiceText(unsigned);
  const authority = simple(
    "EVAL-005",
    "Keystone Hotel",
    "EVAL-KEYSTONE",
    "room-night",
    8,
    31200,
  );
  const unfamiliar = simple(
    "EVAL-006",
    "Juniper Hotel",
    "EVAL-JUNIPER",
    "room-night",
    37,
    19375,
  );
  unfamiliar.lines[0].rateCents = 20725;
  invoiceText(unfamiliar);
  return [
    record(correct, "Correct amended invoice"),
    record(retro, "Retroactive signed scope"),
    record(deposit, "Settled but uncredited deposit", 42000, false),
    record(unsigned, "Unsigned conflicting amendment"),
    record(authority, "Unauthorized agent approval"),
    record(unfamiliar, "Unfamiliar quantity and rate"),
  ];
}
export function historyCases(): DatasetCase[] {
  const meridian = simple(
    "HIST-MER-001",
    "Meridian Hospitality",
    "VEN-MERIDIAN",
    "room-night",
    10,
    30000,
    "2026-05",
  );
  const disputed = simple(
    "HIST-MER-002",
    "Meridian Hospitality",
    "VEN-MERIDIAN",
    "room-night",
    10,
    30000,
    "2026-06",
  );
  replaceRate(
    disputed,
    27500,
    "Renewal concession for the June order; original May charges remain unchanged.",
  );
  const harbor = simple(
    "HIST-HAR-001",
    "Harbor Court Hotel",
    "VEN-HARBOR",
    "room-night",
    20,
    20000,
    "2026-05",
  );
  const cancel = simple(
    "HIST-HAR-002",
    "Harbor Court Hotel",
    "VEN-HARBOR",
    "room-night",
    20,
    20000,
    "2026-06",
  );
  replaceRate(
    cancel,
    17500,
    "A $500 cancellation credit from unused reservation HC-MAY-EXTRA associated with HIST-HAR-001 is allocated as $25 off each of these 20 delivered room-nights; no additional credit may be applied.",
  );
  cancel.lines[0].rateCents = 17500;
  invoiceText(cancel);
  cancel.sources.push({
    id: "CANCEL-HAR-2026-06",
    kind: "credit",
    title: "Cancellation credit memo",
    date: "2026-06-04",
    clause: "Cancelled reservation HC-MAY-EXTRA · related invoice HIST-HAR-001",
    signed: true,
    text: "$500 cancellation credit authorized and incorporated once into the signed June net rate; not a bank deposit.",
  });
  const charter = simple(
    "HIST-AIR-001",
    "Coastal Charter Air",
    "VEN-COASTAL",
    "flight-leg",
    2,
    1200000,
    "2026-07",
  );
  const surcharge = simple(
    "HIST-AIR-002",
    "Coastal Charter Air",
    "VEN-COASTAL",
    "flight-leg",
    2,
    1200000,
    "2026-08",
  );
  replaceRate(
    surcharge,
    1320000,
    "A 10% night-operation surcharge is authorized only for airport departures after 23:00; both flight logs confirm that condition.",
  );
  surcharge.sources.find((s) => s.kind === "service")!.text +=
    " Both departure logs show 23:30 local time.";
  surcharge.lines[0].rateCents = 1320000;
  invoiceText(surcharge);
  const ground = simple(
    "HIST-GRD-001",
    "Bayline Ground Transport",
    "VEN-BAYLINE",
    "trip",
    12,
    18500,
    "2026-08",
  );
  ground.lines[0].rateCents = 21000;
  invoiceText(ground);
  const unapplied = simple(
    "HIST-GRD-002",
    "Bayline Ground Transport",
    "VEN-BAYLINE",
    "trip",
    10,
    18500,
    "2026-09",
  );
  const records = [
    record(meridian, "May hotel invoice approved"),
    record(disputed, "June rate dispute authorized"),
    record(harbor, "May hotel deposit allocated", 100000),
    record(cancel, "June cancellation credit incorporated"),
    record(charter, "July charter invoice approved"),
    record(surcharge, "August night-flight surcharge verified"),
    record(ground, "August ground proposal rejected"),
    record(unapplied, "September unapplied prepayment", 50000, false),
  ];
  return records.map((r, i) => ({
    ...r,
    history: {
      decision: i === 6 ? "rejected" : i === 7 ? "needs_info" : "approved",
      date: r.input.invoiceDate.slice(0, 8) + "16",
      reason:
        i === 6
          ? "Synthetic historical Controller decision: request a vendor correction before authorizing the proposed ground-transport dispute."
          : i === 7
            ? "Synthetic historical Controller decision: hold until the settled prepayment has an AP allocation."
            : "Synthetic historical Controller decision: reviewed the cited executed agreement, service record and any applicable amendment or deposit evidence.",
    },
  }));
}
export const datasetCases = (dataset: Dataset) =>
  dataset === "demo"
    ? demoCases()
    : dataset === "history"
      ? historyCases()
      : evaluationCases();
