"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import type { compareProcedures } from "@/lib/finance/learning";
import type { Notify } from "./attest-app";
import { Button } from "./ui/button";
import { Notice } from "./primitives";

export function LearningJobStatus({
  job,
  notify,
}: {
  job: Doc<"policyRuns">;
  notify: Notify;
}) {
  const retry = useMutation(api.policies.retry);
  const [busy, setBusy] = useState(false);
  return (
    <Notice>
      {job.status === "failed"
        ? `Learning failed: ${job.error}`
        : job.status === "completed"
          ? `Learning result: ${(job.outcome ?? "candidate").replaceAll("_", " ")}`
          : `Learning ${job.status}…`}
      {job.status === "failed" && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await retry({ jobId: job._id });
              notify(r.message, r.ok);
            } catch (e) {
              notify(
                e instanceof Error ? e.message : "Could not resume",
                false,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Retry / resume learning
        </Button>
      )}
    </Notice>
  );
}
export function PolicyLearningReview({
  policy,
  notify,
}: {
  policy: Doc<"policies">;
  notify: Notify;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const detail = useQuery(
    api.policies.detail,
    open ? { id: policy._id } : "skip",
  );
  const reject = useMutation(api.policies.reject),
    reevaluate = useMutation(api.policies.reevaluate);
  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      notify(r.message, r.ok);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Review failed", false);
    } finally {
      setBusy(false);
    }
  };
  const report = detail?.evaluation?.report as
    ReturnType<typeof compareProcedures> | undefined;
  return (
    <div>
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "Hide" : "View"} learning evidence
      </Button>
      {open && (
        <div className="policy-checks">
          {!detail ? (
            <p>Loading…</p>
          ) : (
            <>
              {detail.correction && (
                <p>
                  Accepted correction: {detail.correction.explanation} ·{" "}
                  {detail.correction.code}
                </p>
              )}
              <p>
                {report
                  ? `${report.sampleCount} deterministic scenarios · ${report.improved} improved · ${report.regressed} regressed. These are not live-provider accuracy results.`
                  : "No versioned comparison is stored for this policy."}
              </p>
              {report?.rows.map((row) => (
                <p key={row.name}>
                  {row.name}:{" "}
                  {row.baselineNeedsInfo ? "needs clarification" : "supported"}{" "}
                  →{" "}
                  {row.candidateNeedsInfo ? "needs clarification" : "supported"}{" "}
                  · {row.passed ? "safety passed" : "safety failed"}
                </p>
              ))}
              <p>
                {detail.usage.length} recorded uses shown (latest{" "}
                {detail.usageLimit}).
              </p>
              {policy.status === "candidate" && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => reevaluate({ id: policy._id }))
                    }
                  >
                    Reevaluate candidate
                  </Button>
                  <label className="form-label">
                    Rejection reason
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void run(() => reject({ id: policy._id, reason }))
                    }
                  >
                    Reject candidate
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
