import { hotelFixture } from "./fixtures";
import type { InvoiceInput } from "../finance/types";

export function canonicalFixture(
  code = "INV-TEAM-001",
  vendor = "Meridian Hospitality",
): InvoiceInput {
  const input = hotelFixture(code, vendor);
  input.lines = [
    { label: "February accommodation", quantity: 70, rateCents: 30000 },
  ];
  input.terms[0] = { ...input.terms[0], quantity: 50, rateCents: 30000 };
  input.terms[1] = { ...input.terms[1], quantity: 20, rateCents: 25000 };
  input.service.quantity = 70;
  input.sources[0].text = `${vendor}: 50 February room-nights at $300 each; total original commitment $15,000. A $3,000 October deposit is due. Original rates remain unless explicitly superseded.`;
  input.sources[1].text =
    "Add 20 room-nights at $250 each. The original 50 remain at $300. Additional scope only; no blanket replacement.";
  input.sources[2].text =
    "Travel Operations confirms all 70 February room-nights delivered, excluding incidentals.";
  input.sources[3].text =
    "70 room-nights at $300 = $21,000 gross. October deposit credit $3,000. Invoice outstanding $18,000.";
  input.deposit = {
    transactionId: `BANK-${code}`,
    amountCents: 300000,
    bankSourceId: `BANK-SOURCE-${code}`,
    creditSourceId: `AP-CREDIT-${code}`,
  };
  input.sources.push(
    {
      id: input.deposit.bankSourceId,
      kind: "payment",
      title: "October bank settlement",
      date: "2026-10-20",
      clause: "Settled deposit transfer",
      signed: true,
      text: `Settled payment BANK-${code}: $3,000 to ${vendor} for ${input.contractId}.`,
    },
    {
      id: input.deposit.creditSourceId,
      kind: "credit",
      title: "Invoice deposit allocation",
      date: input.invoiceDate,
      clause: "Deposit credit",
      signed: true,
      text: `One $3,000 deposit credit allocated to ${code}.`,
    },
  );
  return input;
}
export function financeTeamScenarios() {
  const hero = canonicalFixture();
  const missing = canonicalFixture("INV-TEAM-002", "Harbor Court Hotel");
  missing.destination = "New York City, NY";
  missing.service.confirmed = false;
  missing.sources = missing.sources.filter((s) => s.kind !== "service");
  const duplicate = canonicalFixture("INV-TEAM-003", "Pacific Suites");
  duplicate.destination = "Portland, OR";
  return [hero, missing, duplicate];
}
