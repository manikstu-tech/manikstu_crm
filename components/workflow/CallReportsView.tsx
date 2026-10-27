import React, { useMemo, useState } from 'react';
import type { CallOutcome, LeadActivity, ReportStatus } from '../../data/managerDashboard';
import type { TrackerState } from '../../lib/trackerOps';
import { REPORT_CHIP, REPORT_LABEL, reportStatusOf } from '../../lib/leadWorkflow';
import { fmtDuration, OUTCOMES, callerName, stageName } from '../telecaller/tcData';
import { shortDate, shortDateTime } from '../../lib/format';
import { StatusChip } from '../telecaller/shared';
import Modal from '../Modal';
import CardTable from '../CardTable';

// Every call is also a call report: the call status, the customer's response, remarks and the follow-up
// booked. The telecalling head verifies them here (or sends one back with a reason); the manager sees the same
// list read-only to keep an eye on the team.

const PAGE_SIZE = 15;

interface Props {
  data: TrackerState;
  /** The head can verify or return reports; the manager only watches. */
  canVerify: boolean;
  onVerify?: (activityIds: number[], decision: 'verified' | 'returned', note?: string) => Promise<void>;
  searchQuery?: string;
}

export default function CallReportsView({ data, canVerify, onVerify, searchQuery = '' }: Props) {
  const [status, setStatus] = useState<ReportStatus | 'all'>(canVerify ? 'submitted' : 'all');
  const [exec, setExec] = useState<number | 'all'>('all');
  const [outcome, setOutcome] = useState<CallOutcome | 'all'>('all');
  const [picked, setPicked] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState<number[] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const leadOf = useMemo(() => new Map(data.leads.map(l => [l.id, l])), [data.leads]);
  const q = searchQuery.trim().toLowerCase();
  const counts = useMemo(() => {
    const c = { submitted: 0, verified: 0, returned: 0 } as Record<ReportStatus, number>;
    data.activities.forEach(a => { c[reportStatusOf(a)]++; });
    return c;
  }, [data.activities]);

  const rows = data.activities
    .filter(a => status === 'all' || reportStatusOf(a) === status)
    .filter(a => exec === 'all' || a.caller_id === exec)
    .filter(a => outcome === 'all' || a.outcome === outcome)
    .filter(a => {
      if (!q) return true;
      const l = leadOf.get(a.lead_id);
      return [l?.customer_name ?? '', l?.phone ?? '', callerName(a.caller_id), a.note].some(v => v.toLowerCase().includes(q));
    })
    // waiting for verification first, then newest
    .sort((a, b) => Number(reportStatusOf(b) === 'submitted') - Number(reportStatusOf(a) === 'submitted') || b.created_at.localeCompare(a.created_at));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const verifiable = (a: LeadActivity) => reportStatusOf(a) === 'submitted';
  const pickedNow = picked.filter(id => rows.some(a => a.id === id && verifiable(a)));
  const executives = Array.from(new Set(data.activities.map(a => a.caller_id)));

  const run = async (ids: number[], decision: 'verified' | 'returned', note?: string) => {
    if (!onVerify) return;
    setBusy(true);
    setError(null);
    try {
      await onVerify(ids, decision, note);
      setPicked(p => p.filter(id => !ids.includes(id)));
      setReturning(null);
      setReason('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="scoreboard cr-board">
        <div className="score"><div className="num">{counts.submitted}</div><div className="label">Awaiting verification</div></div>
        <div className="score"><div className="num">{counts.verified}</div><div className="label">Verified</div></div>
        <div className="score"><div className="num">{counts.returned}{counts.returned > 0 && <small className="warn">with executives</small>}</div><div className="label">Sent back to correct</div></div>
        <div className="score"><div className="num">{data.activities.length}</div><div className="label">Reports in total</div></div>
      </div>

      <div className="filter-row one-line cr-filters">
        <select className="filter-select" value={status} onChange={e => { setStatus(e.target.value as ReportStatus | 'all'); setPage(0); }} aria-label="Report status">
          <option value="all">All reports ({data.activities.length})</option>
          {(['submitted', 'returned', 'verified'] as ReportStatus[]).map(s => <option key={s} value={s}>{s === 'submitted' ? 'Awaiting verification' : REPORT_LABEL[s]} ({counts[s]})</option>)}
        </select>
        <select className="filter-select" value={exec} onChange={e => { setExec(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(0); }} aria-label="Executive">
          <option value="all">All executives</option>
          {executives.map(id => <option key={id} value={id}>{callerName(id)}</option>)}
        </select>
        <select className="filter-select" value={outcome} onChange={e => { setOutcome(e.target.value as CallOutcome | 'all'); setPage(0); }} aria-label="Call status">
          <option value="all">Any call status</option>
          {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {canVerify && (
          <button className="btn-primary btn-small" disabled={busy || pickedNow.length === 0} onClick={() => run(pickedNow, 'verified')}>
            Verify selected ({pickedNow.length})
          </button>
        )}
      </div>
      {error && <div className="inline-alert" role="alert">{error}</div>}

      <div className="panel">
        <CardTable>
          <table>
            <thead>
              <tr>
                {canVerify && <th style={{ width: 28 }} />}
                <th>Customer</th><th>Executive</th><th>Call status</th><th>Customer response</th><th>Remarks</th><th>Follow-up</th><th>Submitted</th><th>Report</th>{canVerify && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={canVerify ? 10 : 8} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 0' }}>
                  {data.activities.length === 0 ? 'No call reports yet. They appear here as executives submit them.' : 'No reports match these filters.'}
                </td></tr>
              )}
              {shown.map(a => {
                const lead = leadOf.get(a.lead_id);
                const rs = reportStatusOf(a);
                return (
                  <tr key={a.id}>
                    {canVerify && (
                      <td>
                        {verifiable(a) && (
                          <input type="checkbox" aria-label={`Select report for ${lead?.customer_name ?? 'lead'}`} checked={picked.includes(a.id)}
                            onChange={e => setPicked(p => e.target.checked ? [...p, a.id] : p.filter(id => id !== a.id))} />
                        )}
                      </td>
                    )}
                    <td className="cust">{lead?.customer_name ?? '—'}<div className="loc">{lead?.phone} · {a.stage_id ? stageName(a.stage_id) : ''}</div></td>
                    <td>{callerName(a.caller_id)}</td>
                    <td><StatusChip status={a.outcome} />{a.duration_sec !== null && <div className="loc">{fmtDuration(a.duration_sec)}</div>}</td>
                    <td>{a.customer_response ?? <span className="loc">—</span>}</td>
                    <td style={{ maxWidth: 220 }}>{a.note}</td>
                    <td>{a.followup_date ? <>{shortDate(a.followup_date)}<div className="loc">{a.followup_note}</div></> : <span className="loc">None</span>}</td>
                    <td>{shortDateTime(a.created_at)}</td>
                    <td>
                      <span className={`chip ${REPORT_CHIP[rs]}`}>{REPORT_LABEL[rs]}</span>
                      {rs !== 'submitted' && a.verified_by && <div className="loc">by {a.verified_by}</div>}
                      {rs === 'returned' && a.verify_note && <div className="loc text-warn">“{a.verify_note}”</div>}
                    </td>
                    {canVerify && (
                      <td>
                        {verifiable(a) && (
                          <div className="row-actions">
                            <button className="btn-primary btn-small" disabled={busy} onClick={() => run([a.id], 'verified')}>Verify</button>
                            <button className="btn-secondary btn-small" disabled={busy} onClick={() => { setReturning([a.id]); setReason(''); setError(null); }}>Return</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
        {rows.length > PAGE_SIZE && (
          <div className="pager">
            <span>{safePage * PAGE_SIZE + 1}–{Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of {rows.length} reports</span>
            <div className="pager-btns">
              <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
              <button className="btn-secondary btn-small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={returning !== null} onClose={() => setReturning(null)} title="Send report back to the executive" closeOnBackdrop={false}>
        <div className="form-group">
          <label htmlFor="rv-reason">What needs correcting?</label>
          <textarea id="rv-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Add the quantity the customer asked for" autoFocus />
        </div>
        {error && <div className="inline-alert" role="alert">{error}</div>}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => setReturning(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy || reason.trim() === ''} onClick={() => returning && run(returning, 'returned', reason.trim())}>Send back</button>
        </div>
      </Modal>
    </>
  );
}
