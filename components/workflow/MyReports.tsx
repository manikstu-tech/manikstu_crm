import React, { useMemo, useState } from 'react';
import { CUSTOMER_RESPONSES, CallOutcome, CustomerResponse, LeadActivity, ReportStatus, TODAY, TrackerLead } from '../../data/managerDashboard';
import { REPORT_CHIP, REPORT_LABEL, reportStatusOf } from '../../lib/leadWorkflow';
import { MONTH, shortDate, shortDateTime } from '../../lib/format';
import { OUTCOMES, fmtDuration, stageName } from '../telecaller/tcData';
import { StatusChip } from '../telecaller/shared';
import Modal from '../Modal';
import CardTable from '../CardTable';

// The calling executive's call reports: every call they have made, with the report they submitted for it (call status,
// duration, customer response, remarks, follow-up) and whether the telecalling head has verified it or sent it back.
// This is the one page for both "what calls did I make" and "where do my reports stand"; reports sent back come first,
// with the head's reason, and can be corrected and submitted again.

type Period = 'Today' | 'This month' | 'All';
const PERIODS: Period[] = ['Today', 'This month', 'All'];

interface Props {
  leads: TrackerLead[];
  activities: LeadActivity[];
  searchQuery?: string;
  onResubmit: (activityId: number, note: string, response: CustomerResponse | null) => Promise<void>;
}

export default function MyReports({ leads, activities, searchQuery = '', onResubmit }: Props) {
  const [period, setPeriod] = useState<Period>('All');
  const [outcome, setOutcome] = useState<CallOutcome | 'All'>('All');
  const [status, setStatus] = useState<ReportStatus | 'all'>('all');
  const [editing, setEditing] = useState<LeadActivity | null>(null);
  const [note, setNote] = useState('');
  const [response, setResponse] = useState<CustomerResponse | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leadOf = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads]);

  // The period narrows everything: the call cards, the report counts and the table
  const inPeriod = activities.filter(a =>
    period === 'Today' ? a.created_at.startsWith(TODAY) : period === 'This month' ? a.created_at.startsWith(MONTH) : true);
  const countOutcome = (o: CallOutcome) => inPeriod.filter(a => a.outcome === o).length;
  const counts = { submitted: 0, verified: 0, returned: 0 } as Record<ReportStatus, number>;
  inPeriod.forEach(a => { counts[reportStatusOf(a)]++; });
  // A report sent back must never be hidden by a period filter, so the alert counts them all
  const returnedAll = activities.filter(a => reportStatusOf(a) === 'returned').length;

  const q = searchQuery.trim().toLowerCase();
  const rows = inPeriod
    .filter(a => outcome === 'All' || a.outcome === outcome)
    .filter(a => status === 'all' || reportStatusOf(a) === status)
    .filter(a => !q || [leadOf.get(a.lead_id)?.customer_name ?? '', leadOf.get(a.lead_id)?.phone ?? '', a.note].some(v => v.toLowerCase().includes(q)))
    .sort((a, b) => Number(reportStatusOf(b) === 'returned') - Number(reportStatusOf(a) === 'returned') || b.created_at.localeCompare(a.created_at));

  const open = (a: LeadActivity) => {
    setEditing(a);
    setNote(a.note);
    setResponse(a.customer_response ?? '');
    setError(null);
  };

  const submit = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await onResubmit(editing.id, note.trim(), response || null);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {returnedAll > 0 && (
        <div className="inline-alert" role="alert" style={{ marginBottom: 12 }}>
          {returnedAll} of your call reports {returnedAll === 1 ? 'was' : 'were'} sent back. Correct and submit {returnedAll === 1 ? 'it' : 'them'} again.
          {status !== 'returned' && <> <button className="link-btn" onClick={() => { setStatus('returned'); setPeriod('All'); }}>Show {returnedAll === 1 ? 'it' : 'them'}</button></>}
        </div>
      )}

      <div className="scoreboard">
        <div className="score"><div className="num">{inPeriod.length}</div><div className="label">Calls · {period.toLowerCase()}</div></div>
        {OUTCOMES.map(o => (
          <div key={o} className="score"><div className="num">{countOutcome(o)}</div><div className="label">{o}</div></div>
        ))}
      </div>

      <div className="page-toolbar">
        <div className="filters date-chips">
          {PERIODS.map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
        <div className="filters date-chips">
          {(['All', ...OUTCOMES] as const).map(o => (
            <button key={o} className={`filter-chip ${outcome === o ? 'active' : ''}`} onClick={() => setOutcome(o)}>{o}</button>
          ))}
        </div>
        {/* Phones: period, call status and report as three dropdowns on one row. */}
        <div className="mr-mobile-filters">
          <select className="filter-select" value={period} onChange={e => setPeriod(e.target.value as Period)} aria-label="Period">
            {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="filter-select" value={outcome} onChange={e => setOutcome(e.target.value as CallOutcome | 'All')} aria-label="Call status">
            {(['All', ...OUTCOMES] as const).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value as ReportStatus | 'all')} aria-label="Report status">
            <option value="all">All reports ({inPeriod.length})</option>
            <option value="returned">Sent back to me ({counts.returned})</option>
            <option value="submitted">Waiting for the head ({counts.submitted})</option>
            <option value="verified">Verified ({counts.verified})</option>
          </select>
        </div>
      </div>

      <div className="filter-row one-line mr-report-row">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value as ReportStatus | 'all')} aria-label="Report status">
          <option value="all">All reports ({inPeriod.length})</option>
          <option value="returned">Sent back to me ({counts.returned})</option>
          <option value="submitted">Waiting for the head ({counts.submitted})</option>
          <option value="verified">Verified ({counts.verified})</option>
        </select>
      </div>

      <div className="panel">
        <CardTable titleCol={1}>
          <table>
            <thead>
              <tr><th>Time</th><th>Customer</th><th>Call status</th><th>Stage</th><th>Customer response</th><th>Remarks</th><th>Follow-up</th><th>Report</th><th /></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 0' }}>
                  {activities.length === 0 ? 'No calls yet. A call report is submitted with every call you save.' : 'No calls match these filters.'}
                </td></tr>
              )}
              {rows.map(a => {
                const lead = leadOf.get(a.lead_id);
                const rs = reportStatusOf(a);
                return (
                  <tr key={a.id} className={rs === 'returned' ? 'fu-row-overdue' : undefined}>
                    <td>{shortDateTime(a.created_at)}</td>
                    <td className="cust">{lead?.customer_name ?? '—'}<div className="loc">{lead?.phone}</div></td>
                    <td><StatusChip status={a.outcome} />{a.duration_sec !== null && <div className="loc">{fmtDuration(a.duration_sec)}</div>}</td>
                    <td>{a.stage_id ? stageName(a.stage_id) : '—'}</td>
                    <td>{a.customer_response ?? <span className="loc">—</span>}</td>
                    <td style={{ maxWidth: 220 }}>{a.note}</td>
                    <td>{a.followup_date ? <>{shortDate(a.followup_date)}<div className="loc">{a.followup_note}</div></> : <span className="loc">None</span>}</td>
                    <td>
                      <span className={`chip ${REPORT_CHIP[rs]}`}>{REPORT_LABEL[rs]}</span>
                      {rs !== 'submitted' && a.verified_by && <div className="loc">by {a.verified_by}</div>}
                      {rs === 'returned' && a.verify_note && <div className="loc text-warn">“{a.verify_note}”</div>}
                    </td>
                    <td>{rs !== 'verified' && <button className={rs === 'returned' ? 'btn-primary btn-small' : 'btn-secondary btn-small'} onClick={() => open(a)}>{rs === 'returned' ? 'Correct & resubmit' : 'Edit'}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
      </div>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing ? `Call report: ${leadOf.get(editing.lead_id)?.customer_name ?? ''}` : ''} closeOnBackdrop={false}>
        {editing && (
          <>
            {editing.verify_note && <div className="inline-alert" style={{ marginBottom: 10 }}>The head asked: “{editing.verify_note}”</div>}
            <div className="form-group">
              <label htmlFor="mr-response">Customer response{editing.outcome === 'Connected' ? ' (required)' : ''}</label>
              <select id="mr-response" value={response} onChange={e => setResponse(e.target.value as CustomerResponse | '')}>
                <option value="">Choose…</option>
                {CUSTOMER_RESPONSES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="mr-note">Remarks</label>
              <textarea id="mr-note" rows={3} value={note} onChange={e => setNote(e.target.value)} />
            </div>
            {error && <div className="inline-alert" role="alert">{error}</div>}
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit report'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
