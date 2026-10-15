import React, { useEffect, useRef, useState } from 'react';
import { LEAD_SOURCES, TELECALLERS, TODAY } from '../../data/managerDashboard';
import { ChevronDown, FileSpreadsheet, Shuffle, SlidersHorizontal, Upload, UserCheck, X } from 'lucide-react';
import { ago, daysBefore, shortDate } from '../../lib/format';
import Modal from '../Modal';
import ImportLeads, { NewLead } from './ImportLeads';
import { EmptyRow, StatusChip } from './shared';
import { TeamData, callerOf, callerName, isOpenLead, isWonLead, lastCallFor, stageName, stageOf } from './tcData';
import ExecDistributionTable from './ExecDistributionTable';
import type { WorkflowSummary } from '../../lib/leadWorkflow';

type Tab = 'open' | 'new-imports' | 'untouched' | 'completed' | 'all';
const PAGE_SIZE = 20;

interface Props {
  data: TeamData;
  /** Executive-wise distribution and progress, worked out from the shared tracker data. */
  execSummary: WorkflowSummary;
  searchQuery: string;
  initialCaller?: number;
  onReassign: (leadIds: number[], toCallerId: number) => void | Promise<void>;
  onImport: (leads: NewLead[]) => void;
  onToast: (message: string) => void;
}

/** Import leads and hand them out to the calling executives. */
export default function TeamLeads({ data, execSummary, searchQuery, initialCaller, onReassign, onImport, onToast }: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('open');
  const [caller, setCaller] = useState<number | 'all'>(initialCaller ?? 'all');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState<number>(TELECALLERS.find(t => t.is_active)?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the filter menu on an outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  // Status of a lead in the import → assign → call workflow
  const calledIds = new Set(data.activities.map(a => a.lead_id));
  const TABS: { key: Tab; label: string; hint: string; test: (l: typeof data.leads[number]) => boolean }[] = [
    { key: 'open', label: 'Open', hint: 'Still being worked', test: isOpenLead },
    { key: 'new-imports', label: 'New imports', hint: 'Added in the last 7 days, not called yet', test: l => daysBefore(l.created_at) < 7 && !calledIds.has(l.id) },
    { key: 'untouched', label: 'Untouched', hint: 'Open, no activity for 3+ days', test: l => isOpenLead(l) && daysBefore(l.updated_at) >= 3 },
    { key: 'completed', label: 'Completed', hint: 'Won or lost', test: l => !isOpenLead(l) },
    { key: 'all', label: 'All', hint: 'Every lead', test: () => true },
  ];
  const tabTest = TABS.find(t => t.key === tab)!.test;

  const q = searchQuery.trim().toLowerCase();
  const filtered = data.leads
    .filter(l => tabTest(l))
    .filter(l => caller === 'all' || l.assigned_to === caller)
    .filter(l => source === 'all' || l.source === source)
    .filter(l => !q || [l.customer_name, l.phone].some(v => v.toLowerCase().includes(q)))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const reset = () => { setPage(0); setSelected(new Set()); };

  const allOnPage = rows.length > 0 && rows.every(l => selected.has(l.id));
  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePage = () => setSelected(prev => { const n = new Set(prev); rows.forEach(l => (allOnPage ? n.delete(l.id) : n.add(l.id))); return n; });

  // Workload of each calling executive
  const openOf = (id: number) => data.leads.filter(l => l.assigned_to === id && isOpenLead(l));
  const active = TELECALLERS.filter(t => t.is_active);

  const assignTo = async (ids: number[], to: number) => {
    const move = ids.filter(id => data.leads.find(l => l.id === id)?.assigned_to !== to);
    if (move.length === 0) { onToast(`Those leads are already with ${callerName(to)}`); return; }
    setBusy(true);
    try { await onReassign(move, to); } finally { setBusy(false); }
    setSelected(new Set());
  };

  /** Share the selected leads across active executives, fewest open leads first. */
  const shareEvenly = async () => {
    const ids = Array.from(selected);
    const load = new Map(active.map(t => [t.id, openOf(t.id).length]));
    ids.forEach(id => {
      const l = data.leads.find(x => x.id === id);
      if (l && isOpenLead(l) && load.has(l.assigned_to)) load.set(l.assigned_to, load.get(l.assigned_to)! - 1);
    });
    const plan = new Map<number, number[]>();
    ids.forEach(id => {
      const to = Array.from(load.entries()).sort((a, b) => a[1] - b[1])[0][0];
      plan.set(to, [...(plan.get(to) ?? []), id]);
      load.set(to, load.get(to)! + 1);
    });
    setBusy(true);
    try {
      for (const [to, leadIds] of Array.from(plan)) {
        const move = leadIds.filter(id => data.leads.find(l => l.id === id)?.assigned_to !== to);
        if (move.length) await onReassign(move, to);
      }
      onToast(`${ids.length} leads shared: ${Array.from(plan).map(([to, l]) => `${callerName(to).split(' ')[0]} ${l.length}`).join(', ')}`);
    } finally { setBusy(false); }
    setSelected(new Set());
  };

  const createImported = (newLeads: NewLead[]) => {
    onImport(newLeads);
    setImportOpen(false);
    setTab('new-imports');
    setCaller('all');
    reset();
  };

  // Every source in use, including "Imported file" and anything else brought in by an import
  const sources = Array.from(new Set([...LEAD_SOURCES, ...data.leads.map(l => l.source)]));
  const count = (test: (l: typeof data.leads[number]) => boolean) => data.leads.filter(test).length;
  const importedToday = count(l => l.created_at.startsWith(TODAY) && l.source === 'Imported file');

  // Active filters, shown as removable tags
  const clearFilters = () => { setTab('all'); setCaller('all'); setSource('all'); reset(); };
  const tags = [
    tab !== 'all' && { key: 'status', k: 'Status', v: TABS.find(t => t.key === tab)!.label, clear: () => { setTab('all'); reset(); } },
    caller !== 'all' && { key: 'caller', k: 'Executive', v: callerName(caller), clear: () => { setCaller('all'); reset(); } },
    source !== 'all' && { key: 'source', k: 'Source', v: source, clear: () => { setSource('all'); reset(); } },
  ].filter(Boolean) as { key: string; k: string; v: string; clear: () => void }[];
  const activeCount = tags.length;

  return (
    <>
      <div className="assign-top">
        {/* Import */}
        <div className="panel import-card">
          <div className="import-card-icon"><FileSpreadsheet size={26} /></div>
          <h2>Import leads</h2>
          <p className="loc">Bring in leads from an Excel, CSV or PDF file and hand them to the calling executives.</p>
          <ol className="import-steps">
            <li>Upload the file</li>
            <li>Pick an executive, or share automatically to whoever has the fewest open leads</li>
            <li>Leads land straight in their call queue</li>
          </ol>
          <button className="btn-primary import-card-btn" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Import leads
          </button>
          <div className="loc import-card-foot">
            {count(l => l.created_at.startsWith(TODAY))} new today{importedToday > 0 ? ` · ${importedToday} from files` : ''}
          </div>
        </div>

        {/* Executive-wise distribution and progress */}
        <ExecDistributionTable summary={execSummary} onSelectExec={id => { setCaller(caller === id ? 'all' : id); reset(); }} />
      </div>

      {/* One filter menu, with the active filters as removable tags */}
      <div className="lf-bar">
        <div className="lf-wrap" ref={menuRef}>
          <button className={`lf-trigger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="dialog">
            <SlidersHorizontal size={15} /> Filters
            {activeCount > 0 && <span className="lf-count">{activeCount}</span>}
            <ChevronDown size={15} className="lf-caret" />
          </button>

          {menuOpen && (
            <div className="lf-menu" role="dialog" aria-label="Filter leads">
              <div className="lf-section">
                <div className="lf-title">Status</div>
                {TABS.map(t => (
                  <button key={t.key} className={`lf-option ${tab === t.key ? 'on' : ''}`} onClick={() => { setTab(t.key); reset(); }}>
                    <span className="lf-radio" />
                    <span className="lf-opt-text">{t.label}<small>{t.hint}</small></span>
                    <span className="lf-n">{count(t.test)}</span>
                  </button>
                ))}
              </div>

              <div className="lf-section">
                <div className="lf-title">Calling executive</div>
                <button className={`lf-option ${caller === 'all' ? 'on' : ''}`} onClick={() => { setCaller('all'); reset(); }}>
                  <span className="lf-radio" />Everyone
                </button>
                {TELECALLERS.map(t => (
                  <button key={t.id} className={`lf-option ${caller === t.id ? 'on' : ''}`} onClick={() => { setCaller(t.id); reset(); }}>
                    <span className="lf-radio" />{t.name}
                    {t.is_active ? <span className="lf-n">{openOf(t.id).length}</span> : <span className="lf-n muted">inactive</span>}
                  </button>
                ))}
              </div>

              <div className="lf-section">
                <div className="lf-title">Source</div>
                <div className="lf-pills">
                  <button className={`lf-pill ${source === 'all' ? 'on' : ''}`} onClick={() => { setSource('all'); reset(); }}>All</button>
                  {sources.map(s => (
                    <button key={s} className={`lf-pill ${source === s ? 'on' : ''}`} onClick={() => { setSource(s); reset(); }}>{s}</button>
                  ))}
                </div>
              </div>

              <div className="lf-foot">
                <button className="link-btn lf-reset" onClick={clearFilters}>Reset all</button>
                <button className="btn-primary btn-small" onClick={() => setMenuOpen(false)}>Show {filtered.length} leads</button>
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

        <span className="lf-total">{filtered.length} leads</span>
      </div>

      {selected.size > 0 ? (
        <div className="bulk-bar assign-bar">
          <strong>{selected.size} lead{selected.size === 1 ? '' : 's'} selected</strong>
          <span>Assign to</span>
          <select className="filter-select" value={target} onChange={e => setTarget(Number(e.target.value))} aria-label="Assign to">
            {active.map(t => <option key={t.id} value={t.id}>{t.name} · {t.region} · {openOf(t.id).length} open</option>)}
          </select>
          <button className="btn-primary btn-small" disabled={busy} onClick={() => assignTo(Array.from(selected), target)}><UserCheck size={14} /> Assign</button>
          <span className="loc">or</span>
          <button className="btn-secondary btn-small" disabled={busy} onClick={shareEvenly}><Shuffle size={14} /> Share evenly</button>
          <button className="link-btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      ) : (
        <div className="assign-hint loc">Tick leads in the list to assign them to an executive or share them evenly.</div>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select all on this page" /></th>
                <th>Lead</th><th>Calling executive</th><th>Stage</th><th>Source</th><th>Last call</th><th>Last touched</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={7} text="No leads match these filters." />}
              {rows.map(l => {
                const last = lastCallFor(l.id, data.activities);
                const owner = callerOf(l.assigned_to);
                const stale = isOpenLead(l) && daysBefore(l.updated_at) >= 3;
                return (
                  <tr key={l.id} className={selected.has(l.id) ? 'row-selected' : undefined}>
                    <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.customer_name}`} /></td>
                    <td className="cust">{l.customer_name}<div className="loc">{l.phone} · added {shortDate(l.created_at)}</div></td>
                    <td>
                      {owner?.name ?? '—'}
                      {owner && !owner.is_active && <div><span className="chip muted">Inactive</span></div>}
                    </td>
                    <td><span className={`chip ${isWonLead(l) ? 'delivered' : stageOf(l.stage_id)?.name === 'Lost' ? 'muted' : 'confirmed'}`}>{stageName(l.stage_id)}</span></td>
                    <td>{l.source === 'Website' ? <span className="source-tag website">Website</span> : l.source}</td>
                    <td>{last ? <><StatusChip status={last.outcome} /><div className="loc">{ago(last.created_at)}</div></> : <span className="loc">Never</span>}</td>
                    <td className={stale ? 'text-warn' : undefined}>{ago(l.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{filtered.length === 0 ? '0 leads' : `${safePage * PAGE_SIZE + 1}–${Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of ${filtered.length} leads · least recently touched first`}</span>
          <div className="pager-btns">
            <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button className="btn-secondary btn-small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </div>
      </div>

      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import leads from Excel or PDF" wide>
        <ImportLeads leads={data.leads} onCreate={createImported} onClose={() => setImportOpen(false)} />
      </Modal>
    </>
  );
}
