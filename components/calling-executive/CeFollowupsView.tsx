import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Clock, Phone } from 'lucide-react';
import { Followup, LeadActivity, TODAY, TrackerLead } from '../../data/managerDashboard';
import { ago, dayStart, daysBefore, pct, shortDate } from '../../lib/format';
import { lastCallFor, stageName, time12, verticalName } from '../telecaller/tcData';
import CardTable from '../CardTable';

type Filter = 'all' | 'overdue' | 'today' | 'upcoming' | 'done';
const FILTER_LABEL: Record<Filter, string> = { all: 'All', overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', done: 'Done' };
type Bucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';
const BUCKET_LABEL: Record<Bucket, string> = { overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', week: 'This week', later: 'Later' };
const BUCKET_STYLE: Record<Bucket, { cls: string; Icon: typeof Clock }> = {
  overdue: { cls: 'g-overdue', Icon: AlertTriangle },
  today: { cls: 'g-today', Icon: Clock },
  tomorrow: { cls: 'g-soon', Icon: CalendarDays },
  week: { cls: 'g-soon', Icon: CalendarDays },
  later: { cls: 'g-soon', Icon: CalendarDays },
};
const OUTCOME_CHIP: Record<string, string> = { Connected: 'delivered', 'No answer': 'transit', Busy: 'pending', 'Wrong number': 'muted', 'Not interested': 'muted' };

const bucketOf = (f: Followup): Bucket => {
  const due = dayStart(f.due_at);
  const today = dayStart(TODAY);
  if (f.status === 'missed' || due < today) return 'overdue';
  if (f.due_at.startsWith(TODAY)) return 'today';
  if (due === today + 86_400_000) return 'tomorrow';
  return daysBefore(f.due_at) >= -7 ? 'week' : 'later';
};

interface Props {
  leads: TrackerLead[];
  followups: Followup[];
  activities: LeadActivity[];
  searchQuery: string;
  onCall: (leadId: number, followupId?: number) => void;
  onDone: (followupId: number) => void;
}

export default function CeFollowupsView({ leads, followups, activities, searchQuery, onCall, onDone }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const lead = (id: number) => leads.find(l => l.id === id);
  const leadName = (id: number) => lead(id)?.customer_name ?? '—';

  const pending = followups.filter(f => f.status !== 'done');
  const done = followups.filter(f => f.status === 'done');
  const counts = {
    all: pending.length,
    overdue: pending.filter(f => bucketOf(f) === 'overdue').length,
    today: pending.filter(f => bucketOf(f) === 'today').length,
    upcoming: pending.filter(f => ['tomorrow', 'week', 'later'].includes(bucketOf(f))).length,
    done: done.length,
  };
  const doneThisMonth = done.filter(f => f.completed_at?.startsWith(TODAY.slice(0, 7))).length;
  const notKept = counts.overdue;
  const keptRate = done.length + notKept ? pct(done.length, done.length + notKept) : null;

  const q = searchQuery.trim().toLowerCase();
  const matches = (f: Followup) => !q || [leadName(f.lead_id), lead(f.lead_id)?.phone ?? '', f.note].some(v => v.toLowerCase().includes(q));

  // Rows for the chosen filter, grouped by bucket (Done shows completed, newest first)
  const groups = useMemo(() => {
    if (filter === 'done') {
      const rows = done.filter(matches).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
      return rows.length ? [{ bucket: 'done' as const, rows }] : [];
    }
    const order: Bucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later'];
    const wanted = (b: Bucket) =>
      filter === 'all' ? true
      : filter === 'overdue' ? b === 'overdue'
      : filter === 'today' ? b === 'today'
      : ['tomorrow', 'week', 'later'].includes(b);
    return order
      .filter(wanted)
      .map(bucket => ({ bucket, rows: pending.filter(f => bucketOf(f) === bucket && matches(f)).sort((a, b) => a.due_at.localeCompare(b.due_at)) }))
      .filter(g => g.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followups, filter, q]);

  const dueText = (f: Followup) => {
    const b = bucketOf(f);
    if (b === 'overdue') return { text: f.status === 'missed' ? 'missed' : `${daysBefore(f.due_at)}d overdue`, warn: true };
    if (b === 'today') return { text: `Today, ${time12(f.due_at)}`, warn: false };
    return { text: shortDate(f.due_at), warn: false };
  };

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <>
      <div className="scoreboard">
        <button className="score score-btn" onClick={() => setFilter('overdue')}>
          <div className={`num ${counts.overdue ? 'text-warn' : ''}`}>{counts.overdue}</div><div className="label">Overdue</div>
        </button>
        <button className="score score-btn" onClick={() => setFilter('today')}>
          <div className="num">{counts.today}</div><div className="label">Due today</div>
        </button>
        <button className="score score-btn" onClick={() => setFilter('upcoming')}>
          <div className="num">{counts.upcoming}</div><div className="label">Upcoming</div>
        </button>
        <div className="score"><div className="num">{doneThisMonth}</div><div className="label">Done this month</div></div>
        <div className="score"><div className="num">{keptRate === null ? '—' : `${keptRate}%`}</div><div className="label">Follow-ups kept</div></div>
      </div>

      <div className="page-toolbar">
        <div className="filters date-chips">
          {(Object.keys(FILTER_LABEL) as Filter[]).map(fk => (
            <button key={fk} className={`filter-chip ${filter === fk ? 'active' : ''}`} onClick={() => setFilter(fk)}>
              {FILTER_LABEL[fk]}{fk !== 'done' ? ` (${counts[fk]})` : ''}
            </button>
          ))}
        </div>
        {/* Phones: the five status filters become one dropdown. */}
        <select className="filter-select phone-select fu-status-select" value={filter} onChange={e => setFilter(e.target.value as Filter)} aria-label="Follow-up status">
          {(Object.keys(FILTER_LABEL) as Filter[]).map(fk => (
            <option key={fk} value={fk}>{FILTER_LABEL[fk]}{fk !== 'done' ? ` (${counts[fk]})` : ''}</option>
          ))}
        </select>
      </div>

      <div className="panel">
        <CardTable className="fu-wrap">
          <table className="orders-table fu-table">
            <thead>
              <tr><th>Lead</th><th>Reason</th><th>{filter === 'done' ? 'Done' : 'Due'}</th><th>Last call</th><th></th></tr>
            </thead>
            <tbody>
              {total === 0 && (
                <tr><td colSpan={5} className="loc" style={{ textAlign: 'center', padding: 24 }}>
                  {q ? 'No follow-ups match your search.' : filter === 'done' ? 'No completed follow-ups yet.' : 'Nothing here — you’re on top of your follow-ups.'}
                </td></tr>
              )}
              {groups.map(g => (
                <React.Fragment key={g.bucket}>
                  {filter === 'all' && g.bucket !== 'done' && (() => {
                    const { cls, Icon } = BUCKET_STYLE[g.bucket];
                    return (
                      <tr className={`group-row ${cls}`}>
                        <td colSpan={5}>
                          <div className="group-band">
                            <span className="group-label"><Icon size={14} /> {BUCKET_LABEL[g.bucket]}</span>
                            <span className="group-count">{g.rows.length}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                  {g.rows.map(f => {
                    const l = lead(f.lead_id);
                    const last = lastCallFor(f.lead_id, activities);
                    const due = dueText(f);
                    return (
                      <tr key={f.id}>
                        <td className="cust">{leadName(f.lead_id)}<div className="loc">{l ? `${l.phone} · ${verticalName(l.vertical_id)} · ${stageName(l.stage_id)}` : ''}</div></td>
                        <td>{f.note}</td>
                        <td className={f.status !== 'done' && due.warn ? 'text-warn' : undefined} style={{ whiteSpace: 'nowrap' }}>
                          {f.status === 'done' ? (f.completed_at ? shortDate(f.completed_at) : 'done') : due.text}
                        </td>
                        <td>{last ? <><span className={`chip ${OUTCOME_CHIP[last.outcome]}`}>{last.outcome}</span><div className="loc">{ago(last.created_at)}</div></> : <span className="loc">Never</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {f.status !== 'done' && (
                            <>
                              <button className="btn-primary btn-small" onClick={() => onCall(f.lead_id, f.id)}><Phone size={13} /> Call</button>
                              <button className="kanban-btn" style={{ marginLeft: 6 }} onClick={() => onDone(f.id)}>Mark done</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </CardTable>
      </div>
    </>
  );
}
