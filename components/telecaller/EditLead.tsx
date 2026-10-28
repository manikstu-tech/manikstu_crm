import React, { useEffect, useState } from 'react';
import { NAME_MISSING, VERTICALS, type TrackerLead } from '../../data/managerDashboard';
import { istDateTime } from '../../lib/assignedDate';
import { NAME_MAX, REASON_MAX, cleanName, nameProblem } from '../../lib/leadImport';
import type { LeadPatch } from '../../lib/trackerOps';
import Modal from '../Modal';

interface History {
  assignments: { from: string | null; to: string | null; by: string | null; via: string; at: string | null }[];
  edits: { by: string | null; at: string | null; changes: Record<string, { from: unknown; to: unknown }> }[];
}

type HistoryLoad = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ok'; data: History };

const VIA: Record<string, string> = { import: 'on import', assign: 'assigned', distribute: 'shared evenly', enquiry: 'from an enquiry', backfill: 'before history was kept' };
const FIELD: Record<string, string> = { customer_name: 'Name', phone: 'Phone', vertical_id: 'Product line', stage_id: 'Stage', source: 'Source', reason: 'Reason' };
const show = (field: string, v: unknown) =>
  v === null || v === undefined || v === '' ? (field === 'customer_name' ? NAME_MISSING : '—')
    : field === 'vertical_id' ? VERTICALS.find(x => x.id === Number(v))?.name ?? String(v) : String(v);

interface Props {
  lead: TrackerLead | null;
  /** The lead has calls: its product line is then fixed (its stage history belongs to that line). */
  called: boolean;
  ownerName: string;
  assignedAt: string | null;
  sources: string[];
  /** Resolves to the error to show, or null once saved. */
  onSave: (leadId: number, patch: LeadPatch) => Promise<string | null>;
  onClose: () => void;
}

/**
 * Edit a lead's details on the same record (head and manager). Only the fields changed are sent; the lead keeps its
 * id, executive, assignment, calls and follow-ups. Shows who has had the lead and every past edit.
 */
export default function EditLead({ lead, called, ownerName, assignedAt, sources, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [verticalId, setVerticalId] = useState(0);
  const [source, setSource] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryLoad>({ status: 'loading' });
  const leadId = lead?.id ?? null;

  // A different lead (or reopening) starts from that lead's saved details, never the last one's edits.
  useEffect(() => {
    if (!lead) return;
    setName(lead.name_missing ? '' : lead.customer_name);
    setPhone(lead.phone);
    setVerticalId(lead.vertical_id);
    setSource(lead.source);
    setReason(lead.reason ?? '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when another lead is opened
  }, [leadId]);

  useEffect(() => {
    if (leadId === null) return;
    const controller = new AbortController();
    setHistory({ status: 'loading' });
    fetch(`/api/tracker/leads/${leadId}/history`, { cache: 'no-store', signal: controller.signal })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        setHistory(r.ok && body?.data ? { status: 'ok', data: body.data as History } : { status: 'error', error: body?.error || 'Could not load the history.' });
      })
      .catch(() => { if (!controller.signal.aborted) setHistory({ status: 'error', error: 'Could not reach the server.' }); });
    return () => controller.abort();
  }, [leadId, lead?.edited_at, lead?.assigned_to]);

  if (!lead) return <Modal isOpen={false} onClose={onClose} title="">{null}</Modal>;

  // The same rules as the server and the import: a name is optional but, when given, 2–80 characters with letters
  // ("N/A", "-", "unknown" mean no name); the mobile is 10 digits starting 6–9; a reason is at most 500 characters.
  const cleanedName = cleanName(name);
  const isPlaceholder = name.trim() !== '' && cleanedName === '';
  const cleanedReason = reason.replace(/\s+/g, ' ').trim();
  const original = { name: lead.name_missing ? '' : lead.customer_name, phone: lead.phone, verticalId: lead.vertical_id, source: lead.source, reason: lead.reason ?? '' };
  const patch: LeadPatch = {};
  if (cleanedName !== original.name) patch.customer_name = cleanedName || null;
  if (phone !== original.phone) patch.phone = phone;
  if (verticalId !== original.verticalId) patch.vertical_id = verticalId;
  if (source !== original.source) patch.source = source;
  if (cleanedReason !== original.reason) patch.reason = cleanedReason || null;
  const changed = Object.keys(patch).length > 0;

  const nameError = nameProblem(cleanedName);
  const phoneError = phone === '' ? 'The mobile number is required: it identifies the lead.'
    : phone.length < 10 ? `Enter all 10 digits (${phone.length} so far).`
    : !/^[6-9]/.test(phone) ? 'An Indian mobile number starts with 6, 7, 8 or 9.'
    : null;
  const reasonError = cleanedReason.length > REASON_MAX ? `At most ${REASON_MAX} characters.` : null;
  const invalid = !!nameError || !!phoneError || !!reasonError || !source;

  /** Keep only the 10-digit number: digits only, a typed or pasted +91 / 0 in front is dropped, nothing past 10. */
  const onPhone = (text: string) => {
    let d = text.replace(/\D/g, '');
    if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
    else if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
    setPhone(d.slice(0, 10));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || invalid) return;
    setSaving(true);
    setError(null);
    const err = await onSave(lead.id, patch);
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  const allSources = Array.from(new Set([lead.source, ...sources]));

  return (
    <Modal isOpen onClose={onClose} title={`Edit lead #${lead.id}`} wide>
      <form className="edit-lead" onSubmit={save}>
        <div className="edit-lead-meta">
          <span>Lead #{lead.id}</span>
          <span>{ownerName}{assignedAt ? ` · assigned ${istDateTime(assignedAt)}` : ''}</span>
          {lead.name_missing ? <span className="chip pending">{NAME_MISSING} · Incomplete</span> : <span className="chip delivered">Complete</span>}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-lead-name">Customer name</label>
            <input id="edit-lead-name" value={name} onChange={e => setName(e.target.value)} placeholder="Add the name to complete this lead"
              maxLength={NAME_MAX} autoFocus={lead.name_missing} aria-invalid={!!nameError} aria-describedby="edit-lead-name-help" />
            <div id="edit-lead-name-help" className={nameError ? 'text-warn' : 'loc'}>
              {nameError ?? (isPlaceholder ? `“${name.trim()}” is not a name: it will be saved as ${NAME_MISSING}.`
                : cleanedName ? `${cleanedName.length}/${NAME_MAX} characters` : `Leave empty to keep it as ${NAME_MISSING}.`)}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="edit-lead-phone">Mobile number</label>
            <input id="edit-lead-phone" value={phone} onChange={e => onPhone(e.target.value)} inputMode="numeric" autoComplete="off"
              placeholder="10-digit mobile" aria-invalid={!!phoneError} aria-describedby="edit-lead-phone-help" />
            <div id="edit-lead-phone-help" className={phoneError ? 'text-warn' : 'loc'}>{phoneError ?? 'Digits only; +91 or a leading 0 is removed.'}</div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-lead-product">Product line</label>
            <select id="edit-lead-product" value={verticalId} onChange={e => setVerticalId(Number(e.target.value))} disabled={called}>
              {VERTICALS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {called && <div className="loc">Fixed once the lead has been called.</div>}
          </div>
          <div className="form-group">
            <label htmlFor="edit-lead-source">Source</label>
            <select id="edit-lead-source" value={source} onChange={e => setSource(e.target.value)}>
              {allSources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="edit-lead-reason">Reason</label>
          <textarea id="edit-lead-reason" value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={REASON_MAX}
            aria-invalid={!!reasonError} aria-describedby="edit-lead-reason-help" />
          <div id="edit-lead-reason-help" className={reasonError ? 'text-warn' : 'loc'}>{reasonError ?? `${cleanedReason.length}/${REASON_MAX} characters`}</div>
        </div>
        <p className="loc">Saving changes this lead only. Its executive, assignment, calls and follow-ups stay as they are.</p>

        {error && <div className="inline-alert" role="alert">{error}</div>}

        <section className="edit-lead-history">
          <div className="od-label">History</div>
          {history.status === 'loading' && <div className="loc">Loading…</div>}
          {history.status === 'error' && <div className="loc">{history.error}</div>}
          {history.status === 'ok' && (
            <ul className="track-timeline">
              {/* Newest first; the lists come oldest first, so they are reversed before the (stable) sort by time. */}
              {[
                ...[...history.data.assignments].reverse().map(a => ({
                  at: a.at ?? '', key: `a${a.at}${a.to}`,
                  title: `${a.from ?? 'Unassigned'} → ${a.to ?? 'Unassigned'}`,
                  sub: `${VIA[a.via] ?? a.via}${a.by ? ` · by ${a.by}` : ''}`,
                })),
                ...[...history.data.edits].reverse().map(e => ({
                  at: e.at ?? '', key: `e${e.at}`,
                  title: Object.entries(e.changes).filter(([f]) => f !== 'stage_id').map(([f, c]) => `${FIELD[f] ?? f}: ${show(f, c.from)} → ${show(f, c.to)}`).join(' · '),
                  sub: `edited${e.by ? ` by ${e.by}` : ''}`,
                })),
              ].sort((x, y) => y.at.localeCompare(x.at)).map(h => (
                <li key={h.key}>
                  <div className="tt-title">{h.title}</div>
                  <div className="tt-time">{istDateTime(h.at)} · {h.sub}</div>
                </li>
              ))}
              {history.data.assignments.length + history.data.edits.length === 0 && <li><div className="tt-title">Not assigned or edited yet.</div></li>}
            </ul>
          )}
        </section>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!changed || invalid || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}
