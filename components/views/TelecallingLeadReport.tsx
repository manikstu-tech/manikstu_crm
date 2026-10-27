import React, { useMemo, useState } from 'react';
import { TELECALLERS, TODAY, VERTICALS } from '../../data/managerDashboard';
import { ago, shortDate, shortDateTime } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import { TeamData, callerName, fmtDuration, isOpenLead, isOverdue, isWonLead, stageName, time12, verticalName } from '../telecaller/tcData';
import CardTable from '../CardTable';

const PAGE_SIZE = 15;
const OUTCOME_CHIP: Record<string, string> = { Connected: 'delivered', 'No answer': 'transit', Busy: 'pending', 'Wrong number': 'muted', 'Not interested': 'muted' };
type LeadFilter = 'all' | 'open' | 'won' | 'lost' | 'never' | 'overdue';
const FILTER_LABEL: Record<LeadFilter, string> = { all: 'All leads', open: 'Open', won: 'Won', lost: 'Lost', never: 'Never called', overdue: 'Follow-up overdue' };

/** Latest calls across the team: new calls from the executives appear here automatically. */
export function LiveCallFeed({ data, onOpenExecutive }: { data: TeamData; onOpenExecutive: (id: number) => void }) {
  const recent = useMemo(() => [...data.activities].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, 8), [data.activities]);
  const leadName = (id: number) => data.leads.find(l => l.id === id)?.customer_name ?? '—';
  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head"><h2>Latest calls</h2><span className="panel-meta">updates automatically</span></div>
      <ul className="attn-list">
        {recent.map(a => (
          <li key={a.id}>
            <div>
              <div className="name">
                <button className="link-btn" onClick={() => onOpenExecutive(a.caller_id)}>{callerName(a.caller_id)}</button> called {leadName(a.lead_id)}
              </div>
              <div className="action">
                <span className={`chip ${OUTCOME_CHIP[a.outcome]}`}>{a.outcome}</span>
                {a.stage_id && <> · {stageName(a.stage_id)}</>}{a.duration_sec ? <> · {fmtDuration(a.duration_sec)}</> : null} · {a.note}
              </div>
            </div>
            <div className="attn-side"><span className="loc">{a.created_at.startsWith(TODAY) ? time12(a.created_at) : shortDate(a.created_at)}</span></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every lead with who has it, its status, the last call and the next follow-up. */
export default function TelecallingLeadReport({ data, onToast }: { data: TeamData; onToast: (m: string) => void }) {
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [caller, setCaller] = useState('all');
  const [vertical, setVertical] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const lastCall = new Map<number, (typeof data.activities)[number]>();
    const calls = new Map<number, number>();
    data.activities.forEach(a => {
      calls.set(a.lead_id, (calls.get(a.lead_id) ?? 0) + 1);
      const prev = lastCall.get(a.lead_id);
      if (!prev || a.created_at >= prev.created_at) lastCall.set(a.lead_id, a);
    });
    return data.leads.map(l => {
      const fus = data.followups.filter(f => f.lead_id === l.id && f.status !== 'done').sort((a, b) => a.due_at.localeCompare(b.due_at));
      return { l, last: lastCall.get(l.id), calls: calls.get(l.id) ?? 0, next: fus[0], overdue: fus.some(isOverdue) };
    }).sort((a, b) => (b.last?.created_at ?? b.l.updated_at).localeCompare(a.last?.created_at ?? a.l.updated_at));
  }, [data]);

  const q = query.trim().toLowerCase();
  const shown = rows.filter(r =>
    (caller === 'all' || r.l.assigned_to === Number(caller)) &&
    (vertical === 'all' || r.l.vertical_id === Number(vertical)) &&
    (filter === 'all' || (filter === 'open' && isOpenLead(r.l)) || (filter === 'won' && isWonLead(r.l)) ||
      (filter === 'lost' && stageName(r.l.stage_id) === 'Lost') || (filter === 'never' && r.calls === 0) || (filter === 'overdue' && r.overdue)) &&
    (!q || [r.l.customer_name, r.l.phone].some(v => v.toLowerCase().includes(q))),
  );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const reset = () => setPage(0);

  const runExport = async (format: ExportFormat) => {
    if (shown.length === 0) { onToast('No leads to export'); return; }
    try {
      await exportTable(format, {
        filename: `telecalling-report-${TODAY}`,
        title: 'Telecalling report',
        subtitle: `${FILTER_LABEL[filter]}${caller === 'all' ? '' : ` · ${callerName(Number(caller))}`} · ${shown.length} leads · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Lead', width: 18 }, { header: 'Phone', width: 12 }, { header: 'Product line', width: 18 }, { header: 'Assigned to', width: 16 },
          { header: 'Status', width: 12 }, { header: 'Calls', width: 6 }, { header: 'Last call', width: 14 }, { header: 'Outcome', width: 12 },
          { header: 'Last note', width: 28 }, { header: 'Next follow-up', width: 13 }, { header: 'Source', width: 12 }, { header: 'Added', width: 10 },
        ],
        rows: shown.map(r => [
          r.l.customer_name, r.l.phone, verticalName(r.l.vertical_id), callerName(r.l.assigned_to), stageName(r.l.stage_id), r.calls,
          r.last ? shortDateTime(r.last.created_at) : 'Never', r.last?.outcome ?? '', r.last?.note ?? '',
          r.next ? `${shortDate(r.next.due_at)}${r.overdue ? ' (overdue)' : ''}` : '', r.l.source, shortDate(r.l.created_at),
        ]),
      });
      onToast(`Telecalling report exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Telecalling report · every lead</h2>
        <ExportMenu onExport={runExport} />
      </div>
      <div className="filters date-chips" style={{ marginBottom: 12 }}>
        {(Object.keys(FILTER_LABEL) as LeadFilter[]).map(f => (
          <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => { setFilter(f); reset(); }}>{FILTER_LABEL[f]}</button>
        ))}
      </div>
      {/* Phones: the lead status filters become one dropdown. */}
      <select className="filter-select phone-select lead-status-select" value={filter} onChange={e => { setFilter(e.target.value as LeadFilter); reset(); }} aria-label="Lead status">
        {(Object.keys(FILTER_LABEL) as LeadFilter[]).map(f => <option key={f} value={f}>{FILTER_LABEL[f]}</option>)}
      </select>
      <div className="filter-row lead-report-filters" style={{ margin: '0 0 12px' }}>
        <input className="filter-select" placeholder="Search lead name or phone…" value={query} onChange={e => { setQuery(e.target.value); reset(); }} aria-label="Search leads" />
        <select className="filter-select" value={caller} onChange={e => { setCaller(e.target.value); reset(); }} aria-label="Executive">
          <option value="all">All executives</option>
          {TELECALLERS.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? '' : ' (inactive)'}</option>)}
        </select>
        <select className="filter-select" value={vertical} onChange={e => { setVertical(e.target.value); reset(); }} aria-label="Product line">
          <option value="all">All product lines</option>
          {VERTICALS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      <CardTable>
        <table>
          <thead>
            <tr><th>Lead</th><th>Assigned to</th><th>Status</th><th className="num-col">Calls</th><th>Last call</th><th>Next follow-up</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="loc" style={{ textAlign: 'center', padding: 20 }}>No leads match.</td></tr>}
            {shown.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map(r => (
              <tr key={r.l.id}>
                <td className="cust">{r.l.customer_name}<div className="loc">{r.l.phone} · {verticalName(r.l.vertical_id)} · {r.l.source}</div></td>
                <td>{callerName(r.l.assigned_to)}</td>
                <td><span className={`chip ${isWonLead(r.l) ? 'delivered' : stageName(r.l.stage_id) === 'Lost' ? 'muted' : 'transit'}`}>{stageName(r.l.stage_id)}</span></td>
                <td className="num-col">{r.calls}</td>
                <td>
                  {r.last ? (
                    <>
                      <span className={`chip ${OUTCOME_CHIP[r.last.outcome]}`}>{r.last.outcome}</span> <span className="loc">{ago(r.last.created_at)}{r.last.created_at.startsWith(TODAY) ? `, ${time12(r.last.created_at)}` : ''}</span>
                      <div className="loc lead-note">{r.last.note}</div>
                    </>
                  ) : <span className="text-warn">Never called</span>}
                </td>
                <td className={r.overdue ? 'text-warn' : undefined}>{r.next ? <>{shortDate(r.next.due_at)}{r.overdue && ' · overdue'}<div className="loc">{r.next.note}</div></> : <span className="loc">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardTable>
      <div className="pager">
        <span>{shown.length} leads · newest activity first</span>
        {pages > 1 && (
          <div className="pager-btns">
            <button className="kanban-btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <span>Page {safePage + 1} of {pages}</span>
            <button className="kanban-btn" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
