import { describe, it, expect } from "vitest";
import {
  reconcile,
  validateInterpretation,
  payableJournal,
  validateJournal,
  permission,
  canTransition,
} from "../src/lib/finance/engine";
import { hotelFixture, scenarios } from "../src/lib/simulation/fixtures";
import { backtestProcedure, needsScopeReview } from "../src/lib/finance/memory";
describe("Contract interpretation and financial correctness", () => {
  it("finds the $750 overcharge while preserving original room rates", () => {
    const r = reconcile(hotelFixture());
    expect(r.expectedCents).toBe(1250000);
    expect(r.invoiceCents).toBe(1325000);
    expect(r.differenceCents).toBe(75000);
    expect(r.cohorts.map((c) => c.amountCents)).toEqual([720000, 530000]);
  });
  it("accepts a signed amendment that explicitly supersedes all rates", () =>
    expect(reconcile(scenarios()[1]).disposition).toBe("matched"));
  it("escalates a verbal exception without signed amendment authority", () =>
    expect(reconcile(scenarios()[2]).disposition).toBe("needs_info"));
  it("accepts a correct multi-line invoice", () =>
    expect(reconcile(scenarios()[3]).differenceCents).toBe(0));
  it("recalculates changed quantities and rates without invoice-specific branches", () => {
    const i = hotelFixture("UNFAMILIAR");
    i.terms[1].quantity = 7;
    i.terms[1].rateCents = 28123;
    i.service.quantity = 37;
    i.lines[0].quantity = 37;
    expect(reconcile(i).expectedCents).toBe(916861);
  });
  it("supports an original-only agreement", () => {
    const i = hotelFixture();
    i.terms = i.terms.slice(0, 1);
    i.service.quantity = 30;
    i.lines = [{ label: "Original", quantity: 30, rateCents: 24000 }];
    expect(reconcile(i).expectedCents).toBe(720000);
  });
  it("does not apply an amendment effective after the services", () => {
    const i = hotelFixture();
    i.terms[1].start = "2027-03-01";
    expect(reconcile(i).disposition).toBe("needs_info");
  });
  it("rejects conflicting superseding amendments", () => {
    const i = scenarios()[1];
    i.terms.push({ ...i.terms[2], id: "SECOND-REPLACEMENT", rateCents: 28000 });
    expect(reconcile(i).issues.join()).toContain("Conflicting");
  });
  it("withholds amounts when confirmed services are missing", () => {
    const i = hotelFixture();
    i.sources = i.sources.filter((s) => s.kind !== "service");
    expect(reconcile(i).expectedCents).toBeNull();
  });
  it("detects a wrong vendor on the service confirmation", () => {
    const i = hotelFixture();
    i.service.vendorId = "WRONG";
    expect(reconcile(i).disposition).toBe("needs_info");
  });
  it("detects a wrong contract reference on a term", () => {
    const i = hotelFixture();
    i.terms[0].contractId = "WRONG";
    expect(reconcile(i).disposition).toBe("needs_info");
  });
  it("rejects negative or fractional room quantities", () => {
    const i = hotelFixture();
    i.lines[0].quantity = -1;
    expect(() => reconcile(i)).toThrow();
    i.lines[0].quantity = 1.5;
    expect(() => reconcile(i)).toThrow();
  });
  it("rejects unsafe monetary arithmetic", () => {
    const i = hotelFixture();
    i.lines[0].rateCents = Number.MAX_SAFE_INTEGER;
    expect(() => reconcile(i)).toThrow();
  });
  it("rejects non-calendar dates", () => {
    const i = hotelFixture();
    i.start = "2027-02-30";
    expect(reconcile(i).disposition).toBe("needs_info");
  });
  it("retains an undercharge as unresolved, not a free reduction", () => {
    const i = hotelFixture();
    i.lines[0].rateCents = 20000;
    const r = reconcile(i);
    expect(r.disposition).toBe("disputed");
    expect(r.differenceCents).toBe(-250000);
  });
});
describe("Agent output boundary", () => {
  const valid = () => {
    const i = hotelFixture(),
      r = reconcile(i);
    return {
      invoiceId: i.code,
      disposition: "disputed",
      termIds: r.cohorts.map((c) => c.termId),
      evidenceIds: r.evidenceIds,
      explanation: "The signed amendment preserves the original rate.",
      missingEvidence: [],
    };
  };
  it("accepts cited, source-backed interpretation and computes money independently", () =>
    expect(validateInterpretation(hotelFixture(), valid()).expectedCents).toBe(
      1250000,
    ));
  it("rejects hallucinated evidence IDs", () =>
    expect(() =>
      validateInterpretation(hotelFixture(), {
        ...valid(),
        evidenceIds: ["INVENTED"],
      }),
    ).toThrow("does not exist"));
  it("rejects wrong invoice identity", () =>
    expect(() =>
      validateInterpretation(hotelFixture(), {
        ...valid(),
        invoiceId: "OTHER",
      }),
    ).toThrow("different invoice"));
  it("rejects incomplete term selection", () =>
    expect(() =>
      validateInterpretation(hotelFixture(), {
        ...valid(),
        termIds: ["TERM-ADDITIONAL"],
      }),
    ).toThrow("rate selection"));
  it("rejects malformed output", () =>
    expect(() =>
      validateInterpretation(hotelFixture(), { text: "looks right" }),
    ).toThrow());
  it("honors explicit agent abstention even with mathematically supported records", () =>
    expect(
      validateInterpretation(hotelFixture(), {
        ...valid(),
        disposition: "needs_info",
        missingEvidence: ["Clarify authority."],
      }).expectedCents,
    ).toBeNull());
});
describe("Authorization and ledger invariants", () => {
  it("denies agent self-approval", () =>
    expect(permission("ai_agent", "approve", "agent", "agent", true).ok).toBe(
      false,
    ));
  it("denies agent direct posting", () =>
    expect(permission("ai_agent", "post", "agent", "other", false).ok).toBe(
      false,
    ));
  it("requires a controller for resolved discrepancy approval", () =>
    expect(
      permission("human_accountant", "approve", "human", "agent", true).ok,
    ).toBe(false));
  it("does not bypass self-approval by changing a role", () =>
    expect(
      permission(
        "human_controller",
        "approve",
        "same-human",
        "same-human",
        true,
      ).ok,
    ).toBe(false));
  it("creates a balanced journal in integer cents", () =>
    expect(validateJournal(payableJournal(1250000))).toBe(1250000));
  it("rejects unbalanced journal entries", () =>
    expect(() =>
      validateJournal([
        { account: "expense", debitCents: 10, creditCents: 0 },
        { account: "payable", debitCents: 0, creditCents: 9 },
      ]),
    ).toThrow("balance"));
  it("rejects negative financial posting", () =>
    expect(() => payableJournal(-1)).toThrow());
  it("does not allow a new or posted case to jump to approval", () => {
    expect(canTransition("NEW", "APPROVED")).toBe(false);
    expect(canTransition("POSTED", "APPROVED")).toBe(false);
  });
});
describe("Scoped policy learning", () => {
  it("reduces redundant review only for supported Meridian schedules", () => {
    const i = hotelFixture();
    i.sources[1].title = "Block extension · signed schedule";
    expect(
      needsScopeReview(i, "controller_confirmation", "Meridian Hospitality"),
    ).toBe(true);
    expect(
      needsScopeReview(i, "signed_schedule_first", "Meridian Hospitality"),
    ).toBe(false);
  });
  it("passes all safety counterexamples for both procedures", () => {
    for (const p of [
      "controller_confirmation",
      "signed_schedule_first",
    ] as const)
      expect(
        backtestProcedure(p, "Meridian Hospitality").every((c) => c.passed),
      ).toBe(true);
  });
});

describe("Source authority and replacement scope", () => {
  it("does not accept a signed communication as an amendment", () => {
    const input = hotelFixture();
    input.sources[1].kind = "communication";
    expect(reconcile(input).expectedCents).toBeNull();
  });
  it("requires the original invoice evidence", () => {
    const input = hotelFixture();
    input.sources = input.sources.filter((s) => s.kind !== "invoice");
    expect(reconcile(input).expectedCents).toBeNull();
  });
  it("does not accept an unsigned service record", () => {
    const input = hotelFixture();
    input.sources.find((s) => s.kind === "service")!.signed = false;
    expect(reconcile(input).expectedCents).toBeNull();
  });
  it("withholds an inconsistent superseding quantity instead of silently extending its rate", () => {
    const input = scenarios()[1];
    input.terms.find((t) => t.scope === "supersede")!.quantity = 1;
    expect(reconcile(input).expectedCents).toBeNull();
  });
});
