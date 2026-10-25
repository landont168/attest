"use client";
import {
  Check,
  Circle,
  Clock3,
  AlertTriangle,
  ArrowUpRight,
  FileText,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn, clock } from "@/lib/utils";
import type { Doc } from "../../convex/_generated/dataModel";
export function Status({
  state,
  small = false,
}: {
  state: string;
  small?: boolean;
}) {
  const labels: Record<string, string> = {
    NEW: "New",
    INVESTIGATING: "Investigating",
    PROPOSED: "Awaiting approval",
    NEEDS_INFO: "Needs information",
    APPROVED: "Approved",
    POSTED: "Posted",
    REJECTED: "Rejected",
    REVISION_REQUIRED: "Revision required",
    FAILED_RETRYABLE: "Retry available",
    active: "Active",
    candidate: "Proposed policy",
    superseded: "Superseded",
  };
  const tone = ["POSTED", "active"].includes(state)
    ? "green"
    : [
          "PROPOSED",
          "NEEDS_INFO",
          "APPROVED",
          "candidate",
          "REVISION_REQUIRED",
        ].includes(state)
      ? "amber"
      : ["REJECTED", "FAILED_RETRYABLE"].includes(state)
        ? "red"
        : "blue";
  return (
    <span className={cn("status", `status-${tone}`, small && "status-small")}>
      <span className="status-dot" />
      {labels[state] ?? state}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <ShieldCheck size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}
export function Panel({
  title,
  meta,
  children,
  className,
}: {
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel", className)}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {meta}
        </div>
      )}
      {children}
    </section>
  );
}
export function Activity({
  events,
  compact = false,
  onEvidence,
}: {
  events: Doc<"audit">[];
  compact?: boolean;
  onEvidence?: (id: string) => void;
}) {
  return (
    <div className={cn("activity-list", compact && "compact")}>
      {events.map((e) => (
        <div className="activity-row" key={e._id}>
          <div className={cn("activity-icon", !e.allowed && "denied")}>
            {!e.allowed ? (
              <ShieldCheck size={14} />
            ) : e.action.includes("posted") ? (
              <Check size={14} />
            ) : e.action.includes("evidence") ? (
              <FileText size={14} />
            ) : (
              <Circle size={10} />
            )}
          </div>
          <div className="activity-body">
            <div className="activity-label">
              {e.action.replaceAll("_", " ")}
              <time>{clock(e.timestamp)}</time>
            </div>
            <p>{e.reason}</p>
            {!compact && (
              <>
                <div className="activity-meta">
                  {e.role.replaceAll("_", " ")} · {e.before}
                  {e.before !== e.after && <> → {e.after}</>}
                </div>
                {e.evidenceIds.length > 0 && (
                  <div className="evidence-chips">
                    {e.evidenceIds.map((id) => (
                      <button onClick={() => onEvidence?.(id)} key={id}>
                        {id}
                        <ArrowUpRight size={10} />
                      </button>
                    ))}
                  </div>
                )}
                {e.postingRef && (
                  <div className="mono muted">{e.postingRef}</div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
export function Notice({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "amber" | "red" | "green";
}) {
  return (
    <div className={`notice notice-${tone}`}>
      {tone === "amber" || tone === "red" ? (
        <AlertTriangle size={16} />
      ) : tone === "green" ? (
        <Check size={16} />
      ) : (
        <Clock3 size={16} />
      )}
      <div>{children}</div>
    </div>
  );
}
