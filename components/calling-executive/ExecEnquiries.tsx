import React, { useMemo, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import type { LeadActivity, TrackerLead, WebEnquiry } from '../../data/managerDashboard';
import { ago, shortDateTime } from '../../lib/format';
import { StatusChip } from '../telecaller/shared';
import CardTable from '../CardTable';

// The website enquiries the telecalling head has handed to this executive. Each one is also a lead on the Call desk;
// calling it from here opens the same calling window, with the customer's message in front of them. Speaking to the
// customer answers the enquiry: it moves to "Replied" for the head and the manager as well.

type Filter = 'to_call' | 'replied' | 'all';
type Progress = 'to_call' | 'tried' | 'replied';

const PROGRESS_LABEL: Record<Progress, string> = { to_call: 'To call', tried: 'Tried · not reached', replied: 'Replied' };
const PROGRESS_CHIP: Record<Progress, string> = { to_call: 'pending', tried: 'transit', replied: 'delivered' };
const TYPE_LABEL: Record<WebEnquiry['type'], string> = { general: 'General', sales: 'Sales', partnership: 'Partnership', career: 'Career' };

interface Props {
  enquiries: WebEnquiry[];
  leads: TrackerLead[];
  activities: LeadActivity[];
  searchQuery?: string;
  /** The executive's name, signed on the WhatsApp message. */
  meName: string;
  /** Open the calling window for the lead this enquiry became. */
  onCall: (leadId: number) => void;
}

/** WhatsApp chat with the customer, with a first message about their enquiry already typed. Null when there is no usable mobile number. */
function whatsappLink(e: WebEnquiry, meName: string): string | null {
  const digits = (e.phone ?? '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  const text = `Namaskar ${e.name.split(' ')[0]}, this is ${meName} from Manikstu. Thank you for your enquiry: “${e.message}”. How can I help you?`;
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

export default function ExecEnquiries({ enquiries, leads, activities, searchQuery = '', meName, onCall }: Props) {
  const [filter, setFilter] = useState<Filter>('to_call');

  const rows = useMemo(() => {
    const callsOf = new Map<number, LeadActivity[]>();
    activities.forEach(a => callsOf.set(a.lead_id, [...(callsOf.get(a.lead_id) ?? []), a]));
    return enquiries
      .filter(e => e.lead_id !== null && leads.some(l => l.id === e.lead_id))
      .map(e => {
        const calls = callsOf.get(e.lead_id!) ?? [];
        const progress: Progress = e.status === 'replied' || calls.some(c => c.outcome === 'Connected') ? 'replied' : calls.length > 0 ? 'tried' : 'to_call';
        return { e, calls, progress, lead: leads.find(l => l.id === e.lead_id)! };
      })
      .sort((a, b) => Number(a.progress === 'replied') - Number(b.progress === 'replied') || b.e.created_at.localeCompare(a.e.created_at));
  }, [enquiries, leads, activities]);

  const count = (p: Progress | 'open') => rows.filter(r => (p === 'open' ? r.progress !== 'replied' : r.progress === p)).length;
  const q = searchQuery.trim().toLowerCase();
  const shown = rows
    .filter(r => filter === 'all' ? true : filter === 'replied' ? r.progress === 'replied' : r.progress !== 'replied')
    .filter(r => !q || [r.e.name, r.e.phone ?? '', r.e.email, r.e.message].some(v => v.toLowerCase().includes(q)));

  return (
    <>
      <div className="scoreboard">
        <div className="score"><div className="num">{rows.length}</div><div className="label">Enquiries assigned to me</div></div>
        <div className="score"><div className="num">{count('to_call')}</div><div className="label">Not called yet</div></div>
        <div className="score"><div className="num">{count('tried')}</div><div className="label">Tried · not reached</div></div>
        <div className="score"><div className="num">{count('replied')}</div><div className="label">Replied</div></div>
      </div>

      <div className="filter-row one-line filter-row-mobile">
        <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value as Filter)} aria-label="Enquiry status">
          <option value="to_call">To call ({count('open')})</option>
          <option value="replied">Replied ({count('replied')})</option>
          <option value="all">All mine ({rows.length})</option>
        </select>
      </div>

      <div className="panel">
        <CardTable>
          <table>
            <thead>
              <tr><th>Customer</th><th>Their message</th><th>Type</th><th>Received</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 0' }}>
                  {rows.length === 0
                    ? 'No enquiries assigned to you yet. When the telecalling head hands you a website enquiry it appears here, and on your Call desk.'
                    : 'Nothing here with these filters.'}
                </td></tr>
              )}
              {shown.map(({ e, calls, progress, lead }) => (
                <tr key={e.id}>
                  <td className="cust">{e.name}<div className="loc">{e.phone ?? 'No phone'}{e.email ? ` · ${e.email}` : ''}</div></td>
                  <td style={{ maxWidth: 320 }}>{e.message}</td>
                  <td><span className="chip muted">{TYPE_LABEL[e.type]}</span></td>
                  <td>{shortDateTime(e.created_at)}<div className="loc">{ago(e.created_at)}</div></td>
                  <td>
                    <span className={`chip ${PROGRESS_CHIP[progress]}`}>{PROGRESS_LABEL[progress]}</span>
                    {calls.length > 0 && <div className="loc"><StatusChip status={calls[calls.length - 1].outcome} /> {calls.length} call{calls.length === 1 ? '' : 's'}</div>}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-primary btn-small" onClick={() => onCall(lead.id)}><Phone size={13} /> {progress === 'replied' ? 'Call again' : 'Call now'}</button>
                      {(() => {
                        const wa = whatsappLink(e, meName);
                        return wa ? (
                          <a className="btn-secondary btn-small" href={wa} target="_blank" rel="noreferrer" title={`Message ${e.name} on WhatsApp`} aria-label={`WhatsApp ${e.name}`}>
                            <MessageCircle size={13} /> WhatsApp
                          </a>
                        ) : (
                          <button className="btn-secondary btn-small" disabled title="No valid mobile number for WhatsApp"><MessageCircle size={13} /> WhatsApp</button>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
      </div>
    </>
  );
}
