import { reconcile } from "./engine";
import { hotelFixture } from "../simulation/fixtures";
import type { InvoiceInput } from "./types";
export type Procedure = "controller_confirmation" | "signed_schedule_first";
export function needsScopeReview(
  input: InvoiceInput,
  procedure: Procedure,
  vendor: string,
) {
  if (input.vendor !== vendor) return false;
  const schedules = input.sources.filter(
    (s) =>
      s.kind === "amendment" &&
      s.title.toLowerCase().includes("block extension"),
  );
  if (!schedules.length) return false;
  if (
    input.sources.some(
      (s) =>
        s.kind === "communication" &&
        s.signed &&
        s.clause === "Controller scope confirmation",
    )
  )
    return false;
  if (procedure === "controller_confirmation") return true;
  return (
    schedules.some(
      (s) =>
        !s.signed ||
        !input.terms.some(
          (t) => t.sourceId === s.id && t.scope === "additional",
        ),
    ) || reconcile(input).disposition === "needs_info"
  );
}
export function backtestProcedure(procedure: Procedure, vendor: string) {
  const supported = hotelFixture();
  supported.sources[1].title = "Block extension · signed room schedule";
  const missing = structuredClone(supported);
  missing.sources[1].signed = false;
  const unrelated = structuredClone(supported);
  unrelated.vendor = "Pacific Suites";
  const after = needsScopeReview(supported, procedure, vendor);
  return [
    {
      name: "Signed rates remain financially correct",
      passed: reconcile(supported).expectedCents === 1250000,
    },
    {
      name: "Unsigned amendment still requires review",
      passed:
        needsScopeReview(missing, procedure, vendor) &&
        reconcile(missing).disposition === "needs_info",
    },
    {
      name: "Procedure does not generalize to another vendor",
      passed: !needsScopeReview(unrelated, procedure, vendor),
    },
    {
      name: "Supported schedule handling matches procedure",
      passed: procedure === "controller_confirmation" ? after : !after,
    },
  ];
}
