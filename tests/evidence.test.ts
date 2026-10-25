import { describe, expect, it } from "vitest";
import { resolveAuditEvidence } from "../src/lib/evidence";
import { hotelFixture } from "../src/lib/simulation/fixtures";

describe("audit evidence references", () => {
  const source = hotelFixture().sources[0];
  const original = { ...source, text: "Original contract clause" };
  const current = { ...source, text: "Later corrected clause" };
  const detail = {
    case: { input: { sources: [current] } },
    proposals: [{ _id: "original-proposal", input: { sources: [original] } }],
  };
  it("opens the original proposal clause when an ID is reused", () => {
    expect(
      resolveAuditEvidence(detail, source.id, "original-proposal"),
    ).toEqual(original);
  });
  it("opens the case source for events before a proposal exists", () => {
    expect(resolveAuditEvidence(detail, source.id)).toEqual(current);
  });
  it("opens evidence appended after the proposal, such as a vendor resolution", () => {
    const resolution = { ...source, id: "RESOLUTION-001" };
    const later = {
      ...detail,
      case: { input: { sources: [current, resolution] } },
    };
    expect(
      resolveAuditEvidence(later, resolution.id, "original-proposal"),
    ).toEqual(resolution);
  });
  it("does not substitute current evidence for an unavailable historical snapshot", () => {
    expect(
      resolveAuditEvidence(detail, source.id, "missing-proposal"),
    ).toBeUndefined();
    expect(resolveAuditEvidence(detail, "missing-source")).toBeUndefined();
  });
});
