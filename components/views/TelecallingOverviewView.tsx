import React, { useMemo, useState } from 'react';
import { TELECALLERS, TODAY, VERTICALS } from '../../data/managerDashboard';
import { ago, pct, rupees, rupeesShort, shortDate } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import HBarList from '../HBarList';
import { OUTCOMES, PERIOD_LABEL, Period, TeamData, fmtDuration, inPeriod, isOverdue, staffStats, teamAlerts } from '../telecaller/tcData';
import { allExecMetrics, callsPerDay, funnel } from './telecallingMetrics';
import TelecallingLeadReport, { LiveCallFeed } from './TelecallingLeadReport';
import CardTable from '../CardTable';

type SortKey = 'revenue' | 'calls' | 'connectRate' | 'openLeads' | 'overdue' | 'sales' | 'conversion';

interface Props {
  data: TeamData;
  onOpenExecutive: (id: number) => void;
  onToast: (message: string) => void;
}

/** Manager's view of the whole telecalling team. Read-only: the telecalling head manages the team. */
export default function TelecallingOverviewView({ data, onOpenExecutive, onToast }: Props) {
  const [period, setPeriod] = useState<Period>('today');
  const [region, setRegion] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [funnelVertical, setFunnelVertical] = useState(VERTICALS[0].id);

  const all = useMemo(() => allExecMetrics(data, period), [data, period]);
  const team = all.filter(m => region === 'all' || m.t.region === region);
  const ids = new Set(team.map(m => m.t.id));
  const alerts = teamAlerts(staffStats(data, 'today', 'all').filter(s => ids.has(s.t.id)));
  const sum = (f: (m: (typeof team)[number]) => number) => team.reduce((a, m) => a + f(m), 0);

  const calls = sum(m => m.calls);
  const connected = sum(m => m.connected);
  const active = team.filter(m => m.t.is_active);
  const callingToday = active.filter(m => m.callsToday > 0).length;
  const newLeads = data.leads.filter(l => ids.has(l.assigned_to) && inPeriod(l.created_at, period)).length;
  const teamLeads = data.leads.filter(l => ids.has(l.assigned_to));
  const sold = new Set(data.sales.map(s => s.lead_id));
  const conversion = pct(teamLeads.filter(l => sold.has(l.id)).length, teamLeads.length);
  const fus = data.followups.filter(f => ids.has(f.caller_id));

  const periodActs = data.activities.filter(a => ids.has(a.caller_id) && inPeriod(a.created_at, period));
  const talk = periodActs.filter(a => a.outcome === 'Connected' && a.duration_sec !== null);
  const avgTalk = talk.length ? Math.round(talk.reduce((a, x) => a + x.duration_sec!, 0) / talk.length) : null;
  const hours = Array.from({ length: 11 }, (_, i) => 9 + i).map(h => {
    const inHour = periodActs.filter(a => Number(a.created_at.slice(11, 13)) === h);
    return { h, n: inHour.length, rate: pct(inHour.filter(a => a.outcome === 'Connected').length, inHour.length) };
  });
  const maxHour = Math.max(1, ...hours.map(x => x.n));
  const bestHour = [...hours].filter(x => x.n >= 3).sort((a, b) => b.rate - a.rate)[0];
  const days = callsPerDay({ ...data, activities: data.activities.filter(a => ids.has(a.caller_id)), sales: data.sales.filter(s => ids.has(s.caller_id)) }, 30);
  const maxDay = Math.max(1, ...days.map(d => d.calls));
  const stages = funnel({ ...data, leads: teamLeads }, funnelVertical);

  const sorted = [...team].sort((a, b) => {
    const v = (m: typeof a) => (sortKey === 'overdue' ? m.overdue : m[sortKey]);
    return v(b) - v(a);
  });
  const rankOf = new Map([...team].sort((a, b) => b.revenue - a.revenue).map((m, i) => [m.t.id, i + 1]));
  const regions = Array.from(new Set(TELECALLERS.map(t => t.region)));

  const runExport = async (format: ExportFormat) => {
    try {
      await exportTable(format, {
        filename: `telecalling-team-${TODAY}`,
        title: 'Telecalling team',
        subtitle: `${PERIOD_LABEL[period]} · ${region === 'all' ? 'all regions' : region} · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Executive', width: 18 }, { header: 'Region', width: 12 }, { header: 'Status', width: 9 }, { header: 'Calls', width: 7 },
          { header: 'Connect %', width: 9 }, { header: 'Leads worked', width: 9 }, { header: 'Open leads', width: 9 }, { header: 'Overdue follow-ups', width: 10 },
          { header: 'Sales', width: 7 }, { header: 'Revenue', width: 11, money: true }, { header: 'Conversion %', width: 10 },
        ],
        rows: sorted.map(m => [
          m.t.name, m.t.region, m.t.is_active ? 'Active' : 'Inactive', m.calls, m.connectRate, m.leadsWorked, m.openLeads, m.overdue,
          m.sales, m.revenue, m.conversion,
        ]),
      });
      onToast(`Telecalling team exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="num-col">
      <button className={`sort-btn ${sortKey === k ? 'active' : ''}`} onClick={() => setSortKey(k)}>{label}{sortKey === k ? ' ▾' : ''}</button>
    </th>
  );

  return (
    <>
      <div className="page-toolbar">
        <div className="filters date-chips">
          {(['today', '7d', 'month'] as Period[]).map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
          ))}
        </div>
        {/* Phones: the period filters become one dropdown. */}
        <select className="filter-select phone-select" value={period} onChange={e => setPeriod(e.target.value as Period)} aria-label="Period">
          {(['today', '7d', 'month'] as Period[]).map(p => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
        </select>
        <div className="toolbar-actions">
          <select className="filter-select" value={region} onChange={e => setRegion(e.target.value)} aria-label="Region">
            <option value="all">All regions</option>
            {regions.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="scoreboard">
        <div className="score"><div className="num">{calls} <small>{pct(connected, calls)}% connected</small></div><div className="label">Calls · {PERIOD_LABEL[period].toLowerCase()}</div></div>
        <div className="score"><div className="num">{sum(m => m.leadsWorked)} <small>+{newLeads} new</small></div><div className="label">Leads worked</div></div>
        <div className="score"><div className="num">{fus.filter(f => f.status === 'pending' && f.due_at.startsWith(TODAY)).length} <small className="warn">{fus.filter(isOverdue).length} overdue</small></div><div className="label">Follow-ups due today</div></div>
        <div className="score"><div className="num">{rupeesShort(sum(m => m.revenue))} <small>{sum(m => m.sales)} sales</small></div><div className="label">Revenue · {PERIOD_LABEL[period].toLowerCase()}</div></div>
        <div className="score"><div className="num">{conversion}%</div><div className="label">Lead conversion</div></div>
        <div className="score"><div className={`num ${callingToday < active.length ? 'text-warn' : ''}`}>{callingToday} <small>of {active.length}</small></div><div className="label">Executives calling today</div></div>
      </div>

      {alerts.length > 0 && (
        <div className="panel team-alerts" style={{ marginBottom: 20 }}>
          <div className="panel-head"><h2>Worth a look</h2><span className="panel-meta">{alerts.length} items · the telecalling head acts on these</span></div>
          <ul className="attn-list">
            {alerts.map(a => (
              <li key={a.key}>
                <div className="alert-line"><span className={`alert-dot ${a.level}`} /><span>{a.text}</span></div>
                {a.callerId && <div className="row-actions"><button className="kanban-btn" onClick={() => onOpenExecutive(a.callerId!)}>View executive</button></div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <LiveCallFeed data={data} onOpenExecutive={onOpenExecutive} />

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head"><h2>Leaderboard</h2><ExportMenu onExport={runExport} /></div>
        <CardTable>
          <table className="team-table roster-table">
            <thead>
              <tr>
                <th>#</th><th>Executive</th>
                <SortTh k="calls" label="Calls" /><SortTh k="connectRate" label="Connect" /><SortTh k="openLeads" label="Open leads" />
                <SortTh k="overdue" label="Overdue" /><SortTh k="sales" label="Sales" /><SortTh k="revenue" label="Revenue" /><SortTh k="conversion" label="Conversion" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => {
                const rank = rankOf.get(m.t.id)!;
                const flag = !m.t.is_active ? m.openLeads > 0 : m.callsToday === 0 || m.overdue >= 2;
                return (
                  <tr key={m.t.id} className={`clickable ${flag ? 'row-alert' : ''}`} onClick={() => onOpenExecutive(m.t.id)}>
                    <td>{rank <= 3 && m.revenue > 0 ? <span className={`rank-badge r${rank}`}>{rank}</span> : rank}</td>
                    <td className="cust">
                      {m.t.name}
                      <div className="loc">
                        {m.t.region} · <span className={`chip ${m.t.is_active ? 'delivered' : 'muted'}`}>{m.t.is_active ? 'Active' : 'Inactive'}</span>
                        {m.lastCall && <> · last call {ago(m.lastCall)}</>}
                      </div>
                    </td>
                    <td className="num-col">{m.calls}</td>
                    <td className="num-col">{m.calls ? `${m.connectRate}%` : '—'}</td>
                    <td className="num-col">{m.openLeads}</td>
                    <td className={`num-col ${m.overdue ? 'text-warn' : ''}`}>{m.overdue}</td>
                    <td className="num-col">{m.sales}</td>
                    <td className="num-col strong">{rupees(m.revenue)}</td>
                    <td className="num-col">{m.conversion}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
        <div className="panel-note">Click an executive for full details. Calls, sales and revenue are for {PERIOD_LABEL[period].toLowerCase()}; leads and follow-ups are as of now.</div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head"><h2>Lead funnel</h2><span className="panel-meta">{teamLeads.filter(l => l.vertical_id === funnelVertical).length} leads</span></div>
          <div className="filters pipeline-tabs" style={{ marginBottom: 14 }}>
            {VERTICALS.map(v => (
              <button key={v.id} className={`filter-chip ${funnelVertical === v.id ? 'active' : ''}`} onClick={() => setFunnelVertical(v.id)}>{v.name}</button>
            ))}
          </div>
          <HBarList rows={stages.map(s => ({ key: String(s.st.id), label: s.st.name, value: s.n, display: String(s.n), tip: `${s.st.name}: ${s.n} leads` }))} />
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Call outcomes</h2><span className="panel-meta">avg talk time {fmtDuration(avgTalk)}</span></div>
          <HBarList rows={OUTCOMES.map(o => {
            const n = periodActs.filter(a => a.outcome === o).length;
            return { key: o, label: o, value: n, display: `${n} · ${pct(n, periodActs.length)}%`, tip: `${o}: ${n} of ${periodActs.length} calls` };
          })} />
        </div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Calls by hour</h2>
            <span className="panel-meta">{bestHour ? `best connect rate ${bestHour.h % 12 || 12}${bestHour.h < 12 ? ' AM' : ' PM'} (${bestHour.rate}%)` : PERIOD_LABEL[period]}</span>
          </div>
          <div className="bar-chart">
            {hours.map(x => (
              <div key={x.h} className="bc-col" data-tip={`${x.h}:00–${x.h + 1}:00 · ${x.n} calls · ${x.rate}% connected`}>
                <div className={`bc-bar ${bestHour?.h === x.h ? 'now' : ''}`} style={{ height: `${(x.n / maxHour) * 100}%` }} />
                <div className="bc-label">{x.h % 12 || 12}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Calls per day · 30 days</h2><span className="panel-meta">{days.reduce((a, d) => a + d.calls, 0)} calls · {days.reduce((a, d) => a + d.sales, 0)} sales</span></div>
          <div className="bar-chart dense">
            {days.map((d, i) => (
              <div key={d.key} className="bc-col" data-tip={`${shortDate(d.key)}: ${d.calls} calls, ${d.connected} connected, ${d.sales} sales`}>
                <div className={`bc-bar ${i === days.length - 1 ? 'now' : ''}`} style={{ height: `${(d.calls / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <TelecallingLeadReport data={data} onToast={onToast} />

      <div className="panel-note">
        View-only: reassigning leads and managing staff happens in the telecalling head&apos;s dashboard. Leads, calls and follow-ups update automatically as the telecalling head assigns leads and the calling executives log calls or import calling reports.
      </div>
    </>
  );
}
