import type { Doc } from "../../convex/_generated/dataModel";
import type { Result } from "./finance/types";
export type CaseRow = Doc<"cases"> & { result: Result | null };
export type Snapshot = {
  profile: Doc<"profiles">;
  sandbox: Doc<"sandboxes">;
  cases: CaseRow[];
  audit: Doc<"audit">[];
  policies: Doc<"policies">[];
  policyRuns: Doc<"policyRuns">[];
  precedents: Doc<"precedents">[];
  journals: Doc<"journals">[];
  corrections?: Doc<"corrections">[];
};
export type Detail = {
  subtasks?: Doc<"subtasks">[];
  disputes?: Doc<"disputes">[];
  case: Doc<"cases">;
  proposals: Doc<"proposals">[];
  audit: Doc<"audit">[];
  approvals: Doc<"approvals">[];
  questions: Doc<"questions">[];
  journals: Doc<"journals">[];
  corrections?: Doc<"corrections">[];
  runs: Doc<"runs">[];
};
