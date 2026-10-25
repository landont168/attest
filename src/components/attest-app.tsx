"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  ListFilter,
  ListTodo,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unplug,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import type { Snapshot, CaseRow } from "@/lib/view-types";
import { money, shortDate, cn, clock } from "@/lib/utils";
import { hotelFixture } from "@/lib/simulation/fixtures";
import type { InvoiceInput } from "@/lib/finance/types";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import {
  Activity,
  Empty,
  Notice,
  Panel,
  SectionTitle,
  Status,
} from "./primitives";
import { Investigation } from "./investigation";
export type Notify = (message: string, ok?: boolean) => void;
const links = [
  { name: "Overview", href: "/overview", icon: LayoutDashboard },
  { name: "Work queue", href: "/work", icon: ListTodo },
  { name: "Contracts", href: "/contracts", icon: FileText },
  { name: "Approvals", href: "/approvals", icon: CheckCheck },
  { name: "Policies", href: "/policies", icon: BookOpen },
  { name: "Audit trail", href: "/audit", icon: ActivityIcon },
  { name: "Evaluation", href: "/evaluation", icon: ShieldCheck },
  { name: "Integrations", href: "/integrations", icon: Unplug },
];
export function AttestApp() {
  const path = usePathname();
  const router = useRouter();
  const snapshot = useQuery(api.workspace.snapshot) as
    Snapshot | null | undefined;
  const setRole = useMutation(api.workspace.setRole);
  const reset = useMutation(api.workspace.reset);
  const [mobile, setMobile] = useState(false);
  const [scenario, setScenario] = useState(false);
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(
    null,
  );
  const notify: Notify = (message, ok = true) => setToast({ message, ok });
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  if (!snapshot)
    return (
      <div className="setup-page">
        <div className="brand-mark">A</div>
        <p>Loading your financial workspace…</p>
      </div>
    );
  const current =
    path === "/"
      ? "Work queue"
      : (links.find((l) => path.startsWith(l.href))?.name ?? "Work queue");
  const isDetail = path.startsWith("/work/") && path.split("/").length > 2;
  const currentCase = isDetail
    ? snapshot.cases.find((c) => c._id === path.split("/")[2])
    : null;
  const attention = snapshot.cases.filter((c) =>
    ["PROPOSED", "NEEDS_INFO", "FAILED_RETRYABLE", "REJECTED"].includes(
      c.state,
    ),
  ).length;
  return (
    <div className="app-shell">
      <aside className={cn("sidebar", mobile && "sidebar-open")}>
        <Link className="product-brand" href="/work">
          <span className="brand-mark">
            <svg
              width="28"
              height="30"
              viewBox="0 0 28 30"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 25 12 5h4l9 20M8 18h12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="m10 24 3 3 6-7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            attest<span className="brand-period">.</span>
          </span>
        </Link>
        <div className="org-selector">
          <div className="org-mark">
            GS<span>W</span>
          </div>
          <div>
            <strong>Golden State Warriors</strong>
            <span>Finance Operations</span>
          </div>
          <ChevronDown size={13} />
        </div>
        <div className="sidebar-label">Workspace</div>
        <nav>
          {links.map((item, i) => (
            <div key={item.name}>
              {i === 4 && <div className="sidebar-label">Intelligence</div>}
              {i === 7 && <div className="sidebar-label">System</div>}
              <Link
                href={item.href}
                className={cn("nav-item", current === item.name && "active")}
                onClick={() => setMobile(false)}
              >
                <item.icon size={17} />
                <span>{item.name}</span>
                {item.name === "Approvals" &&
                  snapshot.cases.filter((c) => c.state === "PROPOSED").length >
                    0 && (
                    <span className="nav-count">
                      {
                        snapshot.cases.filter((c) => c.state === "PROPOSED")
                          .length
                      }
                    </span>
                  )}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-health">
            <span className="live-dot" />
            <div>
              <strong>Workspace connected</strong>
              <small>Synthetic team-travel records</small>
            </div>
          </div>
          <button className="nav-item" onClick={() => setSettings(true)}>
            <Settings2 size={16} />
            <span>Simulation settings</span>
          </button>
          <div className="sidebar-person">
            <div className="person-avatar">
              {snapshot.profile.role === "human_controller" ? "FC" : "AP"}
            </div>
            <div>
              <strong>
                {snapshot.profile.role === "human_controller"
                  ? "Finance Controller"
                  : "AP Analyst"}
              </strong>
              <small>Simulated role</small>
            </div>
            <ChevronDown size={13} />
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <span className="muted">Finance Operations</span>
            <ChevronRight size={13} />
            <span>{current}</span>
            {currentCase && (
              <>
                <ChevronRight size={13} />
                <span>{currentCase.input.code}</span>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <span className="simulation-label">
              <FlaskConical size={13} /> Independent simulation · Synthetic
              financial data
            </span>
            <button
              className="icon-button"
              aria-label="View items needing attention"
              onClick={() => router.push("/approvals")}
            >
              <Bell size={17} />
              {attention > 0 && <span className="notification-dot" />}
            </button>
            <div className="top-avatar">GS</div>
          </div>
        </header>
        <div className="environment-strip">
          <span className="mobile-simulation-note">
            Independent simulation · Synthetic financial data
          </span>
          <span className="environment-details">
            <span
              className={cn(
                "live-dot",
                snapshot.sandbox.mode === "deterministic" && "amber-dot",
              )}
            />
            {snapshot.sandbox.mode === "deterministic"
              ? "Deterministic simulation"
              : "CREAO investigation mode"}
            <span className="strip-divider">/</span>Synthetic business date ·
            February 2027
          </span>
          <span className="role-switch">
            <label htmlFor="role">Acting as</label>
            <select
              id="role"
              value={snapshot.profile.role}
              onChange={(e) =>
                void setRole({
                  role: e.target.value as
                    "human_accountant" | "human_controller",
                })
                  .then((r) => notify(r.message, r.ok))
                  .catch((e) => notify(e.message, false))
              }
            >
              <option value="human_accountant">AP Analyst</option>
              <option value="human_controller">Finance Controller</option>
            </select>
          </span>
        </div>
        <main className={cn("main-content", isDetail && "detail-content")}>
          {isDetail ? (
            currentCase ? (
              <Investigation
                id={currentCase._id}
                snapshot={snapshot}
                notify={notify}
              />
            ) : (
              <Empty title="Case not found">
                This case is not part of your current simulation.
              </Empty>
            )
          ) : current === "Overview" ? (
            <Overview
              snapshot={snapshot}
              onScenario={() => setScenario(true)}
            />
          ) : current === "Work queue" ? (
            <Queue snapshot={snapshot} onScenario={() => setScenario(true)} />
          ) : current === "Contracts" ? (
            <Contracts snapshot={snapshot} />
          ) : current === "Approvals" ? (
            <Approvals snapshot={snapshot} />
          ) : current === "Audit trail" ? (
            <AuditPage snapshot={snapshot} />
          ) : current === "Policies" ? (
            <Policies snapshot={snapshot} notify={notify} />
          ) : current === "Evaluation" ? (
            <Evaluation />
          ) : (
            <Integrations snapshot={snapshot} notify={notify} />
          )}
        </main>
        <footer className="app-footer">
          <span>Attest · Every number has a reason.</span>
          <span>
            Unofficial simulation. Not affiliated with the Golden State Warriors
            or NBA.
          </span>
        </footer>
      </div>
      <ScenarioDialog
        open={scenario}
        close={() => setScenario(false)}
        notify={notify}
      />
      <Dialog
        open={settings}
        onOpenChange={setSettings}
        title="Simulation settings"
        description="Your sandbox is isolated from other visitors. Roles are simulated, not production finance authorization."
      >
        <div className="dialog-body">
          <Notice>
            Resetting starts a fresh dataset. Previous journals, sources, and
            audit events remain archived.
          </Notice>
          <div className="setting-line">
            <div>
              <strong>Current workspace</strong>
              <p>Simulation generation {snapshot.sandbox.generation}</p>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                void reset({})
                  .then((r) => {
                    notify(r.message);
                    setSettings(false);
                    router.push("/work");
                  })
                  .catch((e) => notify(e.message, false))
              }
            >
              Reset simulation
            </Button>
          </div>
          <div className="setting-line">
            <div>
              <strong>Provider configuration</strong>
              <p>Credentials stay server-side.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSettings(false);
                router.push("/integrations");
              }}
            >
              Integrations
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </Dialog>
      {toast && (
        <div role="status" className={cn("toast", !toast.ok && "toast-error")}>
          <ShieldCheck size={17} />
          <span>{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof FileText;
  tone?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <Icon size={16} />
      </div>
      <div className={cn("metric-value", tone)}>
        {typeof value === "string" && value.includes("$") ? (
          <Link href="/work" className="amount-link">
            {value}
          </Link>
        ) : (
          value
        )}
      </div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}
function Table({ cases }: { cases: CaseRow[] }) {
  return (
    <div className="table-scroll">
      <table className="work-table">
        <thead>
          <tr>
            <th>Vendor / invoice</th>
            <th>Service period</th>
            <th className="numeric">Invoiced</th>
            <th className="numeric">Expected</th>
            <th className="numeric">Difference</th>
            <th>Status</th>
            <th>Last activity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c._id}>
              <td>
                <Link className="vendor-link" href={`/work/${c._id}`}>
                  <div
                    className={cn(
                      "vendor-avatar",
                      c.input.vendor.includes("Meridian") && "vendor-meridian",
                    )}
                  >
                    {c.input.vendor
                      .split(" ")
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div>
                    <strong>{c.input.vendor}</strong>
                    <span>{c.input.code}</span>
                  </div>
                </Link>
              </td>
              <td>
                <span>
                  {shortDate(c.input.start).replace(", 2027", "")} –{" "}
                  {new Date(`${c.input.end}T12:00`).getDate()}
                </span>
                <small className="cell-sub">{c.input.destination}</small>
              </td>
              <td className="numeric">
                <Link
                  className="amount-link"
                  href={`/work/${c._id}?tab=calculation`}
                >
                  {money(
                    c.result?.invoiceCents ??
                      c.input.lines.reduce(
                        (n, l) => n + l.quantity * l.rateCents,
                        0,
                      ),
                  )}
                </Link>
              </td>
              <td className="numeric muted">
                <Link
                  className="amount-link"
                  href={`/work/${c._id}?tab=calculation`}
                >
                  {money(c.result?.expectedCents)}
                </Link>
              </td>
              <td
                className={cn(
                  "numeric",
                  c.result?.differenceCents ? "amount-amber" : "muted",
                )}
              >
                {c.result?.differenceCents ? (
                  <Link
                    className="amount-link"
                    href={`/work/${c._id}?tab=calculation`}
                  >{`${c.result.differenceCents > 0 ? "+" : ""}${money(c.result.differenceCents)}`}</Link>
                ) : c.result?.differenceCents === 0 ? (
                  <span className="matched-mini">
                    <Check size={12} /> Matched
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <Status state={c.state} />
              </td>
              <td>
                <span>{clock(c.updatedAt)}</span>
                <small className="cell-sub">
                  {c.state === "INVESTIGATING"
                    ? "AI investigator"
                    : c.state === "POSTED"
                      ? "Posting gateway"
                      : c.state === "NEEDS_INFO"
                        ? "Finance controller"
                        : "AP analyst"}
                </small>
              </td>
              <td>
                <Link
                  href={`/work/${c._id}`}
                  className="table-open"
                  aria-label={`Open ${c.input.code}`}
                >
                  <ChevronRight size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!cases.length && (
        <Empty title="No work in this view">
          Try another filter or add a synthetic invoice.
        </Empty>
      )}
    </div>
  );
}
function Queue({
  snapshot,
  onScenario,
}: {
  snapshot: Snapshot;
  onScenario: () => void;
}) {
  const [filter, setFilter] = useState("All work");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [vendor, setVendor] = useState("All vendors");
  const groups: Record<string, string[]> = {
    "Needs attention": [
      "PROPOSED",
      "NEEDS_INFO",
      "REJECTED",
      "FAILED_RETRYABLE",
    ],
    Investigating: ["NEW", "INVESTIGATING", "REVISION_REQUIRED"],
    "Awaiting approval": ["PROPOSED"],
    Completed: ["POSTED"],
  };
  const rows = snapshot.cases
    .filter(
      (c) =>
        (!groups[filter] || groups[filter].includes(c.state)) &&
        (vendor === "All vendors" || c.input.vendor === vendor) &&
        `${c.input.vendor} ${c.input.code}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "amount"
        ? (b.result?.invoiceCents ?? 0) - (a.result?.invoiceCents ?? 0)
        : b.updatedAt - a.updatedAt,
    );
  return (
    <>
      <SectionTitle
        eyebrow="Team travel / Contract finance"
        title="Work queue"
        description="Contract-backed invoices, investigations, and approvals."
        action={
          <Button onClick={onScenario}>
            <Plus size={16} />
            New scenario
          </Button>
        }
      />
      <div className="metrics-grid">
        <Metric
          label="Active work"
          value={snapshot.cases.filter((c) => c.state !== "POSTED").length}
          detail="Cases owned by Attest"
          icon={ListTodo}
        />
        <Metric
          label="Awaiting your review"
          value={snapshot.cases.filter((c) => c.state === "PROPOSED").length}
          detail="Evidence-backed recommendations"
          icon={CheckCheck}
        />
        <Metric
          label="Proposed discrepancies"
          value={money(
            snapshot.cases
              .filter((c) => c.state !== "POSTED")
              .reduce(
                (n, c) => n + Math.max(0, c.result?.differenceCents ?? 0),
                0,
              ),
          )}
          detail="Under review · not realized savings"
          icon={ShieldCheck}
          tone="amount-amber"
        />
        <Metric
          label="Posted financial work"
          value={snapshot.cases.filter((c) => c.state === "POSTED").length}
          detail="Authorized, balanced entries"
          icon={FileText}
        />
      </div>
      {(() => {
        const focus = snapshot.cases.find(
          (c) =>
            c.result &&
            (c.result.differenceCents ?? 0) > 0 &&
            c.state !== "POSTED",
        );
        if (!focus?.result) return null;
        return (
          <section
            className="case-spotlight"
            aria-label="Investigation in focus"
          >
            <div>
              <div className="spotlight-kicker">
                <span className="live-dot" /> Investigation in focus
              </div>
              <h2>{focus.input.vendor}</h2>
              <p>Contract terms, service records, and invoice evidence.</p>
              <p className="mono">
                {focus.input.code} · {focus.input.destination}
              </p>
              <Link className="spotlight-link" href={`/work/${focus._id}`}>
                Open investigation <ArrowUpRight size={14} />
              </Link>
            </div>
            <Link
              className="spotlight-proof"
              href={`/work/${focus._id}?tab=calculation`}
              aria-label={`Inspect the calculation for ${focus.input.vendor}`}
            >
              <div>
                <small>Vendor invoiced</small>
                <strong>{money(focus.result.invoiceCents)}</strong>
              </div>
              <ArrowRight size={18} />
              <div>
                <small>Evidence supports</small>
                <strong>{money(focus.result.expectedCents)}</strong>
              </div>
              <div className="spotlight-difference">
                <b>
                  {money(focus.result.differenceCents)} proposed discrepancy
                </b>
                <span>
                  Review the evidence{" "}
                  <ArrowUpRight size={12} style={{ display: "inline" }} />
                </span>
              </div>
            </Link>
          </section>
        );
      })()}
      <div className="panel queue-panel">
        <div className="queue-tabs">
          {["All work", ...Object.keys(groups)].map((t) => (
            <button
              className={cn(filter === t && "selected")}
              key={t}
              onClick={() => setFilter(t)}
            >
              {t}
              {t === "All work" && <span>{snapshot.cases.length}</span>}
            </button>
          ))}
        </div>
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search work queue"
              placeholder="Search vendor or invoice…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌕</kbd>
          </label>
          <div className="toolbar-right">
            <select
              aria-label="Filter by vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            >
              <option>All vendors</option>
              {[...new Set(snapshot.cases.map((c) => c.input.vendor))].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
            <select
              aria-label="Sort work queue"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recent activity</option>
              <option value="amount">Highest amount</option>
            </select>
            <span className="live-caption">
              <span className="live-dot" /> Live
            </span>
          </div>
        </div>
        <Table cases={rows} />
        <div className="table-footer">
          {rows.length} work items
          <span>All amounts in USD · Source-backed calculations</span>
        </div>
      </div>
      <div className="queue-bottom">
        <div className="insight-note">
          <div className="insight-symbol">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>
              Agreements change. Original commitments don’t disappear.
            </strong>
            <p>
              Attest checks the full contract history before applying a later
              rate.
            </p>
          </div>
          <Link
            href={`/work/${snapshot.cases.find((c) => c.input.code === "INV-HOTEL-001")?._id ?? ""}`}
          >
            Inspect the February case <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </>
  );
}
function Overview({
  snapshot,
  onScenario,
}: {
  snapshot: Snapshot;
  onScenario: () => void;
}) {
  return (
    <>
      <SectionTitle
        eyebrow="Finance operations"
        title="Finance overview"
        description="Golden State Warriors · Team Travel Operations"
        action={
          <Button onClick={onScenario}>
            <Plus size={16} />
            New scenario
          </Button>
        }
      />
      <div className="overview-banner">
        <div>
          <span className="eyebrow">
            Agreements. Operations. Accountability.
          </span>
          <h2>
            Your finance work,
            <br />
            with the full picture.
          </h2>
          <p>
            Attest connects contractual commitments to delivered services,
            <br className="desktop-only" /> then prepares the next authorized
            action.
          </p>
          <Link href="/work">
            Open work queue <ArrowRight size={16} />
          </Link>
        </div>
        <div className="banner-diagram">
          <div>
            <FileText size={22} />
            <span>What we agreed</span>
          </div>
          <span className="diagram-line" />
          <div>
            <CheckCheck size={22} />
            <span>What happened</span>
          </div>
          <span className="diagram-line" />
          <div>
            <ShieldCheck size={22} />
            <span>What’s supported</span>
          </div>
        </div>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Active work items"
          value={snapshot.cases.filter((c) => c.state !== "POSTED").length}
          detail="Persistent financial workflows"
          icon={ListTodo}
        />
        <Metric
          label="Investigating"
          value={
            snapshot.cases.filter((c) => c.state === "INVESTIGATING").length
          }
          detail="Live backend state"
          icon={Sparkles}
        />
        <Metric
          label="Matched invoices"
          value={
            snapshot.cases.filter((c) => c.result?.disposition === "matched")
              .length
          }
          detail="Supported by signed terms"
          icon={CheckCheck}
        />
        <Metric
          label="Needs information"
          value={snapshot.cases.filter((c) => c.state === "NEEDS_INFO").length}
          detail="Safely waiting for evidence"
          icon={CircleHelp}
        />
      </div>
      <div className="overview-columns">
        <Panel
          title="Needs attention"
          meta={
            <Link href="/work">
              View all <ArrowUpRight size={13} />
            </Link>
          }
        >
          {snapshot.cases
            .filter((c) =>
              ["PROPOSED", "NEEDS_INFO", "FAILED_RETRYABLE"].includes(c.state),
            )
            .map((c) => (
              <Link
                className="attention-row"
                href={`/work/${c._id}`}
                key={c._id}
              >
                <div className="vendor-avatar">
                  {c.input.vendor.slice(0, 1)}
                </div>
                <div>
                  <strong>{c.input.vendor}</strong>
                  <p>{c.phase}</p>
                </div>
                <Status state={c.state} />
                <ChevronRight size={16} />
              </Link>
            ))}
        </Panel>
        <Panel
          title="Autonomous activity"
          meta={
            <span className="live-caption">
              <span className="live-dot" /> Live
            </span>
          }
        >
          <Activity events={snapshot.audit.slice(0, 7)} compact />
        </Panel>
      </div>
    </>
  );
}
function Approvals({ snapshot }: { snapshot: Snapshot }) {
  const pending = snapshot.cases.filter(
    (c) => c.state === "PROPOSED" || c.state === "APPROVED",
  );
  return (
    <>
      <SectionTitle
        eyebrow="HUMAN OVERSIGHT"
        title="Approvals"
        description="Review the evidence. Understand the impact. Authorize the next step."
      />
      <Notice>
        Approving a dispute does not mean the vendor accepted it. Posting
        requires its own supported proposal and authorization.
      </Notice>
      <div className="approval-grid">
        {pending.map((c) => (
          <Panel key={c._id}>
            <div className="approval-card">
              <div className="row-between">
                <span className="mono muted">{c.input.code}</span>
                <Status state={c.state} />
              </div>
              <h2>{c.input.vendor}</h2>
              <p>{c.phase}</p>
              <div className="approval-amounts">
                <div>
                  <small>Invoiced</small>
                  <strong>{money(c.result?.invoiceCents)}</strong>
                </div>
                <div>
                  <small>Supported</small>
                  <strong>{money(c.result?.expectedCents)}</strong>
                </div>
                <div>
                  <small>Difference</small>
                  <strong className="amount-amber">
                    {money(c.result?.differenceCents)}
                  </strong>
                </div>
              </div>
              <div className="approval-evidence">
                <ShieldCheck size={15} />
                {c.result?.evidenceIds.length ?? 0} source references ·{" "}
                {c.resolution ? "Controller" : "Human reviewer"} required
              </div>
              <Button asChild variant="outline">
                <Link href={`/work/${c._id}`}>
                  Review evidence and action
                  <ArrowRight size={15} />
                </Link>
              </Button>
            </div>
          </Panel>
        ))}
      </div>
      {!pending.length && (
        <Empty title="No approvals waiting">
          New supported proposals will appear here automatically.
        </Empty>
      )}
    </>
  );
}
function Contracts({ snapshot }: { snapshot: Snapshot }) {
  return (
    <>
      <SectionTitle
        eyebrow="SYSTEMS OF RECORD"
        title="Contract library"
        description="Original commitments, signed amendments, and the work they inform."
      />
      <Panel>
        <div className="table-scroll">
          <table className="work-table">
            <thead>
              <tr>
                <th>Agreement</th>
                <th>Vendor</th>
                <th>Service dates</th>
                <th>Versions</th>
                <th>Evidence status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snapshot.cases.map((c) => (
                <tr key={c._id}>
                  <td>
                    <strong>{c.input.contractId}</strong>
                    <small className="cell-sub">Team accommodation</small>
                  </td>
                  <td>{c.input.vendor}</td>
                  <td>{shortDate(c.input.start)}</td>
                  <td>
                    {
                      c.input.sources.filter(
                        (s) => s.kind === "contract" || s.kind === "amendment",
                      ).length
                    }{" "}
                    source documents
                  </td>
                  <td>
                    {c.input.terms.every((t) =>
                      c.input.sources.some(
                        (s) => s.id === t.sourceId && s.signed,
                      ),
                    ) ? (
                      <span className="matched-mini">
                        <Check size={12} /> Signed evidence
                      </span>
                    ) : (
                      <Status state="NEEDS_INFO" />
                    )}
                  </td>
                  <td>
                    <Link href={`/work/${c._id}`}>
                      Open <ArrowUpRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
function AuditPage({ snapshot }: { snapshot: Snapshot }) {
  const [filter, setFilter] = useState("all");
  const events = snapshot.audit.filter(
    (e) =>
      filter === "all" ||
      (filter === "denied" && !e.allowed) ||
      e.caseId === filter,
  );
  return (
    <>
      <SectionTitle
        eyebrow="ACCOUNTABILITY"
        title="Audit trail"
        description="Who acted, what changed, and which evidence supported the decision."
      />
      <div className="audit-layout">
        <Panel
          title="Financial event history"
          meta={
            <select
              aria-label="Filter audit events"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All activity</option>
              <option value="denied">Denied actions</option>
              {snapshot.cases.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.input.code}
                </option>
              ))}
            </select>
          }
        >
          <Activity events={events} />
          {!events.length && <Empty title="No matching events" />}
        </Panel>
        <Panel title="Reconstruct a decision">
          <div className="panel-body">
            <p className="muted">
              Open a case to inspect the exact sources, calculations, policy
              version, approvals, and journal entries saved at the time.
            </p>
            {snapshot.cases.map((c) => (
              <Link
                className="decision-link"
                key={c._id}
                href={`/work/${c._id}?tab=audit`}
              >
                <FileText size={17} />
                <div>
                  <strong>{c.input.code}</strong>
                  <small>{c.input.vendor}</small>
                </div>
                <ArrowUpRight size={15} />
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
function Policies({
  snapshot,
  notify,
}: {
  snapshot: Snapshot;
  notify: Notify;
}) {
  const propose = useMutation(api.policies.propose);
  const activate = useMutation(api.policies.activate);
  const inject = useMutation(api.workspace.inject);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ message: string; ok: boolean }>) => {
    setBusy(true);
    try {
      const r = await fn();
      notify(r.message, r.ok);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Request failed", false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle
        eyebrow="INSTITUTIONAL MEMORY"
        title="Policies & precedents"
        description="A pattern is a proposal. Only an authorized decision makes it policy."
        action={
          <Button disabled={busy} onClick={() => void run(() => propose({}))}>
            <Sparkles size={15} />
            Learn from history
          </Button>
        }
      />
      <Notice>
        Policy learning is scoped to evidence retrieval. It cannot invent rates,
        override signed contracts, or grant approval authority.
      </Notice>
      {snapshot.policyRuns
        .filter((j) => j.status !== "completed")
        .map((j) => (
          <Notice key={j._id}>
            {j.status === "failed"
              ? `Policy investigation failed: ${j.error}`
              : "Policy investigation running…"}
          </Notice>
        ))}
      <div className="policies-layout">
        <div>
          {snapshot.policies.map((p) => (
            <Panel key={p._id} className="policy-panel">
              <div className="panel-body">
                <div className="row-between">
                  <span className="eyebrow">
                    VERSION {p.version} · {p.vendor}
                  </span>
                  <Status state={p.status} />
                </div>
                <h2>{p.title}</h2>
                <p>{p.description}</p>
                <div className="policy-origin">{p.origin}</div>
                {p.precedentIds.length > 0 && (
                  <div className="evidence-chips">
                    {p.precedentIds.map((id) => (
                      <span key={id}>{id}</span>
                    ))}
                  </div>
                )}
                {p.checks.length > 0 && (
                  <div className="policy-checks">
                    {p.checks.map((c) => (
                      <div key={c.name}>
                        <Check
                          size={13}
                          className={c.passed ? "green" : "red"}
                        />
                        {c.name}
                        <span>{c.passed ? "Passed" : "Failed"}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="row-between policy-footer">
                  <small className="muted">
                    {p.approvedBy
                      ? `Approved · ${p.approvedBy.startsWith("Synthetic") ? p.approvedBy : "Simulation controller"}`
                      : "Inactive until controller approval"}
                  </small>
                  {p.status === "candidate" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void run(() => activate({ id: p._id }))}
                    >
                      Approve policy
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
        <div>
          <Panel title="Historical accountant decisions">
            <div className="panel-body">
              {snapshot.precedents.map((p) => (
                <article className="precedent" key={p._id}>
                  <div className="row-between">
                    <span className="mono">{p.code}</span>
                    {!p.active && (
                      <span className="status status-red">Expired</span>
                    )}
                  </div>
                  <h3>{p.title}</h3>
                  <p>{p.explanation}</p>
                  <small>
                    {shortDate(p.date)} · Historical synthetic record
                  </small>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Try the evidence procedure">
            <div className="panel-body">
              <p className="muted">
                Create a Meridian block-extension case. Compare review
                requirements before and after a scoped policy correction.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const input = hotelFixture(
                    `INV-MEM-${Date.now().toString(36).toUpperCase()}`,
                  );
                  input.sources[1].title =
                    "Block extension · signed room schedule";
                  void inject({ input })
                    .then((id) => router.push(`/work/${id}`))
                    .catch((e) => notify(e.message, false));
                }}
              >
                Create learning case
                <ArrowRight size={14} />
              </Button>
              <p className="small muted">
                When asked, a controller can cite AMD-HOTEL-001 in their answer,
                then propose an improvement from that case.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
type EvaluationReport = {
  generatedAt: string;
  revision: string;
  total: number;
  passed: number;
  failed: number;
  tests: { name: string; status: string; duration: number }[];
};
function Evaluation() {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  useEffect(() => {
    void fetch("/evaluation.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .catch(() => setReport(null));
  }, []);
  return (
    <>
      <SectionTitle
        eyebrow="EVIDENCE, NOT ASSURANCES"
        title="Evaluation & trust"
        description="Executed tests against planted cases with known outcomes."
      />
      <Notice>
        Deterministic and backend tests validate software behavior. Live CREAO
        accuracy is reported separately only after actual provider execution.
      </Notice>
      {report ? (
        <>
          <div className="metrics-grid">
            <Metric
              label="Executed tests"
              value={report.total}
              detail="Actual Vitest results"
              icon={FlaskConical}
            />
            <Metric
              label="Passed"
              value={report.passed}
              detail="Assertions satisfied"
              icon={CheckCheck}
            />
            <Metric
              label="Failed"
              value={report.failed}
              detail="Failures are never hidden"
              icon={ShieldCheck}
            />
            <Metric
              label="Live CREAO benchmark"
              value="Not run"
              detail="Requires configured provider"
              icon={Sparkles}
            />
          </div>
          <Panel
            title="Test matrix"
            meta={
              <small className="muted">
                {new Date(report.generatedAt).toLocaleString()}
              </small>
            }
          >
            <div className="table-scroll">
              <table className="work-table">
                <thead>
                  <tr>
                    <th>Scenario / assertion</th>
                    <th>Observed result</th>
                    <th className="numeric">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tests.map((t, i) => (
                    <tr key={i}>
                      <td>{t.name}</td>
                      <td>
                        <span
                          className={`status ${t.status === "passed" ? "status-green" : "status-red"}`}
                        >
                          <span className="status-dot" />
                          {t.status}
                        </span>
                      </td>
                      <td className="numeric muted">
                        {Math.round(t.duration)} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              Code revision: {report.revision}
              <span>Reproduce with npm run test:report</span>
            </div>
          </Panel>
        </>
      ) : (
        <Empty title="Evaluation has not been executed yet">
          Run npm run test:report to generate real test results. No results are
          fabricated.
        </Empty>
      )}
    </>
  );
}
function Integrations({
  snapshot,
  notify,
}: {
  snapshot: Snapshot;
  notify: Notify;
}) {
  const providers = useQuery(api.investigations.providers);
  const setMode = useMutation(api.workspace.setMode);
  return (
    <>
      <SectionTitle
        eyebrow="SYSTEM CONNECTIONS"
        title="Integrations"
        description="Provider configuration and observed runtime status."
      />
      <div className="integrations-grid">
        {[
          {
            name: "Convex",
            label: "Authoritative backend",
            description:
              "Persistent work, live updates, permission checks, and immutable financial history.",
            status: "Connected",
            ready: true,
          },
          {
            name: "CREAO AI",
            label: "Contract investigator",
            description:
              "Asynchronous evidence-based contract interpretation. Financial execution remains behind the gateway.",
            status: providers?.creao
              ? providers.hasCompletedRun
                ? "Run completed · validation recorded"
                : "Configured · execution not yet verified"
              : "Not configured",
            ready: !!providers?.creao,
          },
          {
            name: "Moss",
            label: "Historical retrieval",
            description:
              "Optional semantic retrieval. Current investigations use structured Convex evidence lookup.",
            status: "Not implemented",
            ready: false,
          },
        ].map((i) => (
          <Panel key={i.name}>
            <div className="integration-card">
              <div className="row-between">
                <div className="integration-logo">{i.name.slice(0, 1)}</div>
                <span
                  className={`status ${i.ready ? "status-green" : "status-neutral"}`}
                >
                  {i.status}
                </span>
              </div>
              <h2>{i.name}</h2>
              <small>{i.label}</small>
              <p>{i.description}</p>
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="Investigation mode">
        <div className="panel-body">
          <p className="muted">
            This setting applies to newly created cases. Existing records retain
            the mode in which they were investigated.
          </p>
          <div className="mode-options">
            {(["deterministic", "creao"] as const).map((mode) => (
              <button
                key={mode}
                className={cn(
                  "mode-option",
                  snapshot.sandbox.mode === mode && "selected",
                )}
                onClick={() =>
                  void setMode({ mode })
                    .then((r) => notify(r.message, r.ok))
                    .catch((e) => notify(e.message, false))
                }
              >
                <span className="radio-dot" />
                <div>
                  <strong>
                    {mode === "deterministic"
                      ? "Deterministic simulation"
                      : "Live CREAO investigation"}
                  </strong>
                  <p>
                    {mode === "deterministic"
                      ? "Runs the real finance engine on structured synthetic evidence. No AI execution is claimed."
                      : "Requires CREAO_API_KEY and CREAO_AGENT_ID in the Convex backend."}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <Notice>
            Paste credentials into <code>.env.integrations.local</code>, then
            run <code>npm run configure:integrations</code>. Secrets never
            belong in NEXT_PUBLIC variables.
          </Notice>
        </div>
      </Panel>
    </>
  );
}
function ScenarioDialog({
  open,
  close,
  notify,
}: {
  open: boolean;
  close: () => void;
  notify: Notify;
}) {
  const inject = useMutation(api.workspace.inject);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    base: 30,
    baseRate: 240,
    extra: 20,
    rate: 265,
    invoiceRate: 265,
    effective: "2027-02-12",
    scope: "additional",
    evidence: true,
  });
  const field = (
    name: "base" | "baseRate" | "extra" | "rate" | "invoiceRate",
    label: string,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min={name.includes("Rate") || name === "rate" ? 0 : 1}
        step={name.includes("Rate") || name === "rate" ? "0.01" : "1"}
        value={values[name]}
        onChange={(e) =>
          setValues({ ...values, [name]: Number(e.target.value) })
        }
      />
    </label>
  );
  const submit = async () => {
    setBusy(true);
    try {
      const input = hotelFixture(
        `INV-SIM-${Date.now().toString(36).toUpperCase()}`,
      );
      const [base, additional] = input.terms;
      base.quantity = values.base;
      base.rateCents = Math.round(values.baseRate * 100);
      additional.quantity = values.extra;
      additional.rateCents = Math.round(values.rate * 100);
      additional.start = values.effective;
      input.service.quantity = values.base + values.extra;
      input.lines = [
        {
          label: "Team accommodation",
          quantity: input.service.quantity,
          rateCents: Math.round(values.invoiceRate * 100),
        },
      ];
      input.sources[0].text = `Signed agreement: ${values.base} room-nights at $${values.baseRate.toFixed(2)} for February 12–14, 2027. Original rates remain unless expressly superseded.`;
      input.sources[1].text = `Effective ${values.effective}: add ${values.extra} room-nights at $${values.rate.toFixed(2)}. ${values.scope === "supersede" ? "Explicitly supersede all original and additional rates with this rate." : "Original room-nights retain their prior rate."}`;
      input.sources[2].text = `Confirmed delivery of ${input.service.quantity} room-nights. No incidentals included.`;
      input.sources[3].text = `Invoice: ${input.service.quantity} room-nights at $${values.invoiceRate.toFixed(2)}.`;
      if (values.scope === "supersede")
        input.terms.push({
          ...additional,
          id: "TERM-SUPERSEDE",
          scope: "supersede",
          supersedes: [base.id, additional.id],
        });
      if (!values.evidence)
        input.sources = input.sources.filter((s) => s.kind !== "amendment");
      const id = await inject({ input });
      close();
      router.push(`/work/${id}`);
      notify("Source records saved. Investigation started automatically.");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not create scenario.",
        false,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && close()}
      title="Create a financial scenario"
      description="Create new synthetic source records and run the actual investigation workflow."
    >
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-grid">
          {field("base", "Original room-nights")}
          {field("baseRate", "Original rate · USD")}
          {field("extra", "Additional room-nights")}
          {field("rate", "Amended rate · USD")}
          {field("invoiceRate", "Invoiced rate · USD")}
          <label>
            Amendment effective date
            <input
              type="date"
              value={values.effective}
              onChange={(e) =>
                setValues({ ...values, effective: e.target.value })
              }
            />
          </label>
        </div>
        <label className="form-label">
          Amendment scope
          <select
            value={values.scope}
            onChange={(e) => setValues({ ...values, scope: e.target.value })}
          >
            <option value="additional">Additional rooms only</option>
            <option value="supersede">Explicitly replace all rates</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={values.evidence}
            onChange={(e) =>
              setValues({ ...values, evidence: e.target.checked })
            }
          />{" "}
          Include signed amendment evidence
        </label>
        <Notice>
          Service dates remain February 12–14, 2027. Each scenario receives a
          new source identifier.
        </Notice>
        <div className="dialog-actions">
          <Button variant="outline" type="button" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            {busy ? "Creating…" : "Create & investigate"}
            <ArrowRight size={14} />
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
