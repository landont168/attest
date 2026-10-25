import { describe, expect, it } from "vitest";
import { parseUsdCents } from "../src/lib/money-input";

describe("USD input", () => {
  it("preserves decimal cents that cannot be represented exactly as dollars", () => {
    expect(parseUsdCents("0.29")).toBe(29);
    expect(parseUsdCents("1.13")).toBe(113);
    expect(parseUsdCents("19.99")).toBe(1999);
  });

  it("accepts whole dollars, shorthand fractions, and the approval-limit maximum", () => {
    expect(parseUsdCents("0")).toBe(0);
    expect(parseUsdCents(" 12000 ")).toBe(1_200_000);
    expect(parseUsdCents(".5")).toBe(50);
    expect(parseUsdCents("1.")).toBe(100);
    expect(parseUsdCents("1000000.00")).toBe(100_000_000);
  });

  it.each(["", " ", "-1", "1.001", "NaN", "Infinity", "1e3", "1,000", "."])(
    "rejects invalid or fractional-cent input %j",
    (value) => expect(parseUsdCents(value)).toBeNull(),
  );

  it("rejects amounts outside safe integer-cent precision", () => {
    expect(parseUsdCents("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseUsdCents("90071992547409.92")).toBeNull();
    expect(parseUsdCents("99999999999999999999999")).toBeNull();
  });
});
