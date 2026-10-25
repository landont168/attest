"use client";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  FileCheck2,
  FileText,
  History,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import type { Detail, Snapshot } from "@/lib/view-types";
import type { Source, Result } from "@/lib/finance/types";
import { cn, money, shortDate, clock } from "@/lib/utils";
import { Activity, Empty, Notice, Panel, Status } from "./primitives";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import type { Notify } from "./attest-app";
export function Investigation({
  id,
  snapshot,
  notify,
}: {
  id: Id<"cases">;
  snapshot: Snapshot;
  notify: Notify;
}) {
  const data = useQuery(api.cases.detail, { id }) as Detail | undefined;
  const review = useMutation(api.cases.review);
  const resolve = useMutation(api.cases.resolve);
  const resume = useMutation(api.cases.resume);
  const denial = useMutation(api.cases.demonstrateDenial);
  const reverse = useMutation(api.cases.reverse);
  const inject = useMutation(api.workspace.inject);
  const proposePolicy = useMutation(api.policies.propose);
  const [tab, setTab] = useState("reconciliation");
  const [source, setSource] = useState<Source | null>(null);
  const [dialog, setDialog] = useState<
    "approve" | "reject" | "ask" | "resolve" | "answer" | "reverse" | null
  >(null);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<
    "note" | "signed_amendment" | "service_confirmation"
  >("note");
  const [busy, setBusy] = useState(false);
  const [historical, setHistorical] = useState<Doc<"proposals"> | null>(null);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("tab") === "audit")
      setTab("audit");
  }, []);
  if (!data)
    return (
      <div className="loading-content">
        <div className="skeleton heading-skeleton" />
        <div className="skeleton content-skeleton" />
      </div>
    );
  const c = data.case;
  const proposal = data.proposals.find((p) => p._id === c.proposalId);
  const result = proposal?.result as Result | undefined;
  const input = c.input;
  const policy = snapshot.policies.find((p) => p._id === proposal?.policyId);
  const invoiceCents = input.lines.reduce(
    (n, l) => n + l.quantity * l.rateCents,
    0,
  );
  const pending = data.questions.filter((q) => !q.answer);
  const sources = (historical?.input.sources ?? input.sources) as Source[];
  const openSource = (sid: string) => {
    const found = sources.find((s) => s.id === sid);
    if (found) setSource(found);
    else notify(`Source ${sid} is not in this evidence snapshot.`, false);
  };
  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      notify(r.message, r.ok);
      if (r.ok) {
        setDialog(null);
        setReason("");
      }
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "The action could not be completed.",
        false,
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (dialog === "resolve")
      void run(() =>
        resolve({
          id,
          amountCents: result?.expectedCents ?? 0,
          reference: reason,
        }),
      );
    else if (dialog === "answer")
      void run(() => resume({ id, answer: reason, evidence }));
    else if (dialog === "reverse") void run(() => reverse({ id, reason }));
    else if (dialog && proposal)
      void run(() =>
        review({ id, proposalId: proposal._id, operation: dialog, reason }),
      );
  };
  const decision = (
    <>
      <Panel title="Decision & next action" meta={<ShieldCheck size={15} />}>
        <div className="panel-body decision-body">
          <div className="eyebrow">
            {c.resolution
              ? "CORRECTED PAYABLE"
              : result?.disposition === "disputed"
                ? "PROPOSED DISPUTE"
                : result?.disposition === "matched"
                  ? "SUPPORTED INVOICE"
                  : "INVESTIGATION OUTCOME"}
          </div>
          <h3>
            {c.state === "POSTED"
              ? "Authorized financial work recorded"
              : c.state === "APPROVED"
                ? "Awaiting vendor resolution"
                : c.state === "NEEDS_INFO"
                  ? "More evidence is needed"
                  : result?.disposition === "disputed"
                    ? "Original room rates still apply"
                    : result?.disposition === "matched"
                      ? "The invoice is supported"
                      : "Reviewing the full agreement"}
          </h3>
          <p>{result?.explanation ?? c.phase}</p>
          {result && (
            <div className="evidence-complete">
              <ShieldCheck size={14} />
              {result.disposition === "needs_info"
                ? "Evidence incomplete"
                : `${result.evidenceIds.length} validated evidence references`}
            </div>
          )}
          {policy && (
            <div className="policy-reference">
              <BookOpen size={14} />
              <Link href="/policies">
                {policy.title} <span>v{policy.version}</span>
              </Link>
            </div>
          )}
          {c.state === "PROPOSED" && (
            <>
              <div className="next-effect">
                <small>APPROVING WILL</small>
                <p>
                  {result?.disposition === "disputed" && !c.resolution
                    ? "Record an approved dispute. The payable remains on hold until documented vendor resolution."
                    : "Authorize the gateway to validate and record the simulated expense and payable."}
                </p>
              </div>
              <Button
                className="full-width"
                disabled={busy}
                onClick={() => {
                  setReason("");
                  setDialog("approve");
                }}
              >
                <Check size={15} />
                {c.resolution
                  ? "Approve corrected posting"
                  : result?.disposition === "disputed"
                    ? "Approve dispute"
                    : "Approve & post"}
              </Button>
              <div className="decision-buttons">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setReason("");
                    setDialog("reject");
                  }}
                >
                  Reject
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setReason("");
                    setDialog("ask");
                  }}
                >
                  Request information
                </Button>
              </div>
              <small className="muted">
                {c.resolution
                  ? "Finance controller"
                  : "Authorized human reviewer"}{" "}
                required · Server-enforced
              </small>
            </>
          )}
          {c.state === "APPROVED" && (
            <>
              <Notice tone="amber">
                Dispute approval is not vendor acceptance. No lower payable has
                been recorded.
              </Notice>
              <Button
                variant="outline"
                className="full-width"
                disabled={busy}
                onClick={() => {
                  setReason("");
                  setDialog("resolve");
                }}
              >
                Record vendor resolution
                <ArrowRight size={14} />
              </Button>
              <small className="muted">Simulated controller action</small>
            </>
          )}
          {["NEEDS_INFO", "REJECTED", "FAILED_RETRYABLE"].includes(c.state) && (
            <>
              <Button
                className="full-width"
                disabled={busy}
                onClick={() => {
                  setReason("");
                  setDialog("answer");
                }}
              >
                <MessageSquare size={14} />
                {c.state === "FAILED_RETRYABLE"
                  ? "Review & retry"
                  : "Respond & resume"}
              </Button>
              <small className="muted">
                An answer resumes the same persistent case.
              </small>
            </>
          )}
          {c.state === "POSTED" && (
            <>
              <Notice tone="green">
                The ledger entry balances. Its approval and source evidence are
                preserved.
              </Notice>
              <Button
                variant="outline"
                className="full-width"
                disabled={busy}
                onClick={() => {
                  setReason("");
                  setDialog("reverse");
                }}
              >
                Create linked reversal
              </Button>
              <small className="muted">
                Controller only · March 2027 open period
              </small>
            </>
          )}
        </div>
      </Panel>
      {pending.length > 0 && (
        <Panel title="Questions for finance">
          <div className="panel-body">
            {pending.map((q) => (
              <div className="question" key={q._id}>
                <CircleHelp size={16} />
                <p>{q.text}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel
        title="Autonomous activity"
        meta={
          <span className="live-caption">
            <span className="live-dot" /> Live
          </span>
        }
      >
        <div className="agent-provider">
          <div className="agent-avatar">
            <Sparkles size={17} />
          </div>
          <div>
            <strong>Contract investigator</strong>
            <small>
              {c.mode === "creao"
                ? `CREAO · ${c.providerStatus ?? "queued"}`
                : "Deterministic simulation · no AI run"}
            </small>
          </div>
        </div>
        <Activity
          events={data.audit
            .filter((e) => e.role === "ai_agent" || e.role === "sync_job")
            .slice(0, 5)}
          compact
        />
        <div className="panel-link">
          <button onClick={() => setTab("activity")}>
            View full execution history
            <ArrowUpRight size={13} />
          </button>
        </div>
      </Panel>
    </>
  );
  const evidencePanel = (
    <Panel
      title="Contracts & evidence"
      meta={<span className="count-pill">{input.sources.length}</span>}
    >
      <div className="evidence-timeline">
        {[...input.sources]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((s, i) => (
            <button
              className={cn(
                "timeline-record",
                s.kind === "amendment" && "amendment-record",
              )}
              key={s.id}
              onClick={() => {
                setHistorical(null);
                setSource(s as Source);
              }}
            >
              <span className="timeline-marker">
                {s.kind === "service" ? (
                  <CheckCheck size={14} />
                ) : (
                  <FileText size={14} />
                )}
              </span>
              <div>
                <small>{shortDate(s.date)}</small>
                <strong>{s.title}</strong>
                <span className="source-kind">
                  {s.kind}
                  {s.signed && (
                    <>
                      {" "}
                      · <Check size={10} /> Signed
                    </>
                  )}
                </span>
                <span className="source-id">{s.id}</span>
              </div>
              <ArrowUpRight size={13} />
            </button>
          ))}
      </div>
      <div className="evidence-legend">
        <ShieldCheck size={14} />
        <span>Source versions are retained with every proposal.</span>
      </div>
    </Panel>
  );
  const financial = (
    <>
      <Panel
        title="Financial reconciliation"
        meta={<span className="currency-tag">USD</span>}
      >
        <div className="calculation-intro">
          <FileCheck2 size={17} />
          <div>
            <strong>Confirmed services</strong>
            <span>
              {input.service.quantity} room-nights · {shortDate(input.start)} –{" "}
              {shortDate(input.end)}
            </span>
          </div>
          <button
            className="text-button"
            onClick={() => openSource(input.service.sourceId)}
          >
            View record
            <ArrowUpRight size={13} />
          </button>
        </div>
        {result?.cohorts.length ? (
          <>
            <div className="reconciliation-table">
              <table>
                <thead>
                  <tr>
                    <th>Contracted service</th>
                    <th className="numeric">Qty</th>
                    <th className="numeric">Rate</th>
                    <th className="numeric">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.cohorts.map((cohort, i) => (
                    <tr key={`${cohort.termId}-${i}`}>
                      <td>
                        <strong>{cohort.label}</strong>
                        <button
                          className="source-ref"
                          onClick={() => openSource(cohort.sourceId)}
                        >
                          <FileText size={11} />
                          {cohort.sourceId}
                          <ArrowUpRight size={10} />
                        </button>
                      </td>
                      <td className="numeric">
                        {cohort.quantity}
                        <small>room-nights</small>
                      </td>
                      <td className="numeric">
                        <button
                          className="amount-link"
                          onClick={() => openSource(cohort.sourceId)}
                        >
                          {money(cohort.rateCents)}
                        </button>
                      </td>
                      <td className="numeric">
                        <strong>{money(cohort.amountCents)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="financial-totals">
              <div>
                <span>Supported contractual total</span>
                <strong>{money(result.expectedCents)}</strong>
              </div>
              <div>
                <span>Vendor invoice</span>
                <button
                  className="amount-link"
                  onClick={() => openSource(input.code)}
                >
                  {money(result.invoiceCents)}
                </button>
              </div>
              <div
                className={cn(
                  "difference-row",
                  result.differenceCents === 0 && "matched-row",
                )}
              >
                <span>
                  {result.differenceCents === 0 ? (
                    <Check size={15} />
                  ) : (
                    <CircleHelp size={15} />
                  )}{" "}
                  {result.differenceCents === 0
                    ? "Reconciled difference"
                    : "Proposed discrepancy"}
                </span>
                <strong>
                  {result.differenceCents && result.differenceCents > 0
                    ? "+"
                    : ""}
                  {money(result.differenceCents)}
                </strong>
              </div>
            </div>
            <div className="calculation-note">
              <ShieldCheck size={13} />
              Calculated in integer cents · Validated against signed source
              records
            </div>
          </>
        ) : (
          <div className="panel-body">
            <Notice tone={c.state === "NEEDS_INFO" ? "amber" : "blue"}>
              {c.state === "NEEDS_INFO"
                ? "Expected amount is withheld until the missing evidence is resolved."
                : "The financial comparison appears after a validated investigation."}
            </Notice>
            {result?.issues.map((issue) => (
              <p className="issue-line" key={issue}>
                <CircleHelp size={14} />
                {issue}
              </p>
            ))}
          </div>
        )}
      </Panel>
      {result?.differenceCents !== 0 && result?.expectedCents != null && (
        <Panel title="Where the records disagree">
          <div className="conflict-comparison">
            <div>
              <span className="eyebrow">VENDOR INVOICE</span>
              <strong>
                {input.lines
                  .map((l) => `${l.quantity} × ${money(l.rateCents)}`)
                  .join(" + ")}
              </strong>
              <p>The invoice requests {money(result.invoiceCents)}.</p>
              <button onClick={() => openSource(input.code)}>
                Inspect invoice
                <ArrowUpRight size={12} />
              </button>
            </div>
            <ArrowRight size={18} />
            <div>
              <span className="eyebrow">SIGNED TERMS</span>
              <strong>
                {result.cohorts
                  .map((l) => `${l.quantity} × ${money(l.rateCents)}`)
                  .join(" + ")}
              </strong>
              <p>Supported amount: {money(result.expectedCents)}.</p>
              <button
                onClick={() => openSource(result.cohorts[0]?.sourceId ?? "")}
              >
                Inspect agreement
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
          <div className="conflict-footer">
            <span className="status-dot" />A valid later rate does not
            automatically replace an earlier commitment.
          </div>
        </Panel>
      )}
      {c.resolution && (
        <Panel title="Vendor resolution">
          <div className="panel-body">
            <Notice tone="green">{c.resolution.text}</Notice>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openSource(c.resolution!.sourceId)}
            >
              Open resolution evidence
              <ArrowUpRight size={13} />
            </Button>
          </div>
        </Panel>
      )}
      <Panel title="Operational context">
        <div className="trip-context">
          <div className="trip-icon">
            <MapPin size={20} />
          </div>
          <div>
            <strong>Team travel service</strong>
            <p>{input.destination} · Team Travel</p>
          </div>
          <div>
            <small>SERVICE WINDOW</small>
            <span>
              {shortDate(input.start)} – {shortDate(input.end)}
            </span>
          </div>
        </div>
        <div className="context-footnote">
          Fictional itinerary and financial records. No real team activity is
          asserted.
        </div>
      </Panel>
      {data.journals.length > 0 && (
        <Panel
          title="Simulated ledger"
          meta={<span className="status status-green">Balanced</span>}
        >
          {data.journals.map((j) => (
            <div className="journal" key={j._id}>
              <div className="row-between">
                <strong>
                  {j.reversalOf ? "Linked reversal" : "Expense & payable"}
                </strong>
                <span className="mono muted">Period {j.period}</span>
              </div>
              <p>{j.reason}</p>
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="numeric">Debit</th>
                    <th className="numeric">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {j.lines.map((l) => (
                    <tr key={l.account}>
                      <td>{l.account}</td>
                      <td className="numeric">
                        {l.debitCents ? money(l.debitCents) : "—"}
                      </td>
                      <td className="numeric">
                        {l.creditCents ? money(l.creditCents) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <small className="mono muted">{j.reference}</small>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
  return (
    <>
      <Link href="/work" className="back-link">
        <ArrowLeft size={13} />
        Work queue
      </Link>
      <div className="case-heading">
        <div className="case-identity">
          <div className="vendor-avatar vendor-large">
            {input.vendor
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div>
            <div className="row-inline">
              <h1>{input.vendor}</h1>
              <Status state={c.state} />
            </div>
            <p>
              Team Travel <span>·</span> {shortDate(input.start)} –{" "}
              {shortDate(input.end)} <span>·</span>{" "}
              <span className="mono">{input.code}</span>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void inject({ input })
              .then(() =>
                notify(
                  "Repeated ingestion checked. The existing case was retained.",
                ),
              )
              .catch((e) => notify(e.message, false))
          }
        >
          <Copy size={13} />
          Re-ingest invoice
        </Button>
      </div>
      <div className="case-metadata">
        <span>
          <FileText size={12} />
          {input.contractId}
        </span>
        <span>
          <Clock3 size={12} />
          Updated {clock(c.updatedAt)}
        </span>
        <span>
          <ShieldCheck size={12} />
          {c.resolution ? "Finance controller" : "AP analyst"}
        </span>
        <span className="case-mode">
          {c.mode === "creao"
            ? "CREAO investigation"
            : "Deterministic simulation"}
        </span>
      </div>
      <div className="case-metrics">
        <div>
          <small>INVOICED</small>
          <strong>{money(invoiceCents)}</strong>
          <span>Vendor submitted amount</span>
        </div>
        <div>
          <small>EXPECTED</small>
          <strong>{money(result?.expectedCents)}</strong>
          <span>Validated contractual charge</span>
        </div>
        <div className={result?.differenceCents ? "metric-discrepancy" : ""}>
          <small>
            {result?.differenceCents === 0
              ? "DIFFERENCE"
              : c.resolution
                ? "ORIGINAL DISCREPANCY"
                : "PROPOSED DISCREPANCY"}
          </small>
          <strong>
            {result?.differenceCents && result.differenceCents > 0 ? "+" : ""}
            {money(result?.differenceCents)}
          </strong>
          <span>
            {result?.differenceCents === 0
              ? "Invoice matches supported terms"
              : c.resolution
                ? "Vendor correction documented"
                : "Subject to resolution · not savings"}
          </span>
        </div>
      </div>
      {c.error && <Notice tone="red">{c.error}</Notice>}
      <div className="case-tabs">
        {[
          { id: "reconciliation", label: "Reconciliation", icon: LayersIcon },
          { id: "evidence", label: "Evidence", icon: FileText },
          { id: "activity", label: "Agent activity", icon: Sparkles },
          { id: "decision", label: "Decision", icon: ShieldCheck },
          { id: "audit", label: "Audit history", icon: History },
        ].map((t) => (
          <button
            key={t.id}
            className={cn(tab === t.id && "selected")}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={14} />
            {t.label}
            {t.id === "evidence" && <span>{input.sources.length}</span>}
          </button>
        ))}
      </div>
      {tab === "reconciliation" ? (
        <div className="investigation-grid">
          <div className="investigation-left">{evidencePanel}</div>
          <div className="investigation-center">{financial}</div>
          <div className="investigation-right">{decision}</div>
        </div>
      ) : tab === "evidence" ? (
        <div className="evidence-view">
          {evidencePanel}
          <Panel title="Authoritative sources">
            <div className="panel-body">
              {input.sources.map((s) => (
                <article className="source-article" key={s.id}>
                  <div className="row-between">
                    <span className="eyebrow">
                      {s.kind} · {s.id}
                    </span>
                    <span>{shortDate(s.date)}</span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <small>
                    {s.clause} ·{" "}
                    {s.signed
                      ? "Signed / confirmed synthetic record"
                      : "Source record"}
                  </small>
                </article>
              ))}
            </div>
          </Panel>
        </div>
      ) : tab === "activity" ? (
        <div className="audit-layout">
          <Panel title="Observed execution events">
            <Activity
              events={data.audit.filter((e) =>
                ["ai_agent", "sync_job"].includes(e.role),
              )}
              onEvidence={openSource}
            />
          </Panel>
          <Panel title="Provider runs">
            <div className="panel-body">
              {c.mode === "deterministic" ? (
                <Notice>
                  No CREAO run was used. These are real executions of the
                  deterministic finance engine.
                </Notice>
              ) : (
                data.runs.map((r) => (
                  <div className="provider-run" key={r._id}>
                    <Status state={r.status} />
                    <p className="mono">
                      {r.externalId ?? "Awaiting provider run ID"}
                    </p>
                    <small>
                      Attempt {r.attempt} · {clock(r.createdAt)}
                    </small>
                    {r.raw && (
                      <details>
                        <summary>Inspect original provider output</summary>
                        <pre>{r.raw}</pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      ) : tab === "decision" ? (
        <div className="decision-page">
          <div>{decision}</div>
          <Panel title="Proposal history">
            <div className="panel-body">
              {data.proposals.map((p) => (
                <button
                  className="proposal-history"
                  key={p._id}
                  onClick={() => setHistorical(p)}
                >
                  <div>
                    <strong>
                      Source revision {p.revision} · Attempt {p.attempt}
                    </strong>
                    <p>{p.result.explanation}</p>
                    <small>
                      {p.mode} · {clock(p.createdAt)}
                    </small>
                  </div>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </Panel>
        </div>
      ) : (
        <div className="audit-layout">
          <Panel
            title="Why did this happen?"
            meta={<span className="small muted">Persisted records only</span>}
          >
            <Activity events={data.audit} onEvidence={openSource} />
          </Panel>
          <div>
            <Panel title="Authorization controls">
              <div className="panel-body">
                <p className="muted">
                  Exercise the same backend permission check used for financial
                  actions. The AI investigator has no approval or posting
                  authority.
                </p>
                <Button
                  variant="outline"
                  className="full-width"
                  disabled={busy}
                  onClick={() =>
                    void run(() => denial({ id, action: "approve" }))
                  }
                >
                  Attempt agent self-approval
                </Button>
                <Button
                  variant="outline"
                  className="full-width top-gap"
                  disabled={busy}
                  onClick={() => void run(() => denial({ id, action: "post" }))}
                >
                  Attempt agent posting
                </Button>
              </div>
            </Panel>
            <Panel title="Human decisions">
              <div className="panel-body">
                {data.approvals.map((a) => (
                  <article className="precedent" key={a._id}>
                    <span className="eyebrow">
                      {a.decision} · {a.role.replaceAll("_", " ")}
                    </span>
                    <p>{a.reason}</p>
                    <small>
                      Revision {a.revision} · {clock(a.createdAt)}
                    </small>
                  </article>
                ))}
                {data.questions
                  .filter((q) => q.answer)
                  .map((q) => (
                    <article className="precedent" key={q._id}>
                      <strong>{q.text}</strong>
                      <p>{q.answer}</p>
                      <small>Human response preserved</small>
                    </article>
                  ))}
                {data.questions.some((q) => q.answer) && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => proposePolicy({ caseId: id }))
                    }
                  >
                    <Sparkles size={14} />
                    Propose policy improvement
                  </Button>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}
      <Dialog
        open={!!source}
        onOpenChange={(v) => !v && setSource(null)}
        title={source?.title ?? "Source evidence"}
        description={`${source?.id ?? ""} · ${source?.kind ?? ""}`}
      >
        <div className="dialog-body">
          {source && (
            <>
              <div className="row-between">
                <span className="eyebrow">{shortDate(source.date)}</span>
                <span
                  className={cn(
                    "status",
                    source.signed ? "status-green" : "status-neutral",
                  )}
                >
                  {source.signed ? "Signed / confirmed" : "Source record"}
                </span>
              </div>
              <div className="document-paper">
                <div className="document-letterhead">
                  {input.vendor}
                  <span>SYNTHETIC DOCUMENT</span>
                </div>
                <h3>{source.title}</h3>
                <div className="highlighted-clause">
                  <strong>{source.clause}</strong>
                  <p>{source.text}</p>
                </div>
                <small>Source ID: {source.id}</small>
              </div>
              <Notice>
                This is a synthetic business record. The cited clause, source
                identifier, and version are retained with the investigation.
              </Notice>
            </>
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => !v && setDialog(null)}
        title={
          dialog === "approve"
            ? "Authorize the proposed action"
            : dialog === "resolve"
              ? "Record synthetic vendor resolution"
              : dialog === "answer"
                ? "Respond and resume investigation"
                : dialog === "reverse"
                  ? "Authorize a linked reversal"
                  : dialog === "reject"
                    ? "Reject this proposal"
                    : "Request more information"
        }
        description={
          dialog === "resolve"
            ? "This records fictional vendor acceptance. It is not an actual vendor communication."
            : dialog === "reverse"
              ? "The original journal remains unchanged. A balanced reversal will post in March 2027."
              : "Your decision and explanation are recorded in the audit trail."
        }
      >
        <form
          className="dialog-body"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {dialog === "approve" && (
            <Notice tone="amber">
              {c.resolution || result?.disposition === "matched"
                ? `Authorize simulated posting of ${money(result?.expectedCents)} after gateway validation.`
                : "Approve the proposed dispute only. No payable is posted and no savings are claimed."}
            </Notice>
          )}
          {dialog === "resolve" && (
            <div className="resolution-amount">
              <small>Vendor-accepted corrected amount</small>
              <strong>{money(result?.expectedCents)}</strong>
            </div>
          )}
          <label className="form-label">
            {dialog === "resolve"
              ? "Vendor acceptance / revised invoice reference"
              : dialog === "approve"
                ? "Review note (optional)"
                : "Explanation"}
            <textarea
              autoFocus
              rows={4}
              required={dialog !== "approve"}
              placeholder={
                dialog === "answer"
                  ? "Explain the clarification. A controller can cite AMD-HOTEL-001 to confirm the existing signed schedule."
                  : dialog === "resolve"
                    ? "e.g. Meridian revised invoice MH-2027-0215-R1"
                    : "Explain your decision and reference relevant evidence."
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {dialog === "answer" && (
            <label className="form-label">
              Supporting evidence
              <select
                value={evidence}
                onChange={(e) => setEvidence(e.target.value as typeof evidence)}
              >
                <option value="note">
                  Clarification / retry existing investigation
                </option>
                <option value="signed_amendment">
                  Record missing synthetic signed amendment
                </option>
                <option value="service_confirmation">
                  Record synthetic service confirmation
                </option>
              </select>
            </label>
          )}
          <div className="dialog-actions">
            <Button
              variant="outline"
              type="button"
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              {busy
                ? "Saving…"
                : dialog === "answer"
                  ? "Save & resume"
                  : dialog === "approve"
                    ? "Confirm approval"
                    : "Save decision"}
              <ArrowRight size={14} />
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!historical && !source}
        onOpenChange={(v) => !v && setHistorical(null)}
        title="Historical decision packet"
        description="Immutable proposal, source snapshot, and policy reference."
      >
        <div className="dialog-body">
          {historical && (
            <>
              <span className="eyebrow">
                Revision {historical.revision} · Attempt {historical.attempt}
              </span>
              <h3>{historical.result.disposition.replaceAll("_", " ")}</h3>
              <p>{historical.result.explanation}</p>
              <div className="approval-amounts">
                <div>
                  <small>Expected</small>
                  <strong>{money(historical.result.expectedCents)}</strong>
                </div>
                <div>
                  <small>Difference</small>
                  <strong>{money(historical.result.differenceCents)}</strong>
                </div>
              </div>
              <div className="evidence-chips">
                {historical.result.evidenceIds.map((s) => (
                  <button key={s} onClick={() => openSource(s)}>
                    {s}
                    <ArrowUpRight size={11} />
                  </button>
                ))}
              </div>
              <p className="small muted">
                Policy:{" "}
                {snapshot.policies.find((p) => p._id === historical.policyId)
                  ?.title ?? "No policy"}{" "}
                · Provider: {historical.mode}
              </p>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
function LayersIcon({ size = 14 }: { size?: number }) {
  return <FileCheck2 size={size} />;
}
