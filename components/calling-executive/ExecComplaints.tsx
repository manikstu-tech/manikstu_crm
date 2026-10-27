import React, { useMemo, useState } from 'react';
import { Phone, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Complaint, ComplaintEvent, ComplaintStatus, RESOLUTION_TYPES, ResolutionType } from '../../data/complaints';
import type { Priority } from '../../data/complaints';
import { nowStamp, rupees, shortDateTime } from '../../lib/format';
import { PRIORITY_LABEL, STATUS_CHIP, STATUS_LABEL, deadlineText, isActive } from '../telecaller/complaintsUtil';
import CardTable from '../CardTable';

// The complaints the telecalling head has put this executive on (the backend only sends them their own). They work a
// ticket here: call the customer, add notes, move it along, record how it was resolved, or hand it back to the head
// with a reason. Everything is saved to the backend, so the head and the manager see each step.

type Tab = 'open' | 'resolved' | 'all';
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_CHIP: Record<Priority, string> = { urgent: 'pending', high: 'pending', medium: 'transit', low: 'muted' };
const KIND_LABEL: Record<ComplaintEvent['kind'], string> = {
  raised: 'Raised', assigned: 'Assigned', reassigned: 'Reassigned', returned: 'Handed back', note: 'Note', call: 'Call', status: 'Status',
  priority: 'Priority', resolved: 'Resolved', closed: 'Closed', reopened: 'Reopened', escalated: 'Escalated',
};

interface Props {
  complaints: Complaint[];
  /** This executive's id and name (their tickets are the ones assigned to that id). */
  meId: number;
  meName: string;
  searchQuery?: string;
  ready: boolean;
  onChange: Dispatch<SetStateAction<Complaint[]>>;
  onToast: (message: string) => void;
}

export default function ExecComplaints({ complaints, meId, meName, searchQuery = '', ready, onChange, onToast }: Props) {
  const [tab, setTab] = useState<Tab>('open');
  const [openId, setOpenId] = useState<number | null>(null);

  const mine = useMemo(() => complaints.filter(c => c.assigned_to === meId), [complaints, meId]);
  const q = searchQuery.trim().toLowerCase();
  const rows = mine
    .filter(c => (tab === 'all' ? true : tab === 'open' ? isActive(c) : !isActive(c)))
    .filter(c => !q || [c.ticket, c.customer_name, c.phone, c.order_number ?? '', c.description].some(v => v.toLowerCase().includes(q)))
    .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.due_at.localeCompare(b.due_at));
  const open = mine.find(c => c.id === openId) ?? null;
  const overdue = mine.filter(c => isActive(c) && deadlineText(c).late).length;

  const update = (id: number, patch: Partial<Complaint>, event: Omit<ComplaintEvent, 'at' | 'by'>, toast: string) => {
    onChange(prev => prev.map(c => (c.id === id ? { ...c, ...patch, events: [...c.events, { ...event, at: nowStamp(), by: meName }] } : c)));
    onToast(toast);
  };

  if (!ready) return <div className="panel"><div className="panel-note" style={{ margin: 16 }}>Loading your complaints…</div></div>;

  return (
    <>
      <div className="scoreboard">
        <div className="score"><div className="num">{mine.filter(isActive).length}</div><div className="label">Open complaints</div></div>
        <div className="score"><div className="num">{overdue}{overdue > 0 && <small className="warn">past deadline</small>}</div><div className="label">Overdue</div></div>
        <div className="score"><div className="num">{mine.filter(c => isActive(c) && c.priority === 'urgent').length}</div><div className="label">Urgent</div></div>
        <div className="score"><div className="num">{mine.filter(c => !isActive(c)).length}</div><div className="label">Resolved by me</div></div>
      </div>

      <div className="filter-row one-line filter-row-mobile">
        <select className="filter-select" value={tab} onChange={e => setTab(e.target.value as Tab)} aria-label="Complaint status">
          <option value="open">Open ({mine.filter(isActive).length})</option>
          <option value="resolved">Resolved ({mine.filter(c => !isActive(c)).length})</option>
          <option value="all">All mine ({mine.length})</option>
        </select>
      </div>

      <div className="panel">
        <CardTable>
          <table>
            <thead>
              <tr><th>Ticket</th><th>Customer</th><th>Complaint</th><th>Priority</th><th>Status</th><th>Deadline</th><th /></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 0' }}>
                  {mine.length === 0
                    ? 'No complaints assigned to you. When the telecalling head puts you on one it appears here.'
                    : 'Nothing here with these filters.'}
                </td></tr>
              )}
              {rows.map(c => {
                const d = deadlineText(c);
                return (
                  <tr key={c.id} className={isActive(c) && d.late ? 'fu-row-overdue' : undefined} style={{ cursor: 'pointer' }} onClick={() => setOpenId(c.id)}>
                    <td className="cust">{c.ticket}<div className="loc">{c.channel}{c.order_number ? ` · ${c.order_number}` : ''}</div></td>
                    <td>{c.customer_name}<div className="loc">{c.phone}{c.city ? ` · ${c.city}` : ''}</div></td>
                    <td style={{ maxWidth: 300 }}><strong>{c.category}</strong><div className="loc">{c.description}</div></td>
                    <td><span className={`chip ${PRIORITY_CHIP[c.priority]}`}>{PRIORITY_LABEL[c.priority]}</span></td>
                    <td><span className={`chip ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                    <td className={d.late ? 'text-warn' : undefined}>{d.text}</td>
                    <td><button className="btn-secondary btn-small" onClick={ev => { ev.stopPropagation(); setOpenId(c.id); }}>Open</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
      </div>

      {open && <TicketDrawer c={open} meName={meName} onClose={() => setOpenId(null)} onUpdate={update} />}
    </>
  );
}

function TicketDrawer({ c, meName, onClose, onUpdate }: {
  c: Complaint;
  meName: string;
  onClose: () => void;
  onUpdate: (id: number, patch: Partial<Complaint>, event: Omit<ComplaintEvent, 'at' | 'by'>, toast: string) => void;
}) {
  const active = isActive(c);
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resType, setResType] = useState<ResolutionType>('Explanation');
  const [resNote, setResNote] = useState('');
  const [refund, setRefund] = useState('');
  const [handingBack, setHandingBack] = useState(false);
  const [reason, setReason] = useState('');
  const d = deadlineText(c);

  const setStatus = (status: ComplaintStatus, text: string, toast: string) => onUpdate(c.id, { status }, { kind: 'status', text }, toast);
  const resolve = () => {
    const refundAmount = resType === 'Refund' && refund ? Number(refund) : null;
    onUpdate(
      c.id,
      { status: 'resolved', resolution_type: resType, resolution_note: resNote.trim(), refund_amount: refundAmount },
      { kind: 'resolved', text: `${resType}${refundAmount ? ` (${rupees(refundAmount)})` : ''}: ${resNote.trim()}` },
      `${c.ticket} resolved`,
    );
    onClose();
  };
  const handBack = () => {
    onUpdate(c.id, { assigned_to: 'head', returned_note: reason.trim() }, { kind: 'returned', text: reason.trim() }, `${c.ticket} handed back to the head`);
    onClose();
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="order-drawer" role="dialog" aria-label={`Complaint ${c.ticket}`}>
        <div className="drawer-head">
          <div>
            <h3>{c.ticket}</h3>
            <div className="loc">
              <span className={`chip ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>{' '}
              <span className={`chip ${PRIORITY_CHIP[c.priority]}`}>{PRIORITY_LABEL[c.priority]}</span>{' '}
              <span className={d.late && active ? 'text-warn' : ''}>{d.text}</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="drawer-body">
          <section className="od-section">
            <div className="od-label">Customer</div>
            <div className="od-customer">
              <div>
                <strong>{c.customer_name}</strong>
                <div className="loc">{c.city || '—'}{c.order_number ? ` · Order ${c.order_number}` : ''}{c.product ? ` · ${c.product}` : ''}</div>
              </div>
              <a className="call-btn" href={`tel:+91${c.phone.replace(/\D/g, '').slice(-10)}`}><Phone size={13} /> {c.phone}</a>
            </div>
          </section>

          <section className="od-section">
            <div className="od-label">{c.category} · via {c.channel}</div>
            <p className="od-note-text">{c.description}</p>
          </section>

          {c.resolution_type && (
            <section className="od-section">
              <div className="od-label">How it was resolved</div>
              <div><strong>{c.resolution_type}</strong>{c.refund_amount ? ` · ${rupees(c.refund_amount)} refunded` : ''}</div>
              {c.resolution_note && <div className="loc">{c.resolution_note}</div>}
            </section>
          )}

          {active && (
            <section className="od-section">
              <div className="od-label">Add a note (e.g. after calling the customer)</div>
              <textarea className="od-notes" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Called the customer, replacement will go out tomorrow…" />
              <button className="btn-secondary btn-small" disabled={note.trim() === ''} onClick={() => { onUpdate(c.id, {}, { kind: 'note', text: note.trim() }, 'Note added'); setNote(''); }}>Add note</button>
            </section>
          )}

          {active && resolving && (
            <section className="od-section">
              <div className="od-label">Resolve this complaint</div>
              <div className="form-row">
                <div className="form-group">
                  <label>How was it resolved?</label>
                  <select className="filter-select" value={resType} onChange={e => setResType(e.target.value as ResolutionType)}>
                    {RESOLUTION_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {resType === 'Refund' && (
                  <div className="form-group">
                    <label>Refund amount (₹)</label>
                    <input inputMode="numeric" value={refund} onChange={e => setRefund(e.target.value.replace(/[^\d]/g, ''))} />
                  </div>
                )}
              </div>
              <textarea className="od-notes" rows={2} value={resNote} onChange={e => setResNote(e.target.value)} placeholder="e.g. Replacement syrup sent with today's dispatch" />
              <div className="drawer-actions" style={{ padding: 0, marginTop: 8 }}>
                <button className="btn-secondary btn-small" onClick={() => setResolving(false)}>Cancel</button>
                <button className="btn-primary btn-small" disabled={resNote.trim() === ''} onClick={resolve}>Mark resolved</button>
              </div>
            </section>
          )}

          {active && handingBack && (
            <section className="od-section">
              <div className="od-label">Hand back to the telecalling head</div>
              <textarea className="od-notes" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why? e.g. Needs a refund decision" />
              <div className="drawer-actions" style={{ padding: 0, marginTop: 8 }}>
                <button className="btn-secondary btn-small" onClick={() => setHandingBack(false)}>Cancel</button>
                <button className="btn-primary btn-small" disabled={reason.trim() === ''} onClick={handBack}>Hand back</button>
              </div>
            </section>
          )}

          <section className="od-section">
            <div className="od-label">History</div>
            <ul className="track-timeline">
              {[...c.events].reverse().map((e, i) => (
                <li key={i}>
                  <div className="tt-title">{KIND_LABEL[e.kind]}{e.text ? `: ${e.text}` : ''}</div>
                  <div className="tt-time">{shortDateTime(e.at)}{e.by ? ` · ${e.by}` : ''}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {active && !resolving && !handingBack && (
          <div className="drawer-actions">
            {c.status !== 'in_progress' && <button className="btn-secondary btn-small" onClick={() => setStatus('in_progress', `${meName} is working on it`, `${c.ticket} in progress`)}>In progress</button>}
            {c.status !== 'waiting' && <button className="btn-secondary btn-small" onClick={() => setStatus('waiting', 'Waiting on the customer', `${c.ticket} waiting on customer`)}>Waiting on customer</button>}
            <button className="btn-secondary btn-small" onClick={() => setHandingBack(true)}>Hand back to head</button>
            <button className="btn-primary btn-small" onClick={() => setResolving(true)}>Resolve</button>
          </div>
        )}
      </aside>
    </>
  );
}
