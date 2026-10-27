import React, { useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, IndianRupee, Percent, PhoneCall, Users } from 'lucide-react';
import { TODAY, TRACKER_SALES, VERTICALS, CallOutcome, Telecaller } from '../../data/managerDashboard';
import { ago, daysBefore, pct, rupees, rupeesShort, shortDate, shortDateTime } from '../../lib/format';
import HBarList from '../HBarList';
import { TargetRing } from '../telecaller/shared';
import { OUTCOMES, TeamData, fmtDuration, isOpenLead, isOverdue, stageName, time12, verticalName } from '../telecaller/tcData';
import { CALL_TARGET_DAILY, callsPerDay, execMetrics, funnel } from '../views/telecallingMetrics';
import { StatusChip } from '../telecaller/shared';
import { Assignment, assignmentOf } from '../../lib/trackerOps';
import CardTable from '../CardTable';

const OUTCOME_CHIP: Record<CallOutcome, string> = {
  Connected: 'delivered', 'No answer': 'transit', Busy: 'pending', 'Wrong number': 'muted', 'Not interested': 'muted',
};
const HOURS = Array.from({ length: 10 }, (_, i) => 9 + i); // 9 AM – 6 PM
const hour12 = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;

interface Props {
  data: TeamData;
  /** When each lead was assigned and by whom (from the shared tracker data), for "assigned to me today". */
  assignments?: Record<string, Assignment>;
  me: Telecaller;
  /** How many leads are queued to call now. */
  queueCount: number;
  onStartCalling: () => void;
  onOpenCallbacks: () => void;
  onCallLead: (leadId: number, followupId?: number) => void;
  onFollowupDone: (followupId: number) => void;
}

/** Calling executive's landing page: their day, work queue, callbacks, pipeline and performance,
 * in the same card design as the manager dashboard. */
export default function CeOverview({ data, assignments, me, queueCount, onStartCalling, onOpenCallbacks, onCallLead, onFollowupDone }: Props) {
  const [verticalId, setVerticalId] = useState<number>(VERTICALS[0].id);
  const month = useMemo(() => execMetrics(data, me, 'month'), [data, me]);
  const today = useMemo(() => execMetrics(data, me, 'today'), [data, me]);

  const myLeads = data.leads.filter(l => l.assigned_to === me.id);
  const myActs = data.activities.filter(a => a.caller_id === me.id);
  const leadName = (id: number) => data.leads.find(l => l.id === id)?.customer_name ?? '—';
  const newToday = myLeads.filter(l => l.created_at.startsWith(TODAY)).length;

  // Leads the telecalling head handed to this executive today (newly imported, enquiries assigned, or moved to them), newest first
  const assignedToday = myLeads
    .map(l => ({ lead: l, ...assignmentOf({ assignments }, l) }))
    .filter(x => x.at.startsWith(TODAY))
    .sort((a, b) => b.at.localeCompare(a.at));
  const lastCall = (leadId: number) => {
    for (let i = myActs.length - 1; i >= 0; i--) if (myActs[i].lead_id === leadId) return myActs[i];
    return undefined;
  };
  const assignedTodayUncalled = assignedToday.filter(x => !lastCall(x.lead.id)).length;

  // Upcoming callbacks: overdue first, then by due date
  const callbacks = data.followups
    .filter(f => f.caller_id === me.id && f.status !== 'done')
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || a.due_at.localeCompare(b.due_at));

  // Needs attention: leads open and not touched for 3+ days
  const staleLeads = myLeads
    .filter(l => isOpenLead(l) && daysBefore(l.updated_at) >= 3)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  const pipeline = funnel(data, verticalId, me.id);
  const pipelineTotal = pipeline.reduce((a, p) => a + p.n, 0);

  const days = callsPerDay(data, 14, me.id);
  const maxDay = Math.max(CALL_TARGET_DAILY, ...days.map(d => d.calls));

  // Best time to call: connect rate by hour (from all of this caller's calls)
  const byHour = HOURS.map(h => {
    const inHour = myActs.filter(a => Number(a.created_at.slice(11, 13)) === h);
    return { h, calls: inHour.length, rate: pct(inHour.filter(a => a.outcome === 'Connected').length, inHour.length) };
  });
  const maxHourCalls = Math.max(1, ...byHour.map(x => x.calls));
  const bestHour = [...byHour].filter(x => x.calls >= 3).sort((a, b) => b.rate - a.rate)[0];

  const recent = [...myActs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const soldThisMonth = TRACKER_SALES.filter(s => s.caller_id === me.id && s.sold_at.startsWith(TODAY.slice(0, 7)));

  const callbackWhen = (due: string, missed: boolean) => {
    if (missed || daysBefore(due) > 0) return { text: `${daysBefore(due)}d overdue`, warn: true };
    if (due.startsWith(TODAY)) return { text: `Today, ${time12(due)}`, warn: false };
    return { text: shortDate(due), warn: false };
  };

  return (
    <div className="dash-grid">
      {/* 1. Today: target ring + start calling */}
      <div className="panel ce-today">
        <div className="panel-head">
          <h2>Today</h2>
          <span className="panel-meta">{today.firstCallToday ? `First call ${time12(today.firstCallToday)}` : 'Not started yet'}</span>
        </div>
        <div className="ce-today-body">
          <div className="ce-ring">
            <TargetRing done={today.callsToday} target={CALL_TARGET_DAILY} />
            <div className="loc">calls today</div>
          </div>
          <div className="mini-stats ce-today-stats">
            <div className="mini-stat"><div className="mini-num">{today.connected}</div><div className="mini-label">connected</div></div>
            <div className="mini-stat"><div className="mini-num">{today.calls ? `${today.connectRate}%` : '—'}</div><div className="mini-label">connect rate</div></div>
            <div className="mini-stat"><div className="mini-num">{fmtDuration(today.avgTalkSec)}</div><div className="mini-label">avg talk</div></div>
          </div>
        </div>
        <button className="btn-primary ce-start" onClick={onStartCalling}>
          <PhoneCall size={16} /> Start calling{queueCount > 0 ? ` · ${queueCount} in queue` : ''}
        </button>
      </div>

      {/* 5. Performance tiles */}
      <div className="stat-tiles">
        <div className="stat-tile accent">
          <PhoneCall className="stat-icon" size={24} />
          <div className="num">{today.callsToday}<small style={{ color: 'var(--ink-soft)', fontWeight: 600 }}> / {CALL_TARGET_DAILY}</small></div>
          <small>{Math.max(0, CALL_TARGET_DAILY - today.callsToday)} to go</small>
          <div className="label">Calls today</div>
        </div>
        <div className="stat-tile">
          <CalendarClock className="stat-icon" size={24} />
          <div className="num">{today.dueToday}</div>
          {today.overdue > 0 ? <small className="warn">{today.overdue} overdue</small> : <small>on track</small>}
          <div className="label">Callbacks due today</div>
        </div>
        <div className="stat-tile">
          <Users className="stat-icon" size={24} />
          <div className="num">{month.openLeads}</div>
          {month.staleLeads > 0 ? <small className="warn">{month.staleLeads} untouched 3d+</small> : <small>+{newToday} new today</small>}
          <div className="label">Open leads</div>
        </div>
        <div className="stat-tile">
          <IndianRupee className="stat-icon" size={24} />
          <div className="num">{rupeesShort(month.revenue)}</div>
          <small>{month.sales} sales</small>
          <div className="label">Revenue · this month</div>
        </div>
        <div className="stat-tile">
          <Percent className="stat-icon" size={24} />
          <div className="num">{month.conversion}%</div>
          <small>{month.calls} calls · {month.connectRate}% connected</small>
          <div className="label">Conversion · this month</div>
        </div>
        <div className="stat-tile">
          <CalendarClock className="stat-icon" size={24} />
          <div className="num">{month.keptRate === null ? '—' : `${month.keptRate}%`}</div>
          {month.missed > 0 ? <small className="warn">{month.missed} missed</small> : <small>kept</small>}
          <div className="label">Follow-ups kept</div>
        </div>
      </div>

      {/* 4. My leads pipeline */}
      <div className="panel">
        <div className="panel-head">
          <h2>My leads</h2>
          <span className="panel-meta">{pipelineTotal} in {verticalName(verticalId).toLowerCase()}</span>
        </div>
        <div className="filters pipeline-tabs" style={{ marginBottom: 16 }}>
          {VERTICALS.map(v => (
            <button key={v.id} className={`filter-chip ${verticalId === v.id ? 'active' : ''}`} onClick={() => setVerticalId(v.id)}>{v.name}</button>
          ))}
        </div>
        <HBarList rows={pipeline.map(p => ({ key: String(p.st.id), label: p.st.name, value: p.n, display: String(p.n), tip: `${p.st.name}: ${p.n} leads` }))} />
      </div>

      {/* Leads assigned to me today */}
      <div className="panel span-3">
        <div className="panel-head">
          <h2>Assigned to me today</h2>
          <span className="panel-meta">
            {assignedToday.length === 0 ? 'Nothing new yet' : `${assignedToday.length} lead${assignedToday.length === 1 ? '' : 's'} · ${assignedTodayUncalled} not called yet`}
          </span>
        </div>
        <CardTable>
          <table className="team-table">
            <thead>
              <tr><th>Lead</th><th>Product</th><th>Source</th><th>Assigned</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {assignedToday.length === 0 && (
                <tr><td colSpan={6} className="loc" style={{ textAlign: 'center', padding: 20 }}>
                  No leads assigned to you today. New leads from the telecalling head appear here as soon as they are assigned.
                </td></tr>
              )}
              {assignedToday.slice(0, 8).map(({ lead, at, by }) => {
                const last = lastCall(lead.id);
                return (
                  <tr key={lead.id}>
                    <td className="cust">{lead.customer_name}<div className="loc">{lead.phone}</div></td>
                    <td>{verticalName(lead.vertical_id)}</td>
                    <td>{lead.source}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{time12(at)}{by && <div className="loc">by {by}</div>}</td>
                    <td>{last ? <><StatusChip status={last.outcome} /><div className="loc">{ago(last.created_at)}</div></> : <span className="chip pending">Not called yet</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><button className="btn-primary btn-small" onClick={() => onCallLead(lead.id)}>{last ? 'Call again' : 'Call now'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
        {assignedToday.length > 8 && (
          <div className="pager"><span>{assignedToday.length - 8} more assigned today</span><button className="link-btn" onClick={onOpenCallbacks}>Open call desk <ArrowRight size={13} /></button></div>
        )}
      </div>

      {/* 2 + 3. Callbacks / what to do now */}
      <div className="panel span-2">
        <div className="panel-head">
          <h2>My callbacks</h2>
          <button className="link-btn" onClick={onOpenCallbacks}>Open call desk <ArrowRight size={13} /></button>
        </div>
        <CardTable>
          <table className="team-table">
            <thead>
              <tr><th>Lead</th><th>Reason</th><th>Due</th><th></th></tr>
            </thead>
            <tbody>
              {callbacks.length === 0 && <tr><td colSpan={4} className="loc" style={{ textAlign: 'center', padding: 20 }}>No pending callbacks. Nicely done.</td></tr>}
              {callbacks.slice(0, 6).map(f => {
                const when = callbackWhen(f.due_at, f.status === 'missed');
                return (
                  <tr key={f.id}>
                    <td className="cust">{leadName(f.lead_id)}</td>
                    <td>{f.note}</td>
                    <td className={when.warn ? 'text-warn' : undefined} style={{ whiteSpace: 'nowrap' }}>{when.text}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-primary btn-small" onClick={() => onCallLead(f.lead_id, f.id)}>Call</button>
                      <button className="kanban-btn" style={{ marginLeft: 6 }} onClick={() => onFollowupDone(f.id)}>Done</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
      </div>

      {/* 5. Calls per day */}
      <div className="panel">
        <div className="panel-head">
          <h2>Calls · last 14 days</h2>
          <span className="panel-meta">target {CALL_TARGET_DAILY}/day</span>
        </div>
        <div className="bar-chart dense">
          {days.map((d, i) => (
            <div key={d.key} className="bc-col" data-tip={`${shortDate(d.key)}: ${d.calls} calls, ${d.connected} connected`}>
              <div className={`bc-bar ${i === days.length - 1 ? 'now' : ''}`} style={{ height: `${(d.calls / maxDay) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>

      {/* 6. Best time to call */}
      <div className="panel">
        <div className="panel-head">
          <h2>Best time to call</h2>
          <span className="panel-meta">{bestHour ? `best ${hour12(bestHour.h)} (${bestHour.rate}%)` : 'connect rate by hour'}</span>
        </div>
        <div className="bar-chart">
          {byHour.map(x => (
            <div key={x.h} className="bc-col" data-tip={`${hour12(x.h)}: ${x.calls} calls · ${x.rate}% connected`}>
              <div className={`bc-bar ${bestHour?.h === x.h ? 'now' : ''}`} style={{ height: `${(x.calls / maxHourCalls) * 100}%` }} />
              <div className="bc-label">{hour12(x.h)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Call outcomes */}
      <div className="panel">
        <div className="panel-head">
          <h2>Call outcomes</h2>
          <span className="panel-meta">this month</span>
        </div>
        <HBarList rows={OUTCOMES.map(o => ({ key: o, label: o, value: month.outcomes[o], display: `${month.outcomes[o]} · ${pct(month.outcomes[o], month.calls)}%`, tip: `${o}: ${month.outcomes[o]} calls` }))} />
      </div>

      {/* 2. Needs attention */}
      <div className="panel">
        <div className="panel-head">
          <h2>Needs attention</h2>
          <span className="panel-meta">{callbacks.filter(f => isOverdue(f)).length + staleLeads.length} items</span>
        </div>
        <ul className="attn-list">
          {callbacks.filter(f => isOverdue(f)).slice(0, 3).map(f => (
            <li key={`f${f.id}`}>
              <div><div className="name">{leadName(f.lead_id)}</div><div className="action">Overdue callback · {f.note}</div></div>
              <div className="attn-side"><button className="btn-primary btn-small" onClick={() => onCallLead(f.lead_id, f.id)}>Call</button></div>
            </li>
          ))}
          {staleLeads.slice(0, 4).map(l => (
            <li key={`l${l.id}`}>
              <div><div className="name">{l.customer_name}</div><div className="action">Not touched {ago(l.updated_at)} · {stageName(l.stage_id)}</div></div>
              <div className="attn-side"><button className="btn-primary btn-small" onClick={() => onCallLead(l.id)}>Call</button></div>
            </li>
          ))}
          {callbacks.filter(isOverdue).length + staleLeads.length === 0 && <li><div className="action">Nothing overdue. You&apos;re on top of it.</div></li>}
        </ul>
      </div>

      {/* 7. Recent calls */}
      <div className="panel span-3">
        <div className="panel-head">
          <h2>Recent calls</h2>
          <span className="panel-meta">{soldThisMonth.length} sales this month</span>
        </div>
        <CardTable titleCol={1}>
          <table className="team-table">
            <thead>
              <tr><th>When</th><th>Lead</th><th>Outcome</th><th>Talk time</th><th>Stage after</th><th>Note</th></tr>
            </thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={6} className="loc" style={{ textAlign: 'center', padding: 20 }}>No calls logged yet today.</td></tr>}
              {recent.map(a => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.created_at.startsWith(TODAY) ? time12(a.created_at) : shortDateTime(a.created_at)}</td>
                  <td className="cust">{leadName(a.lead_id)}</td>
                  <td><span className={`chip ${OUTCOME_CHIP[a.outcome]}`}>{a.outcome}</span></td>
                  <td>{fmtDuration(a.duration_sec)}</td>
                  <td>{a.stage_id ? stageName(a.stage_id) : '—'}</td>
                  <td>{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
      </div>
    </div>
  );
}
