import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarCheck, CalendarClock, CalendarDays, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { TELECALLERS, TODAY, Followup, TrackerLead } from '../../data/managerDashboard';
import { ago, dayStart, daysBefore, shortDate, shortDateTime } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import { EmptyRow, StatusChip } from './shared';
import { TeamData, UNASSIGNED_STALE_DAYS, UNCALLED_STALE_DAYS, callerName, isOpenLead, isOverdue, lastCallFor, stageName, time12 } from './tcData';
import { initials } from '../views/telecallingMetrics';

type Tab = 'Overdue' | 'Due today' | 'Upcoming' | 'Done' | 'All';
/** The status the page opens on. It isn't shown as a filter tag: only statuses picked after that are. */
const START_TAB: Tab = 'Overdue';

/**
 * One row of the Follow-up list. A scheduled callback the executive booked, or a
 * lead surfaced automatically because it is stuck: unassigned too long, or assigned
 * but never called. The stuck ones always count as Overdue.
 */
type FollowRow =
  | { kind: 'followup'; key: string; tab: Exclude<Tab, 'All'>; sortAt: string; f: Followup; lead?: TrackerLead }
  | { kind: 'unassigned'; key: string; tab: 'Overdue'; sortAt: string; lead: TrackerLead; days: number }
  | { kind: 'uncalled'; key: string; tab: 'Overdue'; sortAt: string; lead: TrackerLead; days: number };
const STATUS: { key: Tab; hint: string }[] = [
  { key: 'Overdue', hint: 'Missed or past their date' },
  { key: 'Due today', hint: 'Callbacks promised for today' },
  { key: 'Upcoming', hint: 'Due after today' },
  { key: 'Done', hint: 'Called back' },
  { key: 'All', hint: 'Every follow-up' },
];

const tabOf = (f: Followup): Exclude<Tab, 'All'> => {
  if (f.status === 'done') return 'Done';
  if (isOverdue(f)) return 'Overdue';
  if (f.due_at.startsWith(TODAY)) return 'Due today';
  return 'Upcoming';
};
const daysLate = (f: Followup) => Math.round((dayStart(TODAY) - dayStart(f.due_at)) / 86_400_000);

interface Props {
  data: TeamData;
  searchQuery: string;
  initialCaller?: number;
  onReassign: (leadIds: number[], toCallerId: number) => void;
  onToast: (message: string) => void;
}

/** Callbacks the calling executives owe: who is behind, and moving leads to someone who can call. */
export default function TeamFollowups({ data, searchQuery, initialCaller, onReassign, onToast }: Props) {
  const [caller, setCaller] = useState<number | 'all'>(initialCaller ?? 'all');
  const [tab, setTab] = useState<Tab>(START_TAB);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const leadOf = (id: number) => data.leads.find(l => l.id === id);
  const scoped = data.followups.filter(f => caller === 'all' || f.caller_id === caller);
  const doneToday = scoped.filter(f => f.status === 'done' && f.completed_at?.startsWith(TODAY)).length;

  // Leads surfaced automatically so none is missed: unassigned too long, or assigned
  // but never called. Both always count as Overdue.
  const calledIds = new Set(data.activities.map(a => a.lead_id));
  const stuckAll: FollowRow[] = [];
  for (const l of data.leads) {
    if (l.assigned_to === 0) {
      const days = daysBefore(l.created_at);
      if (days >= UNASSIGNED_STALE_DAYS) stuckAll.push({ kind: 'unassigned', key: `u${l.id}`, tab: 'Overdue', sortAt: l.created_at, lead: l, days });
    } else if (isOpenLead(l) && !calledIds.has(l.id)) {
      const days = daysBefore(l.updated_at);
      if (days >= UNCALLED_STALE_DAYS) stuckAll.push({ kind: 'uncalled', key: `c${l.id}`, tab: 'Overdue', sortAt: l.updated_at, lead: l, days });
    }
  }
  // Unassigned leads belong to nobody, so they only show under "Everyone".
  const stuck = caller === 'all' ? stuckAll : stuckAll.filter(r => r.lead.assigned_to === caller);

  const reasonOf = (r: FollowRow) =>
    r.kind === 'followup' ? r.f.note : r.kind === 'unassigned' ? 'Unassigned — hand to an executive' : 'Assigned but not called';

  const countOf = (t: Tab) => {
    const fc = t === 'All' ? scoped.length : scoped.filter(f => tabOf(f) === t).length;
    const sc = t === 'All' || t === 'Overdue' ? stuck.length : 0;
    return fc + sc;
  };

  const q = searchQuery.trim().toLowerCase();
  const matches = (lead: TrackerLead | undefined, text: string) =>
    !q || (!!lead && [lead.customer_name, lead.phone, text].some(v => v.toLowerCase().includes(q)));

  const fuRows: FollowRow[] = scoped.map(f => ({ kind: 'followup', key: `f${f.id}`, tab: tabOf(f), sortAt: f.due_at, f, lead: leadOf(f.lead_id) }));
  const rows: FollowRow[] = [
    ...fuRows.filter(r => tab === 'All' || r.tab === tab),
    ...(tab === 'Overdue' || tab === 'All' ? stuck : []),
  ]
    .filter(r => matches(r.lead, reasonOf(r)))
    .sort((a, b) => (tab === 'Done' ? b.sortAt.localeCompare(a.sortAt) : a.sortAt.localeCompare(b.sortAt)));

  // Each calling executive: what they owe and how reliably they call back
  const board = TELECALLERS.map(t => {
    const mine = data.followups.filter(f => f.caller_id === t.id);
    const done = mine.filter(f => f.status === 'done').length;
    const missed = mine.filter(f => f.status === 'missed').length;
    return {
      t,
      overdue: mine.filter(isOverdue).length,
      today: mine.filter(f => tabOf(f) === 'Due today').length,
      upcoming: mine.filter(f => tabOf(f) === 'Upcoming').length,
      kept: done + missed ? Math.round((done / (done + missed)) * 100) : null,
    };
  })
    .filter(x => x.t.is_active || x.overdue + x.today + x.upcoming > 0)
    .sort((a, b) => Number(b.t.is_active) - Number(a.t.is_active) || b.overdue - a.overdue);

  const tags = [
    tab !== 'All' && tab !== START_TAB && { key: 'status', k: 'Status', v: tab, clear: () => setTab('All') },
    caller !== 'all' && { key: 'caller', k: 'Executive', v: callerName(caller), clear: () => setCaller('all') },
  ].filter(Boolean) as { key: string; k: string; v: string; clear: () => void }[];
  const clearFilters = () => { setTab('All'); setCaller('all'); };

  const runExport = async (format: ExportFormat) => {
    if (rows.length === 0) { onToast('No follow-ups to export'); return; }
    try {
      await exportTable(format, {
        filename: `team-followups-${TODAY}`,
        title: `Follow-ups · ${tab}`,
        subtitle: `${rows.length} follow-ups${caller === 'all' ? '' : ` · ${callerName(caller)}`} · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Due', width: 14 }, { header: 'Calling executive', width: 16 }, { header: 'Lead', width: 18 },
          { header: 'Phone', width: 12 }, { header: 'Reason', width: 26 }, { header: 'Status', width: 10 },
        ],
        rows: rows.map(r => {
          const l = r.lead;
          const due = r.kind === 'followup' ? shortDateTime(r.f.due_at) : `${r.days}d ${r.kind === 'unassigned' ? 'unassigned' : 'no call'}`;
          const exec = r.kind === 'unassigned' ? 'Unassigned' : callerName(r.kind === 'followup' ? r.f.caller_id : r.lead.assigned_to);
          const status = r.kind === 'followup' ? r.f.status : r.kind === 'unassigned' ? 'unassigned' : 'not called';
          return [due, exec, l?.customer_name ?? '', l?.phone ?? '', reasonOf(r), status];
        }),
      });
      onToast(`Follow-ups exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  const TILES: { key: Tab; icon: typeof CalendarClock; n: number; label: string; tone?: string }[] = [
    { key: 'Overdue', icon: AlertTriangle, n: countOf('Overdue'), label: 'Overdue · call these first', tone: 'alert' },
    { key: 'Due today', icon: CalendarClock, n: countOf('Due today'), label: 'Due today' },
    { key: 'Upcoming', icon: CalendarDays, n: countOf('Upcoming'), label: 'Upcoming' },
    { key: 'Done', icon: CalendarCheck, n: doneToday, label: 'Done today' },
  ];

  return (
    <>
      {/* Status tiles: click to filter */}
      <div className="fu-tiles">
        {TILES.map(({ key, icon: Icon, n, label, tone }) => (
          <button key={key} className={`stat-tile fu-tile ${tone ?? ''} ${tab === key ? 'selected' : ''}`} onClick={() => setTab(tab === key ? 'All' : key)}>
            <Icon className="stat-icon" size={22} />
            <div className="num">{n}</div>
            <div className="label">{label}</div>
          </button>
        ))}
      </div>

      {/* Calling executives */}
      <div className="panel fu-board-panel">
        <div className="panel-head">
          <h2>Calling executives</h2>
          <span className="panel-meta">follow-ups each · click to see theirs</span>
        </div>
        <div className="exec-board fu-board">
          {board.map(({ t, overdue, today, upcoming, kept }) => (
            <div
              key={t.id}
              className={`exec-load ${caller === t.id ? 'active' : ''} ${t.is_active ? '' : 'inactive'}`}
              role="button"
              tabIndex={0}
              onClick={() => setCaller(caller === t.id ? 'all' : t.id)}
              onKeyDown={e => { if (e.key === 'Enter') setCaller(caller === t.id ? 'all' : t.id); }}
            >
              <div className="exec-load-top">
                <div className="avatar">{initials(t.name)}</div>
                <div className="exec-load-who">
                  <div className="exec-load-name">{t.name}</div>
                  <div className="loc">{t.region}{!t.is_active && <> · <span className="chip muted">Inactive</span></>}</div>
                </div>
                <div className={`exec-load-num ${overdue ? 'text-warn' : ''}`} title="Overdue follow-ups">{overdue}</div>
              </div>
              <div className="fu-kept">
                <div className="exec-load-bar"><span style={{ width: `${kept ?? 0}%` }} /></div>
                <span>{kept === null ? 'no history' : `${kept}% kept`}</span>
              </div>
              <div className="exec-load-meta">
                <span>{today} today</span>
                <span>{upcoming} upcoming</span>
                <span className={overdue ? 'text-warn' : undefined}>{overdue} overdue</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* One filter menu, active filters as tags, export */}
      <div className="lf-bar fu-bar">
        <div className="lf-wrap" ref={menuRef}>
          <button className={`lf-trigger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="dialog">
            <SlidersHorizontal size={15} /> Filters
            {tags.length > 0 && <span className="lf-count">{tags.length}</span>}
            <ChevronDown size={15} className="lf-caret" />
          </button>
          {menuOpen && (
            <div className="lf-menu fu-menu" role="dialog" aria-label="Filter follow-ups">
              <div className="lf-section">
                <div className="lf-title">Status</div>
                {STATUS.map(s => (
                  <button key={s.key} className={`lf-option ${tab === s.key ? 'on' : ''}`} onClick={() => setTab(s.key)}>
                    <span className="lf-radio" />
                    <span className="lf-opt-text">{s.key}<small>{s.hint}</small></span>
                    <span className="lf-n">{countOf(s.key)}</span>
                  </button>
                ))}
              </div>
              <div className="lf-section">
                <div className="lf-title">Calling executive</div>
                <button className={`lf-option ${caller === 'all' ? 'on' : ''}`} onClick={() => setCaller('all')}>
                  <span className="lf-radio" />Everyone
                </button>
                {TELECALLERS.map(t => (
                  <button key={t.id} className={`lf-option ${caller === t.id ? 'on' : ''}`} onClick={() => setCaller(t.id)}>
                    <span className="lf-radio" />{t.name}
                    {t.is_active ? <span className="lf-n">{data.followups.filter(f => f.caller_id === t.id && isOverdue(f)).length} overdue</span> : <span className="lf-n muted">inactive</span>}
                  </button>
                ))}
              </div>
              <div className="lf-foot">
                <button className="link-btn lf-reset" onClick={clearFilters}>Reset all</button>
                <button className="btn-primary btn-small" onClick={() => setMenuOpen(false)}>Show {rows.length} follow-ups</button>
              </div>
            </div>
          )}
        </div>

        <div className="lf-tags">
          {tags.map(tag => (
            <span key={tag.key} className="lf-tag">
              <span className="lf-tag-k">{tag.k}</span> {tag.v}
              <button onClick={tag.clear} aria-label={`Remove ${tag.k} filter`}><X size={12} /></button>
            </span>
          ))}
          {tags.length > 0 && <button className="link-btn lf-clear" onClick={clearFilters}>Clear all</button>}
        </div>

        <span className="lf-total">{rows.length} follow-ups</span>
        <ExportMenu onExport={runExport} />
      </div>

      <div className="panel">
        <div className="table-wrap fu-table-wrap">
          <table className="orders-table fu-table">
            <thead>
              <tr><th>Due</th><th>Lead</th><th>Reason</th><th>Calling executive</th><th>Last call</th><th>Status</th><th>Move to</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={7} text={`No ${tab === 'All' ? '' : `${tab.toLowerCase()} `}follow-ups${caller === 'all' ? '' : ` for ${callerName(caller)}`}.`} />}
              {rows.map(r => {
                const lead = r.lead;
                // A picker to hand an unassigned lead out, or move an uncalled one to someone who can call.
                const picker = (label: string, excludeId: number) => lead && (
                  <select
                    className="reassign"
                    value=""
                    aria-label={`${label} ${lead.customer_name}`}
                    onChange={e => onReassign([lead.id], Number(e.target.value))}
                  >
                    <option value="" disabled>{label}…</option>
                    {TELECALLERS.filter(x => x.is_active && x.id !== excludeId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                );

                if (r.kind === 'followup') {
                  const f = r.f;
                  const last = lastCallFor(f.lead_id, data.activities);
                  const t = r.tab;
                  const owner = TELECALLERS.find(x => x.id === f.caller_id);
                  return (
                    <tr key={r.key} className={t === 'Overdue' ? 'fu-row-overdue' : undefined}>
                      <td className="due-cell">
                        <div className={t === 'Overdue' ? 'text-warn strong' : 'strong'}>{f.due_at.startsWith(TODAY) ? `Today, ${time12(f.due_at)}` : shortDate(f.due_at)}</div>
                        {t === 'Overdue' && <span className="fu-late">{daysLate(f)} {daysLate(f) === 1 ? 'day' : 'days'} late</span>}
                      </td>
                      <td className="cust">
                        {lead?.customer_name ?? '—'}
                        {lead && <div className="loc">{lead.phone} · {stageName(lead.stage_id)}</div>}
                      </td>
                      <td>{f.note}</td>
                      <td>
                        {callerName(f.caller_id)}
                        {owner && !owner.is_active && <div><span className="chip muted">Inactive</span></div>}
                      </td>
                      <td>{last ? <>{last.note}<div className="loc">{ago(last.created_at)}</div></> : <span className="loc">Never</span>}</td>
                      <td><StatusChip status={f.status === 'missed' ? 'Missed' : t} /></td>
                      <td>{t !== 'Done' && picker('Move to', f.caller_id)}</td>
                    </tr>
                  );
                }

                // Stuck lead surfaced automatically (unassigned too long, or uncalled too long).
                const unassigned = r.kind === 'unassigned';
                return (
                  <tr key={r.key} className="fu-row-overdue">
                    <td className="due-cell">
                      <div className="text-warn strong">{shortDate(r.lead.created_at)}</div>
                      <span className="fu-late">{r.days} {r.days === 1 ? 'day' : 'days'} {unassigned ? 'unassigned' : 'no call'}</span>
                    </td>
                    <td className="cust">
                      {r.lead.customer_name}
                      <div className="loc">{r.lead.phone} · {r.lead.source}</div>
                    </td>
                    <td>{reasonOf(r)}</td>
                    <td>
                      {unassigned
                        ? <span className="chip pending">Unassigned</span>
                        : <>{callerName(r.lead.assigned_to)}{!TELECALLERS.find(x => x.id === r.lead.assigned_to)?.is_active && <div><span className="chip muted">Inactive</span></div>}</>}
                    </td>
                    <td><span className="loc">Never</span></td>
                    <td><span className="chip pending">{unassigned ? 'Unassigned' : 'Not called'}</span></td>
                    <td>{unassigned ? picker('Assign to', 0) : picker('Move to', r.lead.assigned_to)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Phones: the same follow-ups as cards (the table above is hidden there), no sideways scrolling. */}
        <div className="fu-cards-wrap">
          {rows.length === 0 ? (
            <p className="fu-cards-empty">{`No ${tab === 'All' ? '' : `${tab.toLowerCase()} `}follow-ups${caller === 'all' ? '' : ` for ${callerName(caller)}`}.`}</p>
          ) : (
            <ul className="fu-cards" aria-label="Follow-ups">
              {rows.map(r => <li key={r.key}>{followCard(r)}</li>)}
            </ul>
          )}
        </div>
      </div>
    </>
  );

  /** A picker to hand a lead to an active executive (same choices as the table's "Move to" / "Assign to"). */
  function cardPicker(lead: TrackerLead, label: string, excludeId: number) {
    return (
      <select
        className="reassign fu-card-picker"
        value=""
        aria-label={`${label} ${lead.customer_name}`}
        onChange={e => onReassign([lead.id], Number(e.target.value))}
      >
        <option value="" disabled>{label}…</option>
        {TELECALLERS.filter(x => x.is_active && x.id !== excludeId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    );
  }

  /** One follow-up as a card: everything its table row shows, stacked to fit a phone. */
  function followCard(r: FollowRow) {
    if (r.kind === 'followup') {
      const f = r.f;
      const lead = r.lead;
      const last = lastCallFor(f.lead_id, data.activities);
      const t = r.tab;
      const owner = TELECALLERS.find(x => x.id === f.caller_id);
      return (
        <article className={`fu-card ${t === 'Overdue' ? 'overdue' : ''}`}>
          <div className="fu-card-head">
            <div className="fu-card-who">
              <span className="fu-card-name">{lead?.customer_name ?? '—'}</span>
              {lead && <span className="fu-card-sub">{lead.phone} · {stageName(lead.stage_id)}</span>}
            </div>
            <StatusChip status={f.status === 'missed' ? 'Missed' : t} />
          </div>
          <dl className="fu-card-rows">
            <div>
              <dt>Due</dt>
              <dd>
                <span className={t === 'Overdue' ? 'text-warn strong' : 'strong'}>{f.due_at.startsWith(TODAY) ? `Today, ${time12(f.due_at)}` : shortDate(f.due_at)}</span>
                {t === 'Overdue' && <span className="fu-late">{daysLate(f)} {daysLate(f) === 1 ? 'day' : 'days'} late</span>}
              </dd>
            </div>
            <div><dt>Reason</dt><dd>{f.note || '—'}</dd></div>
            <div>
              <dt>Executive</dt>
              <dd>{callerName(f.caller_id)}{owner && !owner.is_active && <span className="chip muted">Inactive</span>}</dd>
            </div>
            <div>
              <dt>Last call</dt>
              <dd>{last ? <>{last.note}<span className="loc">{ago(last.created_at)}</span></> : <span className="loc">Never</span>}</dd>
            </div>
          </dl>
          {t !== 'Done' && lead && cardPicker(lead, 'Move to', f.caller_id)}
        </article>
      );
    }

    // Stuck lead surfaced automatically (unassigned too long, or uncalled too long).
    const unassigned = r.kind === 'unassigned';
    return (
      <article className="fu-card overdue">
        <div className="fu-card-head">
          <div className="fu-card-who">
            <span className="fu-card-name">{r.lead.customer_name}</span>
            <span className="fu-card-sub">{r.lead.phone} · {r.lead.source}</span>
          </div>
          <span className="chip pending">{unassigned ? 'Unassigned' : 'Not called'}</span>
        </div>
        <dl className="fu-card-rows">
          <div>
            <dt>Due</dt>
            <dd>
              <span className="text-warn strong">{shortDate(r.lead.created_at)}</span>
              <span className="fu-late">{r.days} {r.days === 1 ? 'day' : 'days'} {unassigned ? 'unassigned' : 'no call'}</span>
            </dd>
          </div>
          <div><dt>Reason</dt><dd>{reasonOf(r)}</dd></div>
          <div>
            <dt>Executive</dt>
            <dd>
              {unassigned
                ? <span className="chip pending">Unassigned</span>
                : <>{callerName(r.lead.assigned_to)}{!TELECALLERS.find(x => x.id === r.lead.assigned_to)?.is_active && <span className="chip muted">Inactive</span>}</>}
            </dd>
          </div>
          <div><dt>Last call</dt><dd><span className="loc">Never</span></dd></div>
        </dl>
        {unassigned ? cardPicker(r.lead, 'Assign to', 0) : cardPicker(r.lead, 'Move to', r.lead.assigned_to)}
      </article>
    );
  }
}
