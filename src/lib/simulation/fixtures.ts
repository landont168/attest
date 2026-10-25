import type { InvoiceInput } from "../finance/types";
export function hotelFixture(
  code = "INV-HOTEL-001",
  vendor = "Meridian Hospitality",
): InvoiceInput {
  const vendorId =
    vendor === "Meridian Hospitality"
      ? "VEN-MERIDIAN"
      : vendor.toUpperCase().replaceAll(" ", "-");
  const contractId = code === "INV-HOTEL-001" ? "CTR-HOTEL-001" : `CTR-${code}`;
  return {
    code,
    vendor,
    vendorId,
    contractId,
    destination: "Los Angeles, CA",
    start: "2027-02-12",
    end: "2027-02-14",
    invoiceDate: "2027-02-15",
    currency: "USD",
    unit: "room-night",
    lines: [{ label: "Team room block", quantity: 50, rateCents: 26500 }],
    terms: [
      {
        id: "TERM-ORIGINAL",
        sourceId: "CTR-HOTEL-001",
        contractId,
        vendorId,
        label: "Original room block",
        quantity: 30,
        rateCents: 24000,
        start: "2027-02-12",
        end: "2027-02-14",
        scope: "original",
        supersedes: [],
      },
      {
        id: "TERM-ADDITIONAL",
        sourceId: "AMD-HOTEL-001",
        contractId,
        vendorId,
        label: "Additional rooms",
        quantity: 20,
        rateCents: 26500,
        start: "2027-02-12",
        end: "2027-02-14",
        scope: "additional",
        supersedes: [],
      },
    ],
    service: {
      sourceId: "SRV-HOTEL-001",
      vendorId,
      contractId,
      quantity: 50,
      confirmed: true,
    },
    sources: [
      {
        id: "CTR-HOTEL-001",
        kind: "contract",
        title: "Seasonal hotel agreement",
        date: "2026-10-15",
        clause: "§ 3.1 · Original commitment",
        signed: true,
        text: "Meridian Hospitality agrees to provide 30 billable room-nights for February 12–14, 2027 at $240.00 per room-night. Original room-nights retain this negotiated rate unless explicitly replaced by a signed amendment.",
      },
      {
        id: "AMD-HOTEL-001",
        kind: "amendment",
        title: "Additional room allocation",
        date: "2027-01-20",
        clause: "§ 2 · Scope of amendment",
        signed: true,
        text: "Add 20 room-nights at $265.00 per room-night. The original 30 room-nights retain their $240.00 rate. The additional rate does not retroactively apply to the original room block.",
      },
      {
        id: "SRV-HOTEL-001",
        kind: "service",
        title: "Confirmed room-night statement",
        date: "2027-02-14",
        clause: "Service confirmation · Operations",
        signed: true,
        text: "Team travel operations confirms all 50 room-nights were delivered for February 12–14, 2027. No taxes, food, parking, or incidentals are included.",
      },
      {
        id: code,
        kind: "invoice",
        title: "Vendor invoice",
        date: "2027-02-15",
        clause: "Line 1 · Accommodation",
        signed: false,
        text: "50 room-nights × $265.00 = $13,250.00 USD. Payment requested for confirmed accommodation.",
      },
    ],
  };
}
export function scenarios() {
  const main = hotelFixture();
  const valid = hotelFixture("INV-HARBOR-002", "Harbor Court Hotel");
  valid.destination = "San Francisco, CA";
  valid.terms.push({
    id: "TERM-REPLACEMENT",
    sourceId: "AMD-SUPERSEDE",
    contractId: valid.contractId,
    vendorId: valid.vendorId,
    label: "Replacement rate",
    quantity: 50,
    rateCents: 26500,
    start: valid.start,
    end: valid.end,
    scope: "supersede",
    supersedes: ["TERM-ORIGINAL", "TERM-ADDITIONAL"],
  });
  valid.sources.push({
    id: "AMD-SUPERSEDE",
    kind: "amendment",
    title: "Signed replacement rate",
    date: "2027-02-01",
    clause: "§ 4 · Full supersession",
    signed: true,
    text: "For February 12–14, 2027, this signed amendment explicitly supersedes the original and additional room rates. All 50 room-nights are charged at $265.00.",
  });
  const missing = hotelFixture("INV-SUMMIT-003", "Summit Lodge");
  missing.destination = "Denver, CO";
  missing.sources = missing.sources.filter((s) => s.kind !== "amendment");
  missing.sources.push({
    id: "NOTE-VERBAL",
    kind: "communication",
    title: "Unsigned rate exception",
    date: "2027-01-20",
    clause: "Travel coordinator note",
    signed: false,
    text: "A coordinator recalls verbally accepting the new rate. No signed amendment or authorized exception is attached.",
  });
  const matched = hotelFixture("INV-PACIFIC-004", "Pacific Suites");
  matched.destination = "Portland, OR";
  matched.lines = [
    { label: "Original rooms", quantity: 30, rateCents: 24000 },
    { label: "Additional rooms", quantity: 20, rateCents: 26500 },
  ];
  matched.sources[3].text =
    "30 room-nights × $240.00 plus 20 × $265.00 = $12,500.00 USD.";
  for (const input of [valid, missing, matched])
    input.sources[0].text = input.sources[0].text.replace(
      "Meridian Hospitality",
      input.vendor,
    );
  return [main, valid, missing, matched];
}
export const historicalPrecedents = [
  {
    code: "HIST-MER-101",
    vendor: "Meridian Hospitality",
    date: "2026-11-18",
    title: "Added rooms retained separate rates",
    explanation:
      "Controller reconciled 24 original room-nights and 8 additional room-nights against the signed itemized schedule. The new rate applied only to added rooms.",
    active: true,
  },
  {
    code: "HIST-MER-102",
    vendor: "Meridian Hospitality",
    date: "2026-12-10",
    title: "Signed schedule resolved block extension",
    explanation:
      "An undifferentiated reservation export caused uncertainty. The signed room schedule identified original and additional groups; a controller confirmed their separate rates.",
    active: true,
  },
  {
    code: "HIST-MER-099",
    vendor: "Meridian Hospitality",
    date: "2026-09-04",
    title: "Expired blanket exception",
    explanation:
      "A single-trip exception allowed a uniform rate through September 2026 only. It is expired and must not govern later services.",
    active: false,
  },
];
