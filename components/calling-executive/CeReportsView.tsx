import React, { useState } from 'react';
import { CALL_TARGET_DAILY, CallOutcome, Followup, LeadActivity, TODAY, Telecaller, TrackerLead, VERTICALS } from '../../data/managerDashboard';
import { MONTH, daysBefore, pct, shortDate, shortDateTime } from '../../lib/format';
import { ExportFormat, ExportTable, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import HBarList from '../HBarList';
import { OUTCOMES, fmtDuration, stageName, verticalName } from '../telecaller/tcData';
import { OUTCOME_COLORS, QueueItem } from './queue';
import DateRangeSelect from '../DateRangeSelect';

type Period = 'Today' | 'Last 7 days' | 'This month';
const PERIODS: Period[] = ['Today', 'Last 7 days', 'This month'];

const inPeriod = (ts: string, period: Period) =>
  period === 'Today' ? ts.startsWith(TODAY) : period === 'Last 7 days' ? daysBefore(ts) >= 0 && daysBefore(ts) < 7 : ts.startsWith(MONTH);

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Props {
  me: Telecaller;
  leads: TrackerLead[];
  followups: Followup[];
  activities: LeadActivity[];
  queue: QueueItem[];
  onToast: (msg: string) => void;
}

interface Report {
  name: string;
  desc: string;
  count: number;
  build: () => Omit<ExportTable, 'filename'>;
}

export default function CeReportsView({ me, leads, followups, activities, queue, onToast }: Props) {
  const [period, setPeriod] = useState<Period>('Today');
  const leadOf = (id: number) => leads.find(l => l.id === id);

  const calls = activities.filter(a => inPeriod(a.created_at, period));
  const connected = calls.filter(a => a.outcome === 'Connected');
  const talkSec = calls.reduce((sum, a) => sum + (a.duration_sec ?? 0), 0);
  const timedCalls = connected.filter(a => a.duration_sec);
  const avgTalkSec = timedCalls.length ? Math.round(talkSec / timedCalls.length) : null;
  const uniqueLeads = new Set(calls.map(a => a.lead_id)).size;
  const callbacksDone = followups.filter(f => f.status === 'done' && f.completed_at && inPeriod(f.completed_at, period)).length;
  const outcomeCount = (o: CallOutcome) => calls.filter(a => a.outcome === o).length;

  // Daily calls, last 14 days
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${TODAY}T00:00:00`);
    d.setDate(d.getDate() - (13 - i));
    const key = dateKey(d);
    const dayCalls = activities.filter(a => a.created_at.startsWith(key));
    return { key, total: dayCalls.length, connected: dayCalls.filter(a => a.outcome === 'Connected').length };
  });
  const maxDay = Math.max(CALL_TARGET_DAILY, ...days.map(d => d.total));

  const byProduct = VERTICALS
    .map(v => {
      const rows = calls.filter(a => leadOf(a.lead_id)?.vertical_id === v.id);
      const conn = rows.filter(a => a.outcome === 'Connected').length;
      return { v, total: rows.length, conn };
    })
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);

  // ---- Downloadable reports ----------------------------------------------------------------
  const periodLabel = period.toLowerCase();
  const subtitle = (n: number, what: string) => `${me.name} · ${n} ${what} · ${periodLabel} · exported ${shortDate(TODAY)}`;
  const openCallbacks = followups.filter(f => f.status !== 'done');

  const reports: Report[] = [
    {
      name: 'Call log',
      desc: `Every call ${periodLabel}: time, customer, outcome, duration, stage and note.`,
      count: calls.length,
      build: () => ({
        title: `Call log · ${periodLabel}`,
        subtitle: subtitle(calls.length, 'calls'),
        columns: [
          { header: 'Time', width: 15 }, { header: 'Customer', width: 20 }, { header: 'Phone', width: 13 },
          { header: 'Outcome', width: 12 }, { header: 'Duration', width: 10 }, { header: 'Stage', width: 14 }, { header: 'Note', width: 34 },
        ],
        rows: [...calls].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(a => {
          const l = leadOf(a.lead_id);
          return [shortDateTime(a.created_at), l?.customer_name ?? '', l?.phone ?? '', a.outcome, fmtDuration(a.duration_sec), a.stage_id ? stageName(a.stage_id) : '', a.note];
        }),
      }),
    },
    {
      name: 'Daily summary',
      desc: 'Calls per day for the last 14 days, split by outcome, with talk time and target.',
      count: days.filter(d => d.total > 0).length,
      build: () => ({
        title: 'Daily call summary · last 14 days',
        subtitle: `${me.name} · daily target ${CALL_TARGET_DAILY} calls · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Date', width: 10 }, { header: 'Calls', width: 8 },
          ...OUTCOMES.map(o => ({ header: o, width: 12 })),
          { header: 'Connect rate', width: 12 }, { header: 'Talk time', width: 11 }, { header: 'Target met', width: 11 },
        ],
        rows: [...days].reverse().map(d => {
          const dayCalls = activities.filter(a => a.created_at.startsWith(d.key));
          const talk = dayCalls.reduce((s, a) => s + (a.duration_sec ?? 0), 0);
          return [
            shortDate(d.key), d.total,
            ...OUTCOMES.map(o => dayCalls.filter(a => a.outcome === o).length),
            `${pct(d.connected, d.total)}%`, fmtDuration(talk), d.total >= CALL_TARGET_DAILY ? 'Yes' : 'No',
          ];
        }),
      }),
    },
    {
      name: 'Open callbacks',
      desc: 'Every callback you still owe: due date, customer, reason and status.',
      count: openCallbacks.length,
      build: () => ({
        title: 'Open callbacks',
        subtitle: `${me.name} · ${openCallbacks.length} callbacks · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Due', width: 15 }, { header: 'Customer', width: 20 }, { header: 'Phone', width: 13 },
          { header: 'Product', width: 20 }, { header: 'Reason', width: 30 }, { header: 'Status', width: 10 },
        ],
        rows: [...openCallbacks].sort((a, b) => a.due_at.localeCompare(b.due_at)).map(f => {
          const l = leadOf(f.lead_id);
          return [shortDateTime(f.due_at), l?.customer_name ?? '', l?.phone ?? '', l ? verticalName(l.vertical_id) : '', f.note, f.status];
        }),
      }),
    },
    {
      name: 'Call queue',
      desc: 'Who is left to call right now, in priority order, with the reason for each.',
      count: queue.length,
      build: () => ({
        title: 'Call queue',
        subtitle: `${me.name} · ${queue.length} to call · exported ${shortDate(TODAY)}`,
        columns: [
          { header: '#', width: 5 }, { header: 'Customer', width: 20 }, { header: 'Phone', width: 13 }, { header: 'Reason', width: 18 },
          { header: 'Product', width: 20 }, { header: 'Stage', width: 14 }, { header: 'Last call', width: 15 },
        ],
        rows: queue.map((q, i) => [
          i + 1, q.lead.customer_name, q.lead.phone, q.reason, verticalName(q.lead.vertical_id), stageName(q.lead.stage_id),
          q.lastCall ? shortDateTime(q.lastCall.created_at) : 'Never',
        ]),
      }),
    },
  ];

  const run = async (r: Report, format: ExportFormat) => {
    if (r.count === 0) { onToast(`Nothing to export in ${r.name}`); return; }
    try {
      await exportTable(format, { filename: `${r.name.toLowerCase().replace(/\s+/g, '-')}-${TODAY}`, ...r.build() });
      onToast(`${r.name} exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  return (
    <>
      <div className="page-toolbar">
        <div className="filters date-chips">
          {PERIODS.map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
        {/* Phones: the period buttons become a single calendar dropdown. */}
        <DateRangeSelect phoneOnly className="toolbar-date" label="Period" value={period} onChange={p => setPeriod(p)}
          options={PERIODS.map(p => ({ value: p, label: p }))} />
      </div>

      <div className="scoreboard">
        <div className="score"><div className="num">{calls.length}</div><div className="label">Calls made</div></div>
        <div className="score"><div className="num">{uniqueLeads}</div><div className="label">Customers reached out to</div></div>
        <div className="score"><div className="num">{pct(connected.length, calls.length)}%</div><div className="label">Connect rate</div></div>
        <div className="score"><div className="num">{fmtDuration(talkSec)}</div><div className="label">Talk time</div></div>
        <div className="score"><div className="num">{fmtDuration(avgTalkSec)}</div><div className="label">Avg. connected call</div></div>
        <div className="score"><div className="num">{callbacksDone}</div><div className="label">Callbacks completed</div></div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Calls per day · last 14 days</h2>
          <span className="panel-meta">Daily target {CALL_TARGET_DAILY}</span>
        </div>
        <div className="bar-chart dense" role="img" aria-label="Calls per day for the last 14 days">
          {days.map(d => (
            <div key={d.key} className="bc-col" data-tip={`${shortDate(d.key)} · ${d.total} calls · ${d.connected} connected`}>
              <div className={`bc-bar ${d.key === TODAY ? 'now' : ''}`} style={{ height: `${(d.total / maxDay) * 100}%` }} />
              <div className="bc-label">{shortDate(d.key)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head"><h2>Call outcomes</h2><span className="panel-meta">{period}</span></div>
          {calls.length === 0 ? (
            <div className="loc">No calls {periodLabel}.</div>
          ) : (
            <>
              <div className="outcome-bar">
                {OUTCOMES.map(o => (
                  <span key={o} style={{ width: `${(outcomeCount(o) / calls.length) * 100}%`, background: OUTCOME_COLORS[o] }} />
                ))}
              </div>
              <div className="outcome-legend">
                {OUTCOMES.map(o => (
                  <span key={o}><i className="dot3" style={{ background: OUTCOME_COLORS[o] }} />{o} · {outcomeCount(o)} ({pct(outcomeCount(o), calls.length)}%)</span>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Calls by product</h2><span className="panel-meta">{period}</span></div>
          {byProduct.length === 0 ? (
            <div className="loc">No calls {periodLabel}.</div>
          ) : (
            <HBarList
              rows={byProduct.map(r => ({
                key: String(r.v.id),
                label: r.v.name,
                value: r.total,
                display: `${r.total}`,
                tip: `${r.v.name}: ${r.total} calls · ${r.conn} connected (${pct(r.conn, r.total)}%)`,
              }))}
            />
          )}
        </div>
      </div>

      <div className="panel-head" style={{ marginTop: 8 }}><h2>Download reports</h2></div>
      <div className="report-grid">
        {reports.map(r => (
          <div key={r.name} className="report-card">
            <h3>{r.name}</h3>
            <div className="rdesc">{r.desc}</div>
            <div className="rmeta">
              <ExportMenu onExport={format => run(r, format)} />
              <span className="rgen">{r.count} rows</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
