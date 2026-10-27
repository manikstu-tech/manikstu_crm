import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TELECALLERS, TODAY } from '../../data/managerDashboard';
import { ago, pct, rupees, rupeesShort, shortDate, shortDateTime } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import HBarList from '../HBarList';
import { TargetRing } from '../telecaller/shared';
import {
  OUTCOMES, PERIOD_LABEL, Period, TeamData, fmtDuration, isOverdue, productName, salesByMonth, stageName, time12, verticalName,
} from '../telecaller/tcData';
import { CALL_TARGET_DAILY, ExecMetrics, allExecMetrics, callsPerDay, initials, teamAverage } from './telecallingMetrics';
import CardTable from '../CardTable';
import DateRangeSelect from '../DateRangeSelect';

const OUTCOME_CHIP: Record<string, string> = { Connected: 'delivered', 'No answer': 'transit', Busy: 'pending', 'Wrong number': 'muted', 'Not interested': 'muted' };

interface Props {
  data: TeamData;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  searchQuery: string;
  onToast: (message: string) => void;
}

/** List of telecalling executives; tapping one shows everything about them. Read-only. */
export default function TelecallingExecutivesView({ data, selectedId, onSelect, searchQuery, onToast }: Props) {
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [period, setPeriod] = useState<Period>('month');
  const all = useMemo(() => allExecMetrics(data, period), [data, period]);

  const selected = TELECALLERS.find(t => t.id === selectedId);
  if (selected) return <ExecutiveDetail key={selected.id} data={data} id={selected.id} onBack={() => onSelect(null)} onToast={onToast} />;

  const q = searchQuery.trim().toLowerCase();
  const rows = all.filter(m =>
    (status === 'all' || (status === 'active') === m.t.is_active) &&
    (!q || [m.t.name, m.t.region].some(v => v.toLowerCase().includes(q))),
  );

  /** One row per executive, for the chosen period. */
  const teamReport = async (format: ExportFormat) => {
    if (rows.length === 0) { onToast('No executives to include'); return; }
    try {
      await exportTable(format, {
        filename: `executive-reports-${period}-${TODAY}`,
        title: 'Telecalling executive reports',
        subtitle: `${PERIOD_LABEL[period]} · ${rows.length} executives · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Executive', width: 18 }, { header: 'Region', width: 12 }, { header: 'Status', width: 9 },
          { header: 'Calls', width: 7 }, { header: 'Connected', width: 9 }, { header: 'Connect %', width: 9 }, { header: 'Avg talk', width: 9 },
          { header: 'Leads called', width: 9 }, { header: 'Open leads', width: 9 }, { header: 'Untouched 3+ days', width: 10 },
          { header: 'Overdue follow-ups', width: 10 }, { header: 'Follow-ups kept %', width: 10 },
          { header: 'Sales', width: 7 }, { header: 'Revenue', width: 11, money: true }, { header: 'Conversion %', width: 10 }, { header: 'Last call', width: 14 },
        ],
        rows: rows.map(m => [
          m.t.name, m.t.region, m.t.is_active ? 'Active' : 'Inactive',
          m.calls, m.connected, m.connectRate, fmtDuration(m.avgTalkSec),
          m.leadsWorked, m.openLeads, m.staleLeads, m.overdue, m.keptRate === null ? '—' : m.keptRate,
          m.sales, m.revenue, m.conversion, m.lastCall ? shortDateTime(m.lastCall) : 'Never',
        ]),
      });
      onToast(`Executive reports exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  return (
    <>
      <div className="page-toolbar exec-toolbar">
        <div className="filters exec-status-chips">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <button key={s} className={`filter-chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
              {s === 'all' ? `All (${all.length})` : s === 'active' ? `Active (${all.filter(m => m.t.is_active).length})` : `Inactive (${all.filter(m => !m.t.is_active).length})`}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          {/* Phones: the All / Active / Inactive buttons become this dropdown, on one line with the period and Download all. */}
          <select className="filter-select exec-status-select" value={status} onChange={e => setStatus(e.target.value as typeof status)} aria-label="Executive status">
            <option value="all">All ({all.length})</option>
            <option value="active">Active ({all.filter(m => m.t.is_active).length})</option>
            <option value="inactive">Inactive ({all.filter(m => !m.t.is_active).length})</option>
          </select>
          <select className="filter-select" value={period} onChange={e => setPeriod(e.target.value as Period)} aria-label="Period">
            {(['today', '7d', 'month'] as Period[]).map(p => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
          <ExportMenu onExport={teamReport} label="Download all" />
        </div>
      </div>

      <div className="exec-grid">
        {rows.length === 0 && <div className="panel loc">No executives match.</div>}
        {rows.map(m => (
          <button key={m.t.id} className={`exec-card ${!m.t.is_active ? 'inactive' : ''}`} onClick={() => onSelect(m.t.id)}>
            <div className="exec-top">
              <div className="avatar">{initials(m.t.name)}</div>
              <div className="exec-who">
                <div className="exec-name">{m.t.name}</div>
                <div className="loc">
                  {m.t.region} · <span className={`chip ${m.t.is_active ? 'delivered' : 'muted'}`}>{m.t.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
            </div>
            <div className="exec-body">
              <div className="exec-ring">
                <TargetRing done={m.callsToday} target={CALL_TARGET_DAILY} />
                <div className="loc">calls today</div>
              </div>
              <div className="exec-stats">
                <div><strong>{m.openLeads}</strong> open leads</div>
                <div className={m.overdue ? 'text-warn' : undefined}><strong>{m.overdue}</strong> overdue follow-ups</div>
                <div><strong>{rupeesShort(m.revenue)}</strong> {PERIOD_LABEL[period].toLowerCase()} · {m.sales} sales</div>
                <div><strong>{m.conversion}%</strong> conversion</div>
                <div className={m.t.is_active && m.callsToday === 0 ? 'text-warn' : 'loc'}>{m.lastCall ? `Last call ${ago(m.lastCall)}, ${time12(m.lastCall)}` : 'No calls yet'}</div>
              </div>
            </div>
            <span className="exec-more">View details →</span>
          </button>
        ))}
      </div>
      <div className="panel-note">Ring = calls today against the daily target of {CALL_TARGET_DAILY}. Revenue and sales are for {PERIOD_LABEL[period].toLowerCase()}. &quot;Download all&quot; gives one row per executive; open an executive for their full report.</div>
    </>
  );
}

// ---- One executive -----------------------------------------------------------------------------

function ExecutiveDetail({ data, id, onBack, onToast }: { data: TeamData; id: number; onBack: () => void; onToast: (m: string) => void }) {
  const [period, setPeriod] = useState<Period>('month');
  const all = useMemo(() => allExecMetrics(data, period), [data, period]);
  const m = all.find(x => x.t.id === id)!;
  const t = m.t;

  const days = callsPerDay(data, 14, id);
  const maxDay = Math.max(1, ...days.map(d => d.calls));
  const months = salesByMonth(data.sales.filter(s => s.caller_id === id));
  const maxMonth = Math.max(1, ...months.map(x => x.amount));
  const mySales = data.sales.filter(s => s.caller_id === id);
  const byProduct = Array.from(mySales.reduce((acc, s) => acc.set(s.product_id, (acc.get(s.product_id) ?? 0) + s.amount), new Map<number, number>()))
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recent = data.activities.filter(a => a.caller_id === id).slice(-12).reverse();
  const leadName = (leadId: number) => data.leads.find(l => l.id === leadId)?.customer_name ?? '—';
  const fus = data.followups.filter(f => f.caller_id === id);
  const upcoming = fus.filter(f => f.status !== 'done').sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 6);

  // Compare with the average active executive
  const compare: { label: string; mine: number | null; avg: number | null; fmt: (n: number) => string; higherIsBetter: boolean }[] = [
    { label: 'Calls', mine: m.calls, avg: teamAverage(all, x => x.calls), fmt: n => Math.round(n).toString(), higherIsBetter: true },
    { label: 'Connect rate', mine: m.connectRate, avg: teamAverage(all, x => x.connectRate), fmt: n => `${Math.round(n)}%`, higherIsBetter: true },
    { label: 'Avg talk time', mine: m.avgTalkSec, avg: teamAverage(all, x => x.avgTalkSec), fmt: n => fmtDuration(Math.round(n)), higherIsBetter: true },
    { label: 'Leads worked', mine: m.leadsWorked, avg: teamAverage(all, x => x.leadsWorked), fmt: n => Math.round(n).toString(), higherIsBetter: true },
    { label: 'Sales', mine: m.sales, avg: teamAverage(all, x => x.sales), fmt: n => (Math.round(n * 10) / 10).toString(), higherIsBetter: true },
    { label: 'Revenue', mine: m.revenue, avg: teamAverage(all, x => x.revenue), fmt: n => rupees(n), higherIsBetter: true },
    { label: 'Conversion', mine: m.conversion, avg: teamAverage(all, x => x.conversion), fmt: n => `${Math.round(n)}%`, higherIsBetter: true },
    { label: 'Overdue follow-ups', mine: m.overdue, avg: teamAverage(all, x => x.overdue), fmt: n => (Math.round(n * 10) / 10).toString(), higherIsBetter: false },
    { label: 'Follow-ups kept', mine: m.keptRate, avg: teamAverage(all, x => x.keptRate), fmt: n => `${Math.round(n)}%`, higherIsBetter: true },
  ];

  const report = async (format: ExportFormat) => {
    try {
      await exportTable(format, {
        filename: `${t.name.toLowerCase().replace(/\s+/g, '-')}-report-${TODAY}`,
        title: `${t.name} · telecalling report`,
        subtitle: `${t.region} · ${t.is_active ? 'Active' : 'Inactive'} · ${PERIOD_LABEL[period]} · exported ${shortDate(TODAY)}`,
        columns: [{ header: 'Measure', width: 26 }, { header: t.name, width: 16 }, { header: 'Team average', width: 16 }],
        rows: [
          ...compare.map(c => [c.label, c.mine === null ? '—' : c.fmt(c.mine), c.avg === null ? '—' : c.fmt(c.avg)]),
          ['Open leads', String(m.openLeads), ''],
          ['Leads untouched 3+ days', String(m.staleLeads), ''],
          ['Leads won / lost', `${m.wonLeads} / ${m.lostLeads}`, ''],
          ['Follow-ups due today', String(m.dueToday), ''],
          ['Missed follow-ups', String(m.missed), ''],
          ...OUTCOMES.map(o => [`Calls: ${o}`, String(m.outcomes[o]), '']),
          ['Complaints open / resolved', `${m.openComplaints} / ${m.resolvedComplaints}`, ''],
        ],
      });
      onToast(`${t.name}'s report exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  return (
    <>
      <button className="link-btn back-link" onClick={onBack}><ArrowLeft size={15} /> All executives</button>

      <div className="panel exec-profile">
        <div className="exec-top">
          <div className="avatar big">{initials(t.name)}</div>
          <div className="exec-who">
            <h2>{t.name}</h2>
            <div className="loc">
              {t.region} · <span className={`chip ${t.is_active ? 'delivered' : 'muted'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
              {' '}· handles {m.verticalIds.map(verticalName).join(', ') || 'no product lines'}
            </div>
            <div className="loc">
              Daily target {CALL_TARGET_DAILY} calls
              {m.callingSince && <> · calling since {shortDate(m.callingSince)}</>}
              {m.lastCall && <> · last call {ago(m.lastCall)}, {time12(m.lastCall)}</>}
            </div>
          </div>
          <div className="exec-profile-ring">
            <TargetRing done={m.callsToday} target={CALL_TARGET_DAILY} />
            <div className="loc">calls today{m.firstCallToday && <> · first at {time12(m.firstCallToday)}</>}</div>
          </div>
        </div>
      </div>

      <div className="page-toolbar exec-report-toolbar">
        <div className="filters date-chips">
          {(['today', '7d', 'month'] as Period[]).map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
          ))}
        </div>
        {/* Phones: the period buttons become a single calendar dropdown. */}
        <DateRangeSelect phoneOnly className="toolbar-date" label="Period" value={period} onChange={p => setPeriod(p)}
          options={(['today', '7d', 'month'] as Period[]).map(p => ({ value: p, label: PERIOD_LABEL[p] }))} />
        <div className="toolbar-actions"><ExportMenu onExport={report} label="Download report" /></div>
      </div>

      <div className="scoreboard">
        <div className="score"><div className="num">{m.calls} <small>{m.connected} connected</small></div><div className="label">Call attempts</div></div>
        <div className="score"><div className="num">{m.calls ? `${m.connectRate}%` : '—'}</div><div className="label">Connect rate</div></div>
        <div className="score"><div className="num">{fmtDuration(m.avgTalkSec)}</div><div className="label">Avg talk time</div></div>
        <div className="score"><div className="num">{m.leadsWorked}</div><div className="label">Leads called</div></div>
        <div className="score"><div className="num">{rupeesShort(m.revenue)} <small>{m.sales} sales</small></div><div className="label">Revenue · avg {rupees(m.avgSale)}</div></div>
        <div className="score"><div className="num">{m.conversion}%</div><div className="label">Lead conversion</div></div>
      </div>

      <div className="grid equal-2">
        <div className="panel calls-panel">
          <div className="panel-head"><h2>Calls</h2><span className="panel-meta">{PERIOD_LABEL[period]}</span></div>
          <HBarList rows={OUTCOMES.map(o => ({ key: o, label: o, value: m.outcomes[o], display: `${m.outcomes[o]} · ${pct(m.outcomes[o], m.calls)}%`, tip: `${o}: ${m.outcomes[o]} calls` }))} />
          <div className="od-label" style={{ marginTop: 16 }}>Calls per day · last 14 days</div>
          <div className="bar-chart dense">
            {days.map((d, i) => (
              <div key={d.key} className="bc-col" data-tip={`${shortDate(d.key)}: ${d.calls} calls, ${d.connected} connected`}>
                <div className={`bc-bar ${i === 13 ? 'now' : ''}`} style={{ height: `${(d.calls / maxDay) * 100}%` }} />
                <div className="bc-label">{Number(d.key.slice(8))}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Follow-ups</h2><span className="panel-meta">{m.keptRate === null ? 'none yet' : `${m.keptRate}% kept`}</span></div>
          <div className="mini-stats">
            <div className="mini-stat"><div className="mini-num">{m.dueToday}</div><div className="mini-label">due today</div></div>
            <div className={`mini-stat ${m.overdue ? 'warn' : ''}`}><div className="mini-num">{m.overdue}</div><div className="mini-label">overdue</div></div>
            <div className="mini-stat"><div className="mini-num">{m.missed}</div><div className="mini-label">missed</div></div>
            <div className="mini-stat"><div className="mini-num">{fus.filter(f => f.status === 'done').length}</div><div className="mini-label">done</div></div>
          </div>
          <ul className="attn-list">
            {upcoming.length === 0 && <li><div className="action">Nothing pending.</div></li>}
            {upcoming.map(f => (
              <li key={f.id}>
                <div><div className="name">{leadName(f.lead_id)}</div><div className="action">{f.note}</div></div>
                <div className="attn-side"><span className={isOverdue(f) ? 'when' : 'loc'}>{isOverdue(f) ? 'Overdue · ' : ''}{shortDate(f.due_at)}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head"><h2>Compared with the team</h2><span className="panel-meta">average active executive · {PERIOD_LABEL[period].toLowerCase()}</span></div>
          <table className="compare-table">
            <thead><tr><th>Measure</th><th className="num-col">{t.name.split(' ')[0]}</th><th className="num-col">Team avg</th><th></th></tr></thead>
            <tbody>
              {compare.map(c => {
                const better = c.mine !== null && c.avg !== null && c.mine !== c.avg ? (c.mine > c.avg) === c.higherIsBetter : null;
                return (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td className="num-col strong">{c.mine === null ? '—' : c.fmt(c.mine)}</td>
                    <td className="num-col loc">{c.avg === null ? '—' : c.fmt(c.avg)}</td>
                    <td className={`cmp-arrow ${better === null ? '' : better ? 'up' : 'down'}`}>{better === null ? '·' : better ? '▲' : '▼'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Sales</h2><span className="panel-meta">{rupees(mySales.reduce((a, s) => a + s.amount, 0))} all time</span></div>
          <div className="bar-chart">
            {months.map((x, i) => (
              <div key={x.key} className="bc-col" data-tip={`${x.label}: ${rupees(x.amount)} · ${x.count} sales`}>
                <div className={`bc-bar ${i === 5 ? 'now' : ''}`} style={{ height: `${(x.amount / maxMonth) * 100}%` }} />
                <div className="bc-label">{x.label}</div>
              </div>
            ))}
          </div>
          <div className="od-label" style={{ marginTop: 16 }}>Top products</div>
          {byProduct.length === 0 ? <div className="loc">No sales yet.</div> : (
            <HBarList rows={byProduct.map(([pid, amt]) => ({ key: String(pid), label: productName(pid), value: amt, display: rupeesShort(amt), tip: `${productName(pid)}: ${rupees(amt)}` }))} />
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Recent calls</h2><span className="panel-meta">latest {recent.length}</span></div>
        <CardTable titleCol={1}>
          <table>
            <thead><tr><th>When</th><th>Lead</th><th>Outcome</th><th>Talk time</th><th>Stage after</th><th>Note</th></tr></thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={6} className="loc">No calls yet.</td></tr>}
              {recent.map(a => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{shortDateTime(a.created_at)}</td>
                  <td>{leadName(a.lead_id)}</td>
                  <td><span className={`chip ${OUTCOME_CHIP[a.outcome]}`}>{a.outcome}</span></td>
                  <td>{fmtDuration(a.duration_sec)}</td>
                  <td>{a.stage_id ? stageName(a.stage_id) : '—'}</td>
                  <td>{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
        <div className="panel-note">Call outcomes, talk time and daily targets are sample values until the backend records them.</div>
      </div>
    </>
  );
}
