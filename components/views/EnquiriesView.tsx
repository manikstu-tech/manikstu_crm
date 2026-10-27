import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Briefcase, CheckCheck, ChevronDown, Eye, Handshake, HelpCircle, Inbox, Mail, MailQuestion, MessageCircle, Phone,
  Search, ShoppingCart, SlidersHorizontal, Upload, UserCheck, X, type LucideIcon,
} from 'lucide-react';
import {
  TODAY,
  TELECALLERS,
  VERTICALS,
  EnquiryStatus,
  EnquiryType,
  LeadActivity,
  SalesOrder,
  TrackerLead,
  WebEnquiry,
} from '../../data/managerDashboard';
import { MONTH, ORDER_CHIP, ago, daysBefore, nowStamp, rupees, shortDate, shortDateTime } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import AssignEnquiryModal from './AssignEnquiryModal';
import ImportEnquiries from './ImportEnquiries';
import type { NewEnquiryData } from '../../lib/trackerOps';
import { stageName } from '../telecaller/tcData';
import CardTable from '../CardTable';

interface EnquiriesViewProps {
  enquiries: WebEnquiry[];
  onEnquiriesChange: React.Dispatch<React.SetStateAction<WebEnquiry[]>>;
  leads: TrackerLead[];
  orders: SalesOrder[];
  /** Manager: turn one sales / general enquiry into a lead from the detail panel. */
  onConvertToLead?: (enquiry: WebEnquiry, verticalId: number, callerId: number) => void;
  /**
   * Telecalling head: assign enquiries to a caller (row, bulk and detail panel), each becoming or
   * moving their lead. Turns on the Caller column and the assign picker.
   */
  onAssignToCaller?: (enquiries: WebEnquiry[], callerId: number, verticalId: number | 'auto') => Promise<boolean>;
  /** Calls (shared data), for the assign picker's hints. */
  activities?: LeadActivity[];
  /** Telecalling head: import enquiries from Excel / CSV / PDF (Import button next to Export). */
  onImportEnquiries?: (enquiries: NewEnquiryData[], assignSalesTo: number | null) => Promise<boolean>;
  /** Career enquiries → User onboarding (manager only). */
  onMoveToOnboarding?: (enquiry: WebEnquiry) => void;
  onToast: (message: string) => void;
  initialQuery?: string;
}

const STATUSES: EnquiryStatus[] = ['new', 'read', 'replied', 'archived'];
const TYPES: EnquiryType[] = ['sales', 'partnership', 'career', 'general'];
const STATUS_CHIP: Record<EnquiryStatus, string> = { new: 'pending', read: 'transit', replied: 'delivered', archived: 'muted' };
const PAGE_SIZE = 15;

type Alert = 'new-24h' | 'sales-2d' | 'read-no-reply';
type DateRange = '7d' | 'month' | 'all';

const ALERTS: Record<Alert, { label: string; test: (e: WebEnquiry) => boolean }> = {
  'new-24h': { label: 'new for over 24 hours', test: e => e.status === 'new' && daysBefore(e.created_at) >= 1 },
  'sales-2d': { label: 'sales enquiries unanswered 2+ days', test: e => e.type === 'sales' && (e.status === 'new' || e.status === 'read') && daysBefore(e.created_at) >= 2 },
  'read-no-reply': { label: 'read but never replied', test: e => e.status === 'read' },
};

const TYPE_ICON: Record<EnquiryType, LucideIcon> = { sales: ShoppingCart, partnership: Handshake, career: Briefcase, general: HelpCircle };
const ALERT_ICON: Record<Alert, LucideIcon> = { 'new-24h': AlertTriangle, 'sales-2d': ShoppingCart, 'read-no-reply': MailQuestion };
// Type colours in bar order, checked for colour-blind separation; the legend always names them.
const TYPE_COLOR: Record<EnquiryType, string> = { sales: '#174B32', partnership: '#2A78D6', career: '#DCA72B', general: '#8A7FD0' };
const RANGE_LABEL: Record<DateRange, string> = { '7d': 'Last 7 days', month: 'This month', all: 'All time' };

const hoursBetween = (from: string, to: string) =>
  (new Date(`${to}:00`).getTime() - new Date(`${from}:00`).getTime()) / 3_600_000;
const callerName = (id: number) => TELECALLERS.find(t => t.id === id)?.name ?? '—';
const firstName = (name: string) => name.split(' ')[0];

const replyTemplate = (e: WebEnquiry) =>
  `Hello ${firstName(e.name)},\n\nThank you for contacting Manikstu Agri Network.\n\n\n\nRegards,\nManikstu Team\n+91 674 290182`;

export default function EnquiriesView({
  enquiries,
  onEnquiriesChange,
  leads,
  orders,
  onConvertToLead,
  onAssignToCaller,
  activities = [],
  onImportEnquiries,
  onMoveToOnboarding,
  onToast,
  initialQuery,
}: EnquiriesViewProps) {
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<EnquiryType | 'all'>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [alert, setAlert] = useState<Alert | null>(null);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [leadVertical, setLeadVertical] = useState(VERTICALS[0].id);
  const [leadCaller, setLeadCaller] = useState(TELECALLERS[0]?.id ?? 0);
  const canAssign = !!onAssignToCaller;
  /** Enquiries being assigned to a caller (null = picker closed). */
  const [assignIds, setAssignIds] = useState<number[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (ev: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuOpen(false); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  /** The lead an enquiry became: linked by id, or (assign mode) the lead with the same phone number. */
  const leadFor = (e: WebEnquiry) =>
    (e.lead_id !== null ? leads.find(l => l.id === e.lead_id) : undefined) ??
    (canAssign && e.phone ? leads.find(l => l.phone === e.phone) : undefined);

  // 1. Summary tiles
  const month = enquiries.filter(e => e.created_at.startsWith(MONTH));
  const newOnes = enquiries.filter(e => e.status === 'new');
  const repliedMonth = enquiries.filter(e => e.replied_at?.startsWith(MONTH));
  const avgReplyHours = repliedMonth.length
    ? repliedMonth.reduce((a, e) => a + hoursBetween(e.created_at, e.replied_at!), 0) / repliedMonth.length
    : 0;
  const tiles = {
    newCount: newOnes.length,
    oldestNew: Math.max(0, ...newOnes.map(e => daysBefore(e.created_at))),
    waiting: enquiries.filter(e => e.status === 'read').length,
    replied: repliedMonth.length,
    avgReply: avgReplyHours >= 24 ? `${(avgReplyHours / 24).toFixed(1)} days` : `${Math.round(avgReplyHours)} h`,
    sales: month.filter(e => e.type === 'sales').length,
    partnership: month.filter(e => e.type === 'partnership').length,
    career: month.filter(e => e.type === 'career').length,
    monthTotal: month.length,
  };

  // 2–3. Filtering
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enquiries.filter(e => {
      if (alert) return ALERTS[alert].test(e);
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      const age = daysBefore(e.created_at);
      if (dateRange === '7d' && age > 6) return false;
      if (dateRange === 'month' && !e.created_at.startsWith(MONTH)) return false;
      if (q && ![e.name, e.email, e.phone ?? ''].some(v => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [enquiries, alert, typeFilter, dateRange, query]);

  const filtered = statusFilter === 'all' ? baseFiltered : baseFiltered.filter(e => e.status === statusFilter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const open = enquiries.find(e => e.id === openId) ?? null;
  const resetPage = () => { setPage(0); setSelected(new Set()); };

  const assignedCount = enquiries.filter(e => leadFor(e)).length;
  const FLOW: { key: string; icon: LucideIcon; n: number; label: string; note: string; filter?: EnquiryStatus }[] = [
    { key: 'new', icon: Inbox, n: tiles.newCount, label: 'New', note: tiles.newCount ? `oldest ${tiles.oldestNew} days` : 'all opened', filter: 'new' },
    { key: 'read', icon: Eye, n: tiles.waiting, label: 'Read', note: 'waiting for reply', filter: 'read' },
    { key: 'replied', icon: CheckCheck, n: tiles.replied, label: 'Replied', note: `this month · avg ${tiles.avgReply}`, filter: 'replied' },
    { key: 'assigned', icon: UserCheck, n: assignedCount, label: 'Assigned', note: canAssign ? 'to callers as leads' : 'turned into leads' },
  ];

  // Active filters, shown as removable tags
  const filterTags = [
    alert && { key: 'alert', k: 'Needs action', v: ALERTS[alert].label, clear: () => { setAlert(null); resetPage(); } },
    !alert && statusFilter !== 'all' && { key: 'status', k: 'Status', v: statusFilter[0].toUpperCase() + statusFilter.slice(1), clear: () => { setStatusFilter('all'); resetPage(); } },
    !alert && typeFilter !== 'all' && { key: 'type', k: 'Type', v: typeFilter[0].toUpperCase() + typeFilter.slice(1), clear: () => { setTypeFilter('all'); resetPage(); } },
    !alert && dateRange !== 'all' && { key: 'range', k: 'Received', v: RANGE_LABEL[dateRange], clear: () => { setDateRange('all'); resetPage(); } },
  ].filter(Boolean) as { key: string; k: string; v: string; clear: () => void }[];
  const clearFilters = () => { setAlert(null); setStatusFilter('all'); setTypeFilter('all'); setDateRange('all'); setQuery(''); resetPage(); };

  // ---- Updates -----------------------------------------------------------------------------
  const patch = (ids: number[], change: (e: WebEnquiry) => WebEnquiry | null, message: string) => {
    let changed = 0;
    const next = enquiries.map(e => {
      if (!ids.includes(e.id)) return e;
      const updated = change(e);
      if (updated) changed++;
      return updated ?? e;
    });
    if (changed === 0) {
      onToast('Nothing to change for the selected enquiries');
      return;
    }
    onEnquiriesChange(next);
    onToast(message.replace('{n}', String(changed)));
  };

  const markRead = (ids: number[]) =>
    patch(ids, e => (e.status === 'new' ? { ...e, status: 'read' } : null), ids.length === 1 ? 'Marked as read' : '{n} marked as read');
  const markReplied = (ids: number[]) =>
    patch(ids, e => (e.status === 'new' || e.status === 'read' ? { ...e, status: 'replied', replied_at: nowStamp() } : null),
      ids.length === 1 ? 'Marked as replied' : '{n} marked as replied');
  const archive = (ids: number[]) =>
    patch(ids, e => (e.status !== 'archived' ? { ...e, status: 'archived' } : null), ids.length === 1 ? 'Archived' : '{n} archived');
  const restore = (id: number) =>
    patch([id], e => ({ ...e, status: e.replied_at ? 'replied' : 'read' }), 'Moved back to inbox');

  const openEnquiry = (e: WebEnquiry) => {
    setOpenId(e.id);
    setReplyDraft(replyTemplate(e));
    setNoteDraft(e.admin_notes ?? '');
    // Same as the backend: opening a new enquiry marks it read.
    if (e.status === 'new') onEnquiriesChange(prev => prev.map(x => (x.id === e.id ? { ...x, status: 'read' } : x)));
  };

  const saveNote = (id: number) => {
    onEnquiriesChange(prev => prev.map(e => (e.id === id ? { ...e, admin_notes: noteDraft.trim() || null } : e)));
    onToast('Note saved');
  };

  const exportRows = async (rows: WebEnquiry[], format: ExportFormat, scope: string) => {
    if (rows.length === 0) {
      onToast('No enquiries to export');
      return;
    }
    try {
      await exportTable(format, {
        filename: `enquiries-${TODAY}`,
        title: 'Website Enquiries',
        subtitle: `${rows.length} ${rows.length === 1 ? 'enquiry' : 'enquiries'} · ${scope} · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Received', width: 16 },
          { header: 'Name', width: 20 },
          { header: 'Email', width: 28 },
          { header: 'Phone', width: 13 },
          { header: 'Type', width: 11 },
          { header: 'Status', width: 10 },
          { header: 'Replied', width: 16 },
          { header: 'Message', width: 50 },
          { header: 'Notes', width: 26 },
        ],
        rows: rows.map(e => [
          shortDateTime(e.created_at), e.name, e.email, e.phone, e.type, e.status,
          e.replied_at ? shortDateTime(e.replied_at) : '', e.message, e.admin_notes,
        ]),
      });
      onToast(`Exported ${rows.length} ${rows.length === 1 ? 'enquiry' : 'enquiries'} to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  // ---- Selection ---------------------------------------------------------------------------
  const allOnPageSelected = pageRows.length > 0 && pageRows.every(e => selected.has(e.id));
  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const togglePage = () => setSelected(prev => {
    const next = new Set(prev);
    pageRows.forEach(e => (allOnPageSelected ? next.delete(e.id) : next.add(e.id)));
    return next;
  });
  const selectedIds = Array.from(selected);

  // Detail panel extras
  const pastOrders = open?.phone ? orders.filter(o => o.phone === open.phone) : [];
  const linkedLead = open ? leadFor(open) : undefined;
  const mailto = open
    ? `mailto:${open.email}?subject=${encodeURIComponent('Re: your enquiry to Manikstu')}&body=${encodeURIComponent(replyDraft)}`
    : '';

  return (
    <>
      {/* 1. Inbox overview: reply flow, mix by type, what needs action */}
      <div className="panel oj enq-inbox">
        <div className="panel-head">
          <h2>Enquiry inbox</h2>
          <span className="panel-meta">{tiles.monthTotal} this month · replies take {tiles.avgReply} on average</span>
        </div>

        <div className="enq-overview">
          <div>
            <div className="enq-sub">Reply flow · click a step</div>
            <ol className="oj-route enq-flow">
              {FLOW.map(({ key, icon: Icon, n, label, note, filter }) => {
                const on = !!filter && !alert && statusFilter === filter;
                const body = (
                  <>
                    <span className="oj-icon"><Icon size={19} /></span>
                    <span className="oj-n">{n}</span>
                    <span className="oj-label">{label}</span>
                    <span className="oj-note">{note}</span>
                  </>
                );
                return (
                  <li key={key} className={`oj-stop ${n > 0 ? 'has' : ''} ${on ? 'on' : ''} ${key === 'assigned' ? 'last' : ''} ${key === 'new' && n > 0 ? 'urgent' : ''}`}>
                    {filter
                      ? <button onClick={() => { setStatusFilter(on ? 'all' : filter); setAlert(null); resetPage(); }} aria-pressed={on}>{body}</button>
                      : <div className="oj-static">{body}</div>}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="enq-mix">
            <div className="enq-sub">By type · this month</div>
            <div className="enq-bar" role="img" aria-label={TYPES.map(t => `${t}: ${month.filter(e => e.type === t).length}`).join(', ')}>
              {TYPES.map(t => {
                const n = month.filter(e => e.type === t).length;
                return n > 0 && <span key={t} style={{ flex: n, background: TYPE_COLOR[t] }} title={`${t}: ${n}`} />;
              })}
            </div>
            <ul className="enq-legend">
              {TYPES.map(t => {
                const Icon = TYPE_ICON[t];
                const on = !alert && typeFilter === t;
                const openN = enquiries.filter(e => e.type === t && (e.status === 'new' || e.status === 'read')).length;
                return (
                  <li key={t}>
                    <button className={on ? 'on' : ''} onClick={() => { setTypeFilter(on ? 'all' : t); setAlert(null); resetPage(); }}>
                      <span className="enq-swatch" style={{ background: TYPE_COLOR[t] }} />
                      <Icon size={14} className="enq-legend-icon" />
                      <span className="enq-legend-label">{t[0].toUpperCase() + t.slice(1)}</span>
                      <span className="enq-legend-n">{month.filter(e => e.type === t).length}</span>
                      <span className={`enq-legend-open ${openN ? 'warn' : ''}`}>{openN} open</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="oj-actions enq-actions">
          <span className="oj-actions-title">Needs action</span>
          {(Object.keys(ALERTS) as Alert[]).map(key => {
            const n = enquiries.filter(ALERTS[key].test).length;
            const Icon = ALERT_ICON[key];
            return (
              <button key={key} className={`oj-action ${n > 0 ? 'hot' : ''} ${alert === key ? 'on' : ''}`} onClick={() => { setAlert(alert === key ? null : key); setStatusFilter('all'); resetPage(); }}>
                <Icon size={16} />
                <span className="oj-action-n">{n}</span>
                <span className="oj-action-label">{ALERTS[key].label[0].toUpperCase() + ALERTS[key].label.slice(1)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. One filter menu, tags, search, import / export */}
      <div className="lf-bar enq-bar">
        <div className="lf-wrap" ref={menuRef}>
          <button className={`lf-trigger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="dialog">
            <SlidersHorizontal size={15} /> Filters
            {filterTags.length > 0 && <span className="lf-count">{filterTags.length}</span>}
            <ChevronDown size={15} className="lf-caret" />
          </button>
          {menuOpen && (
            <div className="lf-menu enq-menu" role="dialog" aria-label="Filter enquiries">
              <div className="lf-section">
                <div className="lf-title">Status</div>
                {(['all', ...STATUSES] as const).map(st => (
                  <button key={st} className={`lf-option ${!alert && statusFilter === st ? 'on' : ''}`} onClick={() => { setStatusFilter(st); setAlert(null); resetPage(); }}>
                    <span className="lf-radio" />{st === 'all' ? 'All statuses' : st[0].toUpperCase() + st.slice(1)}
                    <span className="lf-n">{st === 'all' ? baseFiltered.length : baseFiltered.filter(e => e.status === st).length}</span>
                  </button>
                ))}
              </div>
              <div className="lf-section">
                <div className="lf-title">Type</div>
                <div className="lf-pills">
                  <button className={`lf-pill ${typeFilter === 'all' ? 'on' : ''}`} onClick={() => { setTypeFilter('all'); setAlert(null); resetPage(); }}>All</button>
                  {TYPES.map(t => (
                    <button key={t} className={`lf-pill ${typeFilter === t ? 'on' : ''}`} onClick={() => { setTypeFilter(t); setAlert(null); resetPage(); }}>{t[0].toUpperCase() + t.slice(1)}</button>
                  ))}
                </div>
                <div className="lf-title lf-sub">Received</div>
                <div className="lf-pills">
                  {([['7d', 'Last 7 days'], ['month', 'This month'], ['all', 'All time']] as [DateRange, string][]).map(([k, label]) => (
                    <button key={k} className={`lf-pill ${dateRange === k ? 'on' : ''}`} onClick={() => { setDateRange(k); setAlert(null); resetPage(); }}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="lf-foot">
                <button className="link-btn lf-reset" onClick={clearFilters}>Reset all</button>
                <button className="btn-primary btn-small" onClick={() => setMenuOpen(false)}>Show {filtered.length} enquiries</button>
              </div>
            </div>
          )}
        </div>

        <div className="lf-tags">
          {filterTags.map(tag => (
            <span key={tag.key} className="lf-tag">
              <span className="lf-tag-k">{tag.k}</span> {tag.v}
              <button onClick={tag.clear} aria-label={`Remove ${tag.k} filter`}><X size={12} /></button>
            </span>
          ))}
          {filterTags.length > 0 && <button className="link-btn lf-clear" onClick={clearFilters}>Clear all</button>}
        </div>

        <div className="search enq-search">
          <Search size={15} style={{ color: 'var(--ink-soft)' }} />
          <input type="search" placeholder="Search name, email, phone…" value={query} onChange={e => { setQuery(e.target.value); resetPage(); }} />
        </div>
        <span className="lf-total">{filtered.length} enquiries</span>
        {onImportEnquiries && (
          <button className="btn-secondary import-btn" onClick={() => setImportOpen(true)}><Upload size={15} /> Import</button>
        )}
        <ExportMenu onExport={format => exportRows(filtered, format, 'current filters')} />
      </div>

      {/* 4. Bulk actions */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <strong>{selected.size} selected</strong>
          <button className="btn-secondary btn-small" onClick={() => markRead(selectedIds)}>Mark read</button>
          <button className="btn-secondary btn-small" onClick={() => markReplied(selectedIds)}>Mark replied</button>
          <button className="btn-secondary btn-small" onClick={() => archive(selectedIds)}>Archive</button>
          {canAssign && <button className="btn-primary btn-small" onClick={() => setAssignIds(selectedIds)}>Assign to caller…</button>}
          <ExportMenu small label="Export selected" onExport={format => exportRows(enquiries.filter(e => selected.has(e.id)), format, 'selected')} />
          <button className="link-btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* 5. Inbox */}
      <div className="panel">
        <CardTable>
          <table className="orders-table enquiries-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={allOnPageSelected} onChange={togglePage} aria-label="Select all on this page" /></th>
                <th>From</th>
                <th>Type</th>
                <th>Message</th>
                <th>Received</th>
                <th>Status</th>
                {canAssign && <th>Caller</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={canAssign ? 8 : 7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 0' }}>
                    No enquiries match these filters.
                  </td>
                </tr>
              ) : pageRows.map(e => {
                const age = daysBefore(e.created_at);
                const late = (e.status === 'new' && age >= 1) || ALERTS['sales-2d'].test(e);
                const lead = leadFor(e);
                return (
                  <tr key={e.id} className={`${e.status === 'new' ? 'row-unread' : ''} ${selected.has(e.id) ? 'row-selected' : ''}`}>
                    <td><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Select enquiry from ${e.name}`} /></td>
                    <td className="cust">
                      <button className="link-btn enq-name" onClick={() => openEnquiry(e)}>{e.name}</button>
                      {e.customer_id !== null && <span className="type-tag customer-tag">Customer</span>}
                      <div className="loc">{e.email}{e.phone ? ` · ${e.phone}` : ''}</div>
                    </td>
                    <td><span className={`type-tag enq-type ${e.type}`}>{e.type}</span></td>
                    <td className="enq-message">
                      <span>{e.message}</span>
                      {lead && <div className="loc">→ Lead #{lead.id}{canAssign ? ` · ${stageName(lead.stage_id)}` : ''}</div>}
                    </td>
                    <td>
                      {shortDateTime(e.created_at)}
                      <div className={`loc ${late ? 'text-warn' : ''}`}>{ago(e.created_at)}</div>
                    </td>
                    <td><span className={`chip ${STATUS_CHIP[e.status]}`}>{e.status}</span></td>
                    {canAssign && <td>{lead ? callerName(lead.assigned_to) : <span className="loc">Not assigned</span>}</td>}
                    <td>
                      <div className="row-actions">
                        {canAssign && e.status !== 'archived' && e.type !== 'career' && (
                          <button
                            className={lead ? 'kanban-btn' : 'btn-primary btn-small'}
                            disabled={!e.phone}
                            title={e.phone ? undefined : 'No phone number: reply by email and ask for one first'}
                            onClick={() => setAssignIds([e.id])}
                          >
                            {lead ? 'Reassign' : 'Assign'}
                          </button>
                        )}
                        <button className="kanban-btn" onClick={() => openEnquiry(e)}>{e.status === 'replied' || e.status === 'archived' ? 'View' : 'Reply'}</button>
                        {e.status === 'archived'
                          ? <button className="kanban-btn" onClick={() => restore(e.id)}>Restore</button>
                          : <button className="kanban-btn" onClick={() => archive([e.id])}>Archive</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
        <div className="pager">
          <span>{filtered.length === 0 ? '0 enquiries' : `${safePage * PAGE_SIZE + 1}–${Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of ${filtered.length} enquiries`}</span>
          <div className="pager-btns">
            <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button className="btn-secondary btn-small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </div>
      </div>

      <div className="panel-note">
        Sample data. The backend doesn’t send reply emails or store the reply text, who replied, who the enquiry is assigned to,
        the lead it was converted to, or which page it came from.
      </div>

      {/* 6. Detail drawer */}
      {open && (
        <>
          <div className="drawer-overlay" onClick={() => setOpenId(null)} />
          <aside className="order-drawer" role="dialog" aria-label={`Enquiry from ${open.name}`}>
            <div className="drawer-head">
              <div>
                <h3>{open.name}</h3>
                <div className="loc">
                  <span className={`type-tag enq-type ${open.type}`}>{open.type}</span>{' '}
                  <span className={`chip ${STATUS_CHIP[open.status]}`}>{open.status}</span>{' '}
                  · received {shortDateTime(open.created_at)}
                </div>
              </div>
              <button className="modal-close" onClick={() => setOpenId(null)} aria-label="Close"><X size={20} /></button>
            </div>

            <div className="drawer-body">
              <section className="od-section">
                <div className="od-label">Message</div>
                <p className="enq-full-message">{open.message}</p>
              </section>

              <section className="od-section">
                <div className="od-label">Contact</div>
                <div className="loc" style={{ marginBottom: 10 }}>{open.email}{open.phone ? ` · ${open.phone}` : ' · no phone given'}</div>
                <div className="contact-btns">
                  {open.phone && <a className="call-btn" href={`tel:+91${open.phone}`}><Phone size={13} /> Call</a>}
                  <a className="call-btn" href={`mailto:${open.email}`}><Mail size={13} /> Email</a>
                  {open.phone && (
                    <a className="call-btn whatsapp" href={`https://wa.me/91${open.phone}?text=${encodeURIComponent(`Hello ${firstName(open.name)}, this is Manikstu Agri Network replying to your enquiry.`)}`} target="_blank" rel="noreferrer">
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                </div>
              </section>

              {open.status !== 'archived' && (
                <section className="od-section">
                  <div className="od-label">Reply {open.replied_at && <span className="od-label-note">· last replied {shortDateTime(open.replied_at)}</span>}</div>
                  <textarea className="od-notes" rows={7} value={replyDraft} onChange={e => setReplyDraft(e.target.value)} />
                  <a
                    className="btn-primary btn-small"
                    href={mailto}
                    onClick={() => { if (open.status !== 'replied') markReplied([open.id]); }}
                  >
                    Open in email app &amp; mark replied
                  </a>
                </section>
              )}

              {canAssign && open.type !== 'career' && (
                <section className="od-section">
                  <div className="od-label">Telecalling</div>
                  {!open.phone ? (
                    <div className="loc">No phone number, so this can’t go to a telecaller. Reply by email first and ask for a number.</div>
                  ) : (
                    <div className="od-customer">
                      <div>
                        {linkedLead ? (
                          <>
                            Lead #{linkedLead.id} · assigned to <strong>{callerName(linkedLead.assigned_to)}</strong>
                            <div className="loc">Status: {stageName(linkedLead.stage_id)}</div>
                          </>
                        ) : (
                          <span className="loc">Not assigned to a caller yet.</span>
                        )}
                      </div>
                      <button className={linkedLead ? 'btn-secondary btn-small' : 'btn-primary btn-small'} onClick={() => setAssignIds([open.id])}>
                        {linkedLead ? 'Reassign' : 'Assign to caller'}
                      </button>
                    </div>
                  )}
                </section>
              )}

              {!canAssign && onConvertToLead && (open.type === 'sales' || open.type === 'general') && (
                <section className="od-section">
                  <div className="od-label">Telecalling lead</div>
                  {linkedLead ? (
                    <div className="loc">
                      Converted to lead #{linkedLead.id} · assigned to <strong>{callerName(linkedLead.assigned_to)}</strong>
                    </div>
                  ) : !open.phone ? (
                    <div className="loc">No phone number, so this can’t go to a telecaller. Reply by email first and ask for a number.</div>
                  ) : (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Vertical</label>
                          <select value={leadVertical} onChange={e => setLeadVertical(Number(e.target.value))}>
                            {VERTICALS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Assign to</label>
                          <select value={leadCaller} onChange={e => setLeadCaller(Number(e.target.value))}>
                            {TELECALLERS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <button className="btn-secondary btn-small" onClick={() => onConvertToLead(open, leadVertical, leadCaller)}>
                        Convert to lead
                      </button>
                    </>
                  )}
                </section>
              )}

              {open.type === 'career' && onMoveToOnboarding && (
                <section className="od-section">
                  <div className="od-label">Hiring</div>
                  <button className="btn-secondary btn-small" onClick={() => onMoveToOnboarding(open)}>Move to User onboarding</button>
                </section>
              )}

              {open.customer_id !== null && (
                <section className="od-section">
                  <div className="od-label">Existing customer · {pastOrders.length} {pastOrders.length === 1 ? 'order' : 'orders'}</div>
                  <ul className="attn-list">
                    {pastOrders.slice(0, 4).map(o => (
                      <li key={o.id}>
                        <div>
                          <div className="name">{o.order_number}</div>
                          <div className="action">{o.items.map(it => it.product_name).join(', ')} · {shortDateTime(o.created_at)}</div>
                        </div>
                        <div className="attn-side">
                          <span className="strong">{rupees(o.total)}</span>
                          <span className={`chip ${ORDER_CHIP[o.status]}`} style={{ textTransform: 'capitalize' }}>{o.status}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="od-section">
                <div className="od-label">Admin notes</div>
                <textarea
                  className="od-notes"
                  rows={3}
                  placeholder="Add a note for the team…"
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                />
                {noteDraft !== (open.admin_notes ?? '') && (
                  <button className="btn-secondary btn-small" onClick={() => saveNote(open.id)}>Save note</button>
                )}
              </section>
            </div>

            <div className="drawer-actions">
              {(open.status === 'new' || open.status === 'read') && (
                <button className="btn-secondary" onClick={() => markReplied([open.id])}>Mark replied</button>
              )}
              {open.status === 'archived'
                ? <button className="btn-secondary" onClick={() => restore(open.id)}>Restore to inbox</button>
                : <button className="btn-secondary" onClick={() => { archive([open.id]); setOpenId(null); }}>Archive</button>}
            </div>
          </aside>
        </>
      )}
      {assignIds && onAssignToCaller && (
        <AssignEnquiryModal
          targets={enquiries.filter(e => assignIds.includes(e.id))}
          leads={leads}
          activities={activities}
          leadFor={leadFor}
          onAssign={async (callerId, verticalId) => {
            const ok = await onAssignToCaller(enquiries.filter(e => assignIds.includes(e.id)), callerId, verticalId);
            if (ok) { setAssignIds(null); setSelected(new Set()); }
          }}
          onClose={() => setAssignIds(null)}
        />
      )}
      {importOpen && onImportEnquiries && (
        <ImportEnquiries existing={enquiries} onImport={onImportEnquiries} onClose={() => setImportOpen(false)} />
      )}
    </>
  );
}
