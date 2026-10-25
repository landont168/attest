"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Search = {
  id: string;
  query: string;
  status: string;
  outcome: string | null;
  error: string | null;
  attempt: number | null;
  corpusSize: number;
  queryMs: number | null;
  totalMs: number | null;
  rejectedCount: number;
  passedToAgent: boolean;
  matches: {
    code: string;
    kind: string;
    title: string;
    excerpt: string;
    score: number;
    synthetic: boolean;
    selected: boolean;
    cited: boolean | null;
  }[];
};
export function RetrievalEvidence(target: {
  caseId?: Id<"cases">;
  jobId?: Id<"policyRuns">;
}) {
  const searches = useQuery(api.retrievalRecords.list, target) as
    Search[] | undefined;
  if (!searches?.length) return null;
  return (
    <details className="panel-body">
      <summary>
        Evidence retrieval · {searches.length} recorded{" "}
        {searches.length === 1 ? "search" : "searches"}
      </summary>
      {searches.map((s) => (
        <article className="source-article" key={s.id}>
          <h3>
            {s.outcome === "moss" ? "Moss search" : "Structured Convex lookup"}
            {s.attempt ? ` · Attempt ${s.attempt}` : ""}
          </h3>
          <p>
            {s.status === "pending"
              ? "Search in progress…"
              : s.outcome === "disabled"
                ? "Moss is not configured. The workflow used structured evidence."
                : s.outcome === "empty"
                  ? "No eligible documents to search."
                  : (s.error ??
                    `${s.matches.length} validated matches from ${s.corpusSize} eligible documents.`)}
          </p>
          <p className="small muted">Query: {s.query}</p>
          {s.outcome === "moss" && (
            <p className="small muted">
              Query: {s.queryMs} ms · Setup, indexing and query: {s.totalMs} ms
              · {s.rejectedCount} rejected matches. Scores indicate search
              similarity, not financial confidence.
            </p>
          )}
          <p className="small muted">
            {s.passedToAgent
              ? "Included in agent context. Citation records below show reported use; they do not prove that retrieval changed the decision."
              : "No live agent consumed this search. Deterministic financial checks use the full source evidence."}
          </p>
          {s.matches.map((m) => (
            <div key={`${m.kind}:${m.code}`}>
              <strong>{m.title}</strong>
              <p>{m.excerpt}</p>
              <small>
                {m.code} · Similarity {m.score.toFixed(3)} ·{" "}
                {m.synthetic ? "Synthetic evidence" : "Historical evidence"} ·{" "}
                {!m.selected
                  ? "Excluded after revalidation"
                  : m.cited === true
                    ? "Cited in validated result"
                    : m.cited === false
                      ? "Not cited in result"
                      : m.kind === "source" || target.jobId
                        ? "Result pending or unavailable"
                        : "Use not reported by investigator"}
              </small>
            </div>
          ))}
        </article>
      ))}
    </details>
  );
}
