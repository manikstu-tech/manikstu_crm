import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Info, PhoneCall, Share2, Upload, Users } from 'lucide-react';
import type { TrackerState } from '../../lib/trackerOps';
import { WORKFLOW_CHIP, WORKFLOW_LABEL, WorkflowAlert, WorkflowStatus, leadFlows, workflowSummary } from '../../lib/leadWorkflow';
import { ago, shortDateTime } from '../../lib/format';
import { callerName, verticalName } from '../telecaller/tcData';
import { StatusChip } from '../telecaller/shared';
import CardTable from '../CardTable';

// Lead distribution and workflow tracking, for the telecalling head and the manager. Everything here is
// worked out from the shared tracker data, so it matches what the calling executives see on their screens.

const LEVEL_CHIP: Record<WorkflowAlert['level'], string> = { critical: 'pending', warning: 'pending', info: 'transit' };
const PAGE_SIZE = 15;

interface Props {
  data: TrackerState;
  audience: 'head' | 'manager';
  /** The head spreads the leads nobody has called yet evenly across the active executives. */
  onDistribute?: () => void | Promise<void>;
  /** Jump to the call-reports page. */
  onOpenReports?: () => void;
  searchQuery?: string;
}

export default function WorkflowBoard({ data, audience, onDistribute, onOpenReports, searchQuery = '' }: Props) {
  const summary = useMemo(() => workflowSummary(data), [data]);
  const flows = useMemo(() => leadFlows(data), [data]);

  const [status, setStatus] = useState<WorkflowStatus | 'all' | 'attention'>('all');
  const [exec, setExec] = useState<number | 'all'>('all');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  const q = searchQuery.trim().toLowerCase();
  const rows = flows
    .filter(f => (exec === 'all' || f.lead.assigned_to === exec))
    .filter(f => status === 'all' ? true : status === 'attention' ? f.attention : f.status === status)
    .filter(f => !q || [f.lead.customer_name, f.lead.phone, callerName(f.lead.assigned_to)].some(v => v.toLowerCase().includes(q)))
    // what needs a look first, then the longest-waiting
    .sort((a, b) => Number(b.attention) - Number(a.attention) || (b.waitingHours ?? -1) - (a.waitingHours ?? -1) || b.lead.id - a.lead.id);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const count = (s: WorkflowStatus) => flows.filter(f => f.status === s).length;

  const distribute = async () => {
    if (!onDistribute || busy) return;
    if (!window.confirm(`Spread the ${summary.notCalled} uncalled leads evenly across the active executives? Leads already being worked stay where they are.`)) return;
    setBusy(true);
    try { await onDistribute(); } finally { setBusy(false); }
  };

  const execRows = summary.execs.filter(e => e.active || e.assigned > 0);

  return (
    <>
      <div className="scoreboard">
        <div className="score"><div className="num"><Upload size={16} /> {summary.imported}</div><div className="label">Leads imported</div></div>
        <div className="score"><div className="num"><Share2 size={16} /> {summary.distributed}{summary.withoutOwner > 0 && <small className="warn">{summary.withoutOwner} unassigned or inactive</small>}</div><div className="label">Distributed to executives</div></div>
        <div className="score"><div className="num"><Users size={16} /> {summary.notCalled}</div><div className="label">Pending · not called yet</div></div>
        <div className="score"><div className="num"><PhoneCall size={16} /> {summary.completedCalls}</div><div className="label">Calls completed</div></div>
        <div className="score"><div className="num"><ClipboardCheck size={16} /> {summary.reportsSubmitted}</div><div className="label">Reports submitted</div></div>
        <div className="score"><div className="num">{summary.awaitingVerification}</div><div className="label">Awaiting verification</div></div>
        <div className="score"><div className="num"><CheckCircle2 size={16} /> {summary.verified}</div><div className="label">Reports verified</div></div>
        <div className="score"><div className="num">{summary.returned}{summary.returned > 0 && <small className="warn">to correct</small>}</div><div className="label">Reports sent back</div></div>
      </div>

      {/* Highlights: pending assignments and reports */}
      <div className="panel">
        <div className="panel-head" style={{ padding: '14px 18px 4px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Needs attention</h2>
          <span className="panel-meta">{summary.alerts.length === 0 ? 'All caught up' : `${summary.alerts.length} item${summary.alerts.length === 1 ? '' : 's'}`}</span>
          <span style={{ flex: 1 }} />
          {audience === 'head' && onOpenReports && summary.awaitingVerification > 0 && (
            <button className="btn-secondary btn-small" onClick={onOpenReports}>Verify {summary.awaitingVerification} report{summary.awaitingVerification === 1 ? '' : 's'}</button>
          )}
          {audience === 'head' && onDistribute && (
            <button className="btn-primary btn-small" disabled={busy || summary.notCalled === 0} onClick={distribute}>
              <Share2 size={14} /> {busy ? 'Distributing…' : 'Distribute uncalled leads evenly'}
            </button>
          )}
        </div>
        <ul className="attn-list" style={{ padding: '4px 18px 14px' }}>
          {summary.alerts.length === 0 && <li><div className="action">No pending assignments or reports. Every lead is with an executive and every report is up to date.</div></li>}
          {summary.alerts.map(a => (
            <li key={a.key}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {a.level === 'info' ? <Info size={15} /> : <AlertTriangle size={15} />}
                <div className="action">{a.text}</div>
              </div>
              <div className="attn-side"><span className={`chip ${LEVEL_CHIP[a.level]}`}>{a.owner === 'head' ? 'Telecalling head' : 'Executive'}</span></div>
            </li>
          ))}
        </ul>
      </div>

      {/* Lead-by-lead workflow status */}
      <h3 style={{ margin: '22px 4px 8px' }}>Lead workflow status</h3>
      <div className="filter-row one-line filter-row-mobile">
        <select className="filter-select" value={status} onChange={e => { setStatus(e.target.value as WorkflowStatus | 'all' | 'attention'); setPage(0); }} aria-label="Workflow status">
          <option value="all">All leads ({flows.length})</option>
          <option value="attention">Needs attention ({flows.filter(f => f.attention).length})</option>
          {(Object.keys(WORKFLOW_LABEL) as WorkflowStatus[]).map(s => <option key={s} value={s}>{WORKFLOW_LABEL[s]} ({count(s)})</option>)}
        </select>
        <select className="filter-select" value={exec} onChange={e => { setExec(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(0); }} aria-label="Executive">
          <option value="all">All executives</option>
          {execRows.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {(status !== 'all' || exec !== 'all') && (
          <button className="link-btn clear-alert" onClick={() => { setStatus('all'); setExec('all'); setPage(0); }}>Clear filters</button>
        )}
      </div>

      <div className="panel">
        <CardTable>
          <table>
            <thead>
              <tr><th>Lead</th><th>Product</th><th>Assigned to</th><th>Assigned</th><th>Last call</th><th>Workflow status</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 0' }}>No leads match these filters.</td></tr>}
              {shown.map(f => (
                <tr key={f.lead.id} className={f.attention ? 'fu-row-overdue' : undefined}>
                  <td className="cust">{f.lead.customer_name}<div className="loc">{f.lead.phone} · {f.lead.source}</div></td>
                  <td>{verticalName(f.lead.vertical_id)}</td>
                  <td>{callerName(f.lead.assigned_to)}</td>
                  <td>
                    {shortDateTime(f.assignedAt)}
                    {f.assignedBy && <div className="loc">by {f.assignedBy}</div>}
                    {f.waitingHours !== null && f.waitingHours >= 24 && <div className="text-warn loc">waiting {Math.floor(f.waitingHours / 24)}d</div>}
                  </td>
                  <td>
                    {f.last ? <><StatusChip status={f.last.outcome} /><div className="loc">{ago(f.last.created_at)} · {f.calls.length} call{f.calls.length === 1 ? '' : 's'}</div></> : <span className="loc">Not called</span>}
                  </td>
                  <td><span className={`chip ${WORKFLOW_CHIP[f.status]}`}>{WORKFLOW_LABEL[f.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
        {rows.length > PAGE_SIZE && (
          <div className="pager">
            <span>{safePage * PAGE_SIZE + 1}–{Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of {rows.length} leads</span>
            <div className="pager-btns">
              <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
              <button className="btn-secondary btn-small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
