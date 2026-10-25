"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { ArrowRight, FileText, ShieldCheck, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  EMPLOYEES,
  ROLE_TITLES,
  authorizeFinance,
  type HumanRole,
} from "@/lib/finance/organization";
import { money, clock } from "@/lib/utils";
import { parseUsdCents } from "@/lib/money-input";
import type { Snapshot, Detail } from "@/lib/view-types";
import type { Notify } from "./attest-app";
import { Button } from "./ui/button";
import { SectionTitle, Status, Empty } from "./primitives";

type Directory = {
  employees: Doc<"employees">[];
  cases: Doc<"cases">[];
  tasks: Doc<"subtasks">[];
  questions: Doc<"questions">[];
  disputes: Doc<"disputes">[];
  activeActorId: string;
  approvalLimitCents: number;
};
const taskTitle = {
  contract: "Contract interpretation",
  payment: "Deposit reconciliation",
  dispute: "Dispute preparation",
};
export function FinanceTeam({
  snapshot,
  notify,
}: {
  snapshot: Snapshot;
  notify: Notify;
}) {
  const data = useQuery(api.team.directory) as Directory | undefined;
  const setRole = useMutation(api.workspace.setRole);
  const configure = useMutation(api.team.configureLimit);
  const [selected, setSelected] = useState("ap");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fn();
      notify(result.message, result.ok);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "The action could not be completed.",
        false,
      );
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <Empty title="Loading finance team…" />;
  const person = data.employees.find((e) => e.code === selected);
  const definition = EMPLOYEES.find((e) => e.code === selected);
  const current = data.employees.find((e) => e.actorId === data.activeActorId);
  const assigned = person
    ? data.cases.filter(
        (c) =>
          c.ownerActorId === person.actorId ||
          data.tasks.some(
            (t) => t.caseId === c._id && t.assignedActorId === person.actorId,
          ) ||
          data.questions.some(
            (q) => q.caseId === c._id && q.assignedActorId === person.actorId,
          ),
      )
    : [];
  const recent = person
    ? snapshot.audit.filter((a) => a.actor === person.actorId).slice(0, 5)
    : [];
  const requests = data.questions.filter(
    (q) =>
      !q.answer &&
      (q.assignedActorId === data.activeActorId ||
        snapshot.profile.role === "human_controller"),
  );
  const approvals = snapshot.cases.filter(
    (c) =>
      c.state === "PROPOSED" &&
      authorizeFinance(
        { id: data.activeActorId, role: snapshot.profile.role },
        "approve",
        {
          proposer: "attest-investigator",
          requiresController: !!c.resolution,
          amountCents:
            c.result?.disposition === "disputed" && !c.resolution
              ? Math.abs(c.result.differenceCents ?? 0)
              : (c.result?.expectedCents ?? 0),
          limitCents: data.approvalLimitCents,
        },
      ).ok,
  );
  return (
    <>
      <SectionTitle
        title="Finance team"
        description="Fictional staff, real persisted work. Acting roles are simulated within your private workspace."
      />
      <section
        className="finance-org-chart"
        aria-label="Finance organization chart"
      >
        <div>
          <span className="small muted">Persistent owner</span>
          <strong>Accounts Payable Analyst</strong>
          <span className="small muted">
            {snapshot.sandbox.mode === "creao"
              ? "CREAO + durable workflow"
              : "Deterministic orchestration"}
          </span>
        </div>
        <ArrowRight size={18} />
        <div className="finance-chart-specialists">
          <span>Contract Finance</span>
          <span>Payment Reconciliation</span>
          <span>Vendor Disputes</span>
          <small>Deterministic specialist tools</small>
        </div>
        <ArrowRight size={18} />
        <div>
          <strong>Human authorization</strong>
          <span>Travel Operations · AP Manager</span>
          <span>Controller · Vendor Relations</span>
          <small>Internal Auditor: read only</small>
        </div>
      </section>
      <section className="team-inbox">
        <div className="row-between">
          <h2>{current?.name ?? "Your"}’s inbox</h2>
          <span className="small muted">
            {ROLE_TITLES[snapshot.profile.role]}
          </span>
        </div>
        {!requests.length && !approvals.length && (
          <p className="muted small">
            No requests or approval items assigned to this role.
          </p>
        )}
        {requests.map((q) => (
          <Link
            className="team-inbox-row"
            href={`/work/${q.caseId}?tab=team`}
            key={q._id}
          >
            <FileText size={14} />
            <span>
              <strong>Information requested</strong>
              <small>{q.text}</small>
            </span>
            <span className="small">
              Open request <ArrowRight size={12} />
            </span>
          </Link>
        ))}
        {approvals.map((c) => (
          <Link
            className="team-inbox-row"
            href={`/work/${c._id}?tab=team`}
            key={c._id}
          >
            <ShieldCheck size={14} />
            <span>
              <strong>{c.input.vendor}</strong>
              <small>{c.input.code} · Approval required</small>
            </span>
            <Status state={c.state} />
          </Link>
        ))}
      </section>
      <div className="finance-team-layout">
        <nav className="employee-list" aria-label="Finance employees">
          {data.employees.map((e) => (
            <button
              key={e._id}
              aria-pressed={selected === e.code}
              className={selected === e.code ? "employee-selected" : ""}
              onClick={() => setSelected(e.code)}
            >
              <strong>{e.name}</strong>
              <span>{ROLE_TITLES[e.role]}</span>
              <small>
                {e.kind === "human"
                  ? "Human role"
                  : e.kind === "specialist"
                    ? "Deterministic specialist"
                    : e.kind === "gateway"
                      ? "Deterministic gateway"
                      : "AP orchestrator"}
              </small>
            </button>
          ))}
          <p className="small muted">
            The existing CREAO Policy Learner is configured separately under
            Integrations. Its recorded jobs remain on Policies.
          </p>
        </nav>
        {person && definition && (
          <section className="employee-detail">
            <div className="row-between">
              <div>
                <h2>{person.name}</h2>
                <p className="muted">
                  {ROLE_TITLES[person.role]} · {person.department}
                </p>
              </div>
              {person.kind === "human" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void act(() => setRole({ role: person.role as HumanRole }))
                  }
                >
                  Act as this role
                </Button>
              )}
            </div>
            <div className="employee-properties">
              <span className="mono">{person.actorId}</span>
              <span>
                Escalates to{" "}
                {EMPLOYEES.find((e) => e.code === definition.escalatesTo)?.name}
              </span>
              <span>
                {person.kind === "human"
                  ? "Fictional staff identity"
                  : person.kind === "specialist"
                    ? "Deterministic service; no independent LLM run"
                    : person.kind === "gateway"
                      ? "Server-side authorization gateway"
                      : "Existing durable investigator; CREAO only in live mode"}
              </span>
            </div>
            <h3>Responsibilities</h3>
            <ul>
              {definition.responsibilities.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h3>Available tools</h3>
            <ul>
              {definition.tools.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h3>Authority</h3>
            <p>
              {definition.allowed.length
                ? definition.allowed
                    .map((a) => a.replaceAll("_", " "))
                    .join(" · ")
                : "Read only"}
            </p>
            <ul>
              {definition.restrictions.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {person.role === "human_accountant" && (
              <p>
                Routine approval limit:{" "}
                <strong>{money(data.approvalLimitCents)}</strong> · Fictional
                demo policy
              </p>
            )}
            <h3>Assigned work</h3>
            {assigned.length ? (
              assigned.map((c) => (
                <Link
                  className="team-case-row"
                  key={c._id}
                  href={`/work/${c._id}?tab=team`}
                >
                  <span>
                    {c.input.vendor}{" "}
                    <small className="mono">{c.input.code}</small>
                  </span>
                  <Status state={c.state} />
                </Link>
              ))
            ) : (
              <p className="muted small">No recorded assignments.</p>
            )}
            <h3>Recent recorded activity</h3>
            {recent.length ? (
              recent.map((a) => (
                <p className="team-recent" key={a._id}>
                  <time>{clock(a.timestamp)}</time>{" "}
                  {a.action.replaceAll("_", " ")} — {a.reason}
                </p>
              ))
            ) : (
              <p className="muted small">
                No events recorded for this actor yet.
              </p>
            )}
          </section>
        )}
      </div>
      {snapshot.profile.role === "human_controller" && (
        <form
          className="team-approval-settings"
          onSubmit={(e) => {
            e.preventDefault();
            const cents = parseUsdCents(limit);
            if (cents === null || cents > 100_000_000) {
              notify(
                "Enter a limit from $0 to $1,000,000 with at most two decimal places.",
                false,
              );
              return;
            }
            void act(() => configure({ limitCents: cents }));
          }}
        >
          <h2>Demo authorization policy</h2>
          <p className="small muted">
            Fictional limits, not Warriors corporate policy. Changes are audited
            and rechecked at posting.
          </p>
          <label>
            AP Manager limit (USD)
            <input
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              value={limit}
              placeholder={String(data.approvalLimitCents / 100)}
              onChange={(e) => setLimit(e.target.value)}
              required
            />
          </label>
          <Button disabled={busy} type="submit">
            Update limit
          </Button>
        </form>
      )}
    </>
  );
}
export function CaseTeamSummary({ detail }: { detail: Detail }) {
  const tasks = (detail.subtasks ?? []).filter(
    (t) =>
      t.revision === detail.case.revision && t.attempt === detail.case.attempt,
  );
  return (
    <div className="case-team-summary">
      <span>
        <Users size={13} />{" "}
        {detail.case.ownerActorId?.startsWith("synthetic-history:")
          ? "Synthetic historical AP record"
          : "Owned by AP Analyst"}
      </span>
      {tasks.map((t) => (
        <span key={t._id}>
          {taskTitle[t.kind]} <b>{t.status.replaceAll("_", " ")}</b>
        </span>
      ))}
    </div>
  );
}
export function CaseTeamWork({
  detail,
  onEvidence,
  onAnswer,
  role,
}: {
  detail: Detail;
  onEvidence: (id: string) => void;
  onAnswer: (kind: "note" | "service_confirmation") => void;
  role: string;
}) {
  const tasks = (detail.subtasks ?? []).filter(
    (t) =>
      t.revision === detail.case.revision && t.attempt === detail.case.attempt,
  );
  const requests = detail.questions.filter((q) => !q.answer);
  return (
    <div className="case-team-work">
      <h2>Assignments & findings</h2>
      <p className="muted small">
        {detail.case.ownerActorId?.startsWith("synthetic-history:")
          ? "Imported synthetic historical decisions. No new agent execution is claimed."
          : "AP Analyst owns this case. Specialist results are persisted deterministic executions, not independently running chat agents."}
      </p>
      {tasks.length ? (
        tasks.map((t) => (
          <article className="specialist-task" key={t._id}>
            <div className="row-between">
              <h3>{taskTitle[t.kind]}</h3>
              <span className={t.status === "failed" ? "red" : "muted"}>
                {t.status.replaceAll("_", " ")}
              </span>
            </div>
            <p>{t.request}</p>
            <div className="mono small muted">
              {t._id} · {t.assignedActorId}
              {t.completedAt && <> · Completed {clock(t.completedAt)}</>}
            </div>
            {t.output && (
              <>
                <p>
                  {t.output.summary ??
                    t.output.recommendation ??
                    "Draft prepared for internal review."}
                </p>
                {t.kind === "contract" &&
                  t.output.cohorts?.map(
                    (cohort: {
                      termId: string;
                      quantity: number;
                      rateCents: number;
                      sourceId: string;
                    }) => (
                      <p key={cohort.termId} className="mono">
                        {cohort.quantity} × {money(cohort.rateCents)}{" "}
                        <button
                          className="source-ref"
                          onClick={() => onEvidence(cohort.sourceId)}
                        >
                          {cohort.sourceId}
                        </button>
                      </p>
                    ),
                  )}
                {t.kind === "payment" && (
                  <p>
                    {t.output.issues?.length ? (
                      <>
                        Payment evidence requires review.
                        <br />
                        {t.output.issues.join(" ")}
                      </>
                    ) : t.output.sourceIds?.length ? (
                      <>
                        Deposit verified:{" "}
                        <button
                          className="source-ref"
                          onClick={() => onEvidence(t.output.sourceIds[0])}
                        >
                          {money(t.output.depositCents)}
                        </button>{" "}
                        · Credited:{" "}
                        <button
                          className="source-ref"
                          onClick={() => onEvidence(t.output.sourceIds[1])}
                        >
                          {money(t.output.creditedCents)}
                        </button>
                      </>
                    ) : (
                      "No deposit obligation recorded."
                    )}
                  </p>
                )}
              </>
            )}
            <div className="evidence-chips">
              {t.requiredEvidence.map((id) => (
                <button key={id} onClick={() => onEvidence(id)}>
                  {id}
                </button>
              ))}
            </div>
            {t.error && <p className="red">{t.error}</p>}
          </article>
        ))
      ) : (
        <p className="muted">
          No specialist execution recorded on this version.
        </p>
      )}
      <h2>Human requests</h2>
      {requests.length ? (
        requests.map((q) => (
          <article className="specialist-task" key={q._id}>
            <h3>{ROLE_TITLES[q.requiredRole ?? "human_controller"]}</h3>
            <p>{q.text}</p>
            <small className="mono muted">
              {q.assignedActorId ?? "Assigned reviewer"}
            </small>
            {(role === "human_controller" || role === q.requiredRole) && (
              <Button
                onClick={() =>
                  onAnswer(
                    q.evidenceKind === "service_confirmation"
                      ? "service_confirmation"
                      : "note",
                  )
                }
              >
                Supply evidence & resume
              </Button>
            )}
          </article>
        ))
      ) : (
        <p className="muted small">No unanswered requests.</p>
      )}
      {(detail.disputes ?? []).map((d) => (
        <section key={d._id} className="dispute-draft">
          <div className="row-between">
            <h2>Dispute package</h2>
            <span>{d.status}</span>
          </div>
          <p>
            {money(d.amountCents)} · {d.requiredApprover} approval
          </p>
          <p className="small muted">
            Draft only. No external communication integration is connected.
          </p>
          <details>
            <summary>Read dispute draft</summary>
            <pre>{d.draft}</pre>
          </details>
        </section>
      ))}
    </div>
  );
}
