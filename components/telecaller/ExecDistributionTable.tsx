import React, { useMemo, useState } from 'react';
import { ago } from '../../lib/format';
import {
  ACTIVITY_PERIODS, ACTIVITY_PERIOD_LABEL, ActivityPeriod, ExecWorkflow, WorkflowSummary,
  inActivityPeriod, leadFlows, referenceNow, workflowSummary,
} from '../../lib/leadWorkflow';
import type { TrackerState } from '../../lib/trackerOps';

interface Props {
  summary: WorkflowSummary;
  /** The tracker data the summary was worked out from; needed to count calls for one period. Without it, no filter. */
  state?: TrackerState;
  /** Click an executive row to show their leads below. */
  onSelectExec?: (id: number) => void;
}

/** Executives per page; the Team total always stays pinned below, outside the paging. */
const PAGE_SIZE = 3;

/**
 * Executive-wise distribution and progress — assigned/called/report numbers per
 * calling executive, worked out from the shared tracker data (the same data the
 * executives and the manager see), plus a team total. The executive rows are
 * paged (PAGE_SIZE at a time); the Team total is always shown.
 *
 * The period filter (today / this week / this month) narrows every column to the period: calls, outcomes, reports and
 * last call count the calls made in it, and assigned / not called / progress count the leads assigned in it.
 */
export default function ExecDistributionTable({ summary, state, onSelectExec }: Props) {
  const [period, setPeriod] = useState<ActivityPeriod>('all');

  // The table for one period: calls, outcomes and reports count only the calls made in it; assigned counts the leads
  // handed to each executive in it, with not called and progress for those leads (called at any time since).
  const periodRows = useMemo<ExecWorkflow[] | null>(() => {
    if (!state || period === 'all') return null;
    const now = referenceNow(state);
    const inPeriod = workflowSummary({ ...state, activities: state.activities.filter(a => inActivityPeriod(a.created_at, period, now)) });
    const byId = new Map(inPeriod.execs.map(e => [e.id, e]));
    const assignedInPeriod = leadFlows(state).filter(f => inActivityPeriod(f.assignedAt, period, now));
    return summary.execs.map(e => {
      const p = byId.get(e.id) ?? e;
      const mine = assignedInPeriod.filter(f => f.lead.assigned_to === e.id);
      const called = mine.filter(f => f.status !== 'not_called').length;
      return {
        ...p, active: e.active, assigned: mine.length, called, notCalled: mine.length - called,
        progressPct: mine.length === 0 ? 0 : Math.round((called / mine.length) * 100),
      };
    });
  }, [state, period, summary]);

  // The same executives in every period (those active or holding leads), so rows do not come and go with the filter.
  const listed = new Set(summary.execs.filter(e => e.active || e.assigned > 0).map(e => e.id));
  const execRows = (periodRows ?? summary.execs).filter(e => listed.has(e.id));
  const pageCount = Math.max(1, Math.ceil(execRows.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const shown = execRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const total = (pick: (e: ExecWorkflow) => number) => execRows.reduce((n, e) => n + pick(e), 0);
  // All time keeps the summary's own team figures (they also count calls by executives no longer listed).
  const team = periodRows
    ? { assigned: total(e => e.assigned), notCalled: total(e => e.notCalled), calls: total(e => e.calls), awaiting: total(e => e.awaiting), verified: total(e => e.verified), returned: total(e => e.returned) }
    : { assigned: summary.distributed, notCalled: summary.notCalled, calls: summary.completedCalls, awaiting: summary.awaitingVerification, verified: summary.verified, returned: summary.returned };
  const noCallsText = period === 'all' ? 'No calls yet' : `No calls ${ACTIVITY_PERIOD_LABEL[period].toLowerCase()}`;
  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 14px 4px' }}>
        <div>
          <div id="exec-dist-title" style={{ fontWeight: 600 }}>Executive-wise distribution and progress</div>
          {period !== 'all' && (
            <div className="loc">Leads assigned and calls made {ACTIVITY_PERIOD_LABEL[period].toLowerCase()}.</div>
          )}
        </div>
        {state && (
          <div className="filters" role="group" aria-label="Period">
            {ACTIVITY_PERIODS.map(p => (
              <button key={p} type="button" className={`filter-chip ${period === p ? 'active' : ''}`} aria-pressed={period === p}
                onClick={() => { setPeriod(p); setPage(0); }}>
                {ACTIVITY_PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table aria-labelledby="exec-dist-title">
          <thead>
            <tr>
              <th>Executive</th><th className="num-col">Assigned</th><th className="num-col">Not called</th><th>Progress</th>
              <th className="num-col">Calls</th><th className="num-col">Connected</th><th className="num-col">Not connected</th>
              <th className="num-col">Wrong no.</th><th className="num-col">Not interested</th>
              <th className="num-col">Reports sent</th><th className="num-col">To verify</th><th className="num-col">Verified</th><th className="num-col">Returned</th><th>Last call</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(e => (
              <tr
                key={e.id}
                style={onSelectExec ? { cursor: 'pointer' } : undefined}
                onClick={onSelectExec ? () => onSelectExec(e.id) : undefined}
                title={onSelectExec ? "Show this executive's leads below" : undefined}
              >
                <td className="cust">{e.name}{!e.active && <div className="loc">Inactive</div>}</td>
                <td className="num-col strong">{e.assigned}</td>
                <td className="num-col">{e.notCalled > 0 ? <span className="text-warn">{e.notCalled}</span> : 0}</td>
                <td style={{ minWidth: 110 }}>
                  <div style={{ background: 'var(--line)', borderRadius: 4, height: 6 }}><div style={{ width: `${e.progressPct}%`, height: 6, borderRadius: 4, background: 'var(--leaf)' }} /></div>
                  <div className="loc">{e.assigned === 0 && periodRows ? 'No new leads' : `${e.progressPct}% called`}</div>
                </td>
                <td className="num-col">{e.calls}</td>
                <td className="num-col">{e.connected}</td>
                <td className="num-col">{e.notConnected}</td>
                <td className="num-col">{e.wrongNumber}</td>
                <td className="num-col">{e.notInterested}</td>
                <td className="num-col">{e.calls}</td>
                <td className="num-col">{e.awaiting > 0 ? <span className="text-warn">{e.awaiting}</span> : 0}</td>
                <td className="num-col">{e.verified}</td>
                <td className="num-col">{e.returned > 0 ? <span className="text-warn">{e.returned}</span> : 0}</td>
                <td>{e.lastCallAt ? <span className="loc">{ago(e.lastCallAt)}</span> : <span className="loc">{noCallsText}</span>}</td>
              </tr>
            ))}
            <tr>
              <td className="strong">Team</td>
              <td className="num-col strong">{team.assigned}</td>
              <td className="num-col strong">{team.notCalled}</td>
              <td />
              <td className="num-col strong">{team.calls}</td>
              <td className="num-col strong">{execRows.reduce((n, e) => n + e.connected, 0)}</td>
              <td className="num-col strong">{execRows.reduce((n, e) => n + e.notConnected, 0)}</td>
              <td className="num-col strong">{execRows.reduce((n, e) => n + e.wrongNumber, 0)}</td>
              <td className="num-col strong">{execRows.reduce((n, e) => n + e.notInterested, 0)}</td>
              <td className="num-col strong">{team.calls}</td>
              <td className="num-col strong">{team.awaiting}</td>
              <td className="num-col strong">{team.verified}</td>
              <td className="num-col strong">{team.returned}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="pager">
          <span className="loc">{execRows.length} executives · showing {safePage * PAGE_SIZE + 1}–{Math.min(execRows.length, safePage * PAGE_SIZE + PAGE_SIZE)}</span>
          <div className="pager-btns exec-pages">
            <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">‹</button>
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                className={`btn-small ${i === safePage ? 'btn-primary' : 'btn-secondary'}`}
                aria-current={i === safePage ? 'page' : undefined}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
            <button className="btn-secondary btn-small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">›</button>
          </div>
        </div>
      )}
    </div>
  );
}
