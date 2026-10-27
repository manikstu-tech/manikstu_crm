import React, { useMemo, useState } from 'react';
import { IndianRupee, Mail, Percent, PhoneCall, ShoppingCart, UserPlus } from 'lucide-react';
import {
  TODAY,
  TELECALLERS,
  VERTICALS,
  STAGES,
  TRACKER_PRODUCTS,
  TRACKER_SALES,
  LEAD_SOURCES,
  isWonStage,
  TrackerLead,
  Followup,
  LeadActivity,
  WebEnquiry,
  SalesOrder,
} from '../../data/managerDashboard';
import { MONTH, ORDER_CHIP, ago, dayStart, daysBefore, nowStamp, pct, rupees, rupeesShort, shortDate } from '../../lib/format';
import HBarList from '../HBarList';
import CardTable from '../CardTable';

interface DashboardViewProps {
  orders: SalesOrder[];
  leads: TrackerLead[];
  /** Shared with the telecalling dashboards (kept in sync with the server). */
  followups: Followup[];
  activities: LeadActivity[];
  onReassignLead: (leadId: number, callerId: number) => void;
  enquiries: WebEnquiry[];
  onEnquiriesChange: React.Dispatch<React.SetStateAction<WebEnquiry[]>>;
  onNavigate: (page: string) => void;
  onToast: (message: string) => void;
}

const callerName = (id: number) => TELECALLERS.find(t => t.id === id)?.name ?? 'Unassigned';
const stageById = (id: number) => STAGES.find(s => s.id === id);
const isOpen = (lead: TrackerLead) => {
  const stage = stageById(lead.stage_id);
  return !isWonStage(stage) && stage?.name !== 'Lost';
};

const ENQUIRY_TYPES: WebEnquiry['type'][] = ['sales', 'partnership', 'career', 'general'];


export default function DashboardView({ orders, leads, followups, activities, onReassignLead, enquiries, onEnquiriesChange, onNavigate, onToast }: DashboardViewProps) {
  const webOrders = orders.filter(o => o.source === 'website');
  const [verticalId, setVerticalId] = useState<number>(VERTICALS[0].id);

  const salesMonth = TRACKER_SALES.filter(s => s.sold_at.startsWith(MONTH));
  const soldLeadIds = new Set(TRACKER_SALES.map(s => s.lead_id).filter((id): id is number => id !== null));

  // 1. Headline tiles
  const tiles = useMemo(() => {
    const salesToday = salesMonth.filter(s => s.sold_at === TODAY);
    const leadsMonth = leads.filter(l => l.created_at.startsWith(MONTH));
    const converted = leadsMonth.filter(l => soldLeadIds.has(l.id)).length;
    const dueToday = followups.filter(f => f.due_at.startsWith(TODAY) && f.status === 'pending').length;
    const missedMonth = followups.filter(f => f.due_at.startsWith(MONTH) && f.status === 'missed').length;
    const ordersMonth = webOrders.filter(o => o.created_at.startsWith(MONTH));
    const newEnquiries = enquiries.filter(e => e.status === 'new');
    const oldestNew = Math.max(0, ...newEnquiries.map(e => daysBefore(e.created_at)));
    return {
      revenue: salesMonth.reduce((a, s) => a + s.amount, 0),
      revenueToday: salesToday.reduce((a, s) => a + s.amount, 0),
      leadsMonth: leadsMonth.length,
      leadsToday: leadsMonth.filter(l => l.created_at.startsWith(TODAY)).length,
      conversion: pct(converted, leadsMonth.length),
      converted,
      dueToday,
      missedMonth,
      ordersMonth: ordersMonth.length,
      ordersPending: ordersMonth.filter(o => o.status === 'pending').length,
      newEnquiries: newEnquiries.length,
      oldestNew,
    };
  }, [leads, enquiries, orders]);

  // 2. Telecaller performance
  const team = useMemo(
    () =>
      TELECALLERS.map(t => {
        const mine = leads.filter(l => l.assigned_to === t.id);
        const fu = followups.filter(f => f.caller_id === t.id && f.due_at.startsWith(MONTH));
        const sales = salesMonth.filter(s => s.caller_id === t.id);
        return {
          ...t,
          callsToday: activities.filter(a => a.caller_id === t.id && a.created_at.startsWith(TODAY)).length,
          openLeads: mine.filter(isOpen).length,
          fuDone: fu.filter(f => f.status === 'done').length,
          fuMissed: fu.filter(f => f.status === 'missed').length,
          salesCount: sales.length,
          revenue: sales.reduce((a, s) => a + s.amount, 0),
          conversion: pct(mine.filter(l => soldLeadIds.has(l.id)).length, mine.length),
        };
      }).sort((a, b) => b.revenue - a.revenue),
    [leads],
  );

  // 3. Pipeline for the selected vertical
  const pipeline = STAGES.filter(s => s.vertical_id === verticalId).map(s => ({
    stage: s,
    count: leads.filter(l => l.stage_id === s.id).length,
  }));
  const pipelineTotal = pipeline.reduce((a, p) => a + p.count, 0);
  const pipelineWon = pipeline.filter(p => isWonStage(p.stage)).reduce((a, p) => a + p.count, 0);

  // 4. Needs attention
  const leadById = (id: number) => leads.find(l => l.id === id)!;
  const overdueFollowups = followups.filter(
    f => f.status === 'missed' || (f.status === 'pending' && dayStart(f.due_at) < dayStart(TODAY)),
  ).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const overdueLeadIds = new Set(overdueFollowups.map(f => f.lead_id));
  const staleLeads = leads
    .filter(l => isOpen(l) && daysBefore(l.updated_at) >= 3 && !overdueLeadIds.has(l.id))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const unreplied = enquiries.filter(e => e.status === 'new').sort((a, b) => a.created_at.localeCompare(b.created_at));

  const reassign = (leadId: number, callerId: number) => {
    onReassignLead(leadId, callerId);
  };
  const markReplied = (id: number) => {
    onEnquiriesChange(prev => prev.map(e => (e.id === id ? { ...e, status: 'replied', replied_at: nowStamp() } : e)));
    onToast('Enquiry marked as replied');
  };

  // 5. Sales trends
  const trend = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(`${TODAY}T00:00:00`);
    d.setDate(d.getDate() - (29 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rows = TRACKER_SALES.filter(s => s.sold_at === key);
    return { key, amount: rows.reduce((a, s) => a + s.amount, 0), count: rows.length };
  });
  const trendMax = Math.max(1, ...trend.map(t => t.amount));
  const trendTotal = trend.reduce((a, t) => a + t.amount, 0);
  const trendAvg = trendTotal / trend.length;
  const trendBest = trend.reduce((best, t) => (t.amount > best.amount ? t : best), trend[0]);
  const trendToday = trend[trend.length - 1];
  // Round ₹ axis: 4 steps of 1 / 2 / 2.5 / 5 × 10ⁿ
  const niceStep = (raw: number) => {
    const exp = 10 ** Math.floor(Math.log10(raw));
    const f = raw / exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  };
  const trendStep = niceStep(trendMax / 4);
  const trendAxisMax = Math.ceil(trendMax / trendStep) * trendStep;
  const trendTicks = Array.from({ length: Math.round(trendAxisMax / trendStep) + 1 }, (_, i) => i * trendStep);
  const trendPct = (n: number) => `${(n / trendAxisMax) * 100}%`;
  const axisRupees = (n: number) => (n === 0 ? '₹0' : rupeesShort(n).replace('.0', ''));
  const salesCount = (n: number) => `${n} ${n === 1 ? 'sale' : 'sales'}`;

  const topProducts = TRACKER_PRODUCTS.map(p => {
    const rows = salesMonth.filter(s => s.product_id === p.id);
    return { p, amount: rows.reduce((a, s) => a + s.amount, 0), units: rows.reduce((a, s) => a + s.quantity, 0) };
  })
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const byVertical = VERTICALS.map(v => {
    const ids = new Set(TRACKER_PRODUCTS.filter(p => p.vertical_id === v.id).map(p => p.id));
    const rows = salesMonth.filter(s => ids.has(s.product_id));
    return { v, amount: rows.reduce((a, s) => a + s.amount, 0), count: rows.length };
  });

  const bySource = LEAD_SOURCES.map(src => {
    const rows = leads.filter(l => l.source === src);
    const conv = rows.filter(l => soldLeadIds.has(l.id)).length;
    return { src, leads: rows.length, rate: pct(conv, rows.length), conv };
  }).sort((a, b) => b.leads - a.leads);

  // 6. Website orders
  const ordersMonth = webOrders.filter(o => o.created_at.startsWith(MONTH));
  const orderCounts = (['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map(st => ({
    st,
    n: ordersMonth.filter(o => o.status === st).length,
  }));
  const unpaid = webOrders.filter(o => o.payment_status === 'unpaid' && o.status !== 'cancelled');

  return (
    // Card grid: a chart either side of the headline tiles, then the rest as cards
    <div className="dash-grid">
      {/* 3. Pipeline */}
      <div className="panel">
        <div className="panel-head">
          <h2>Lead Pipeline</h2>
          <span className="panel-meta">{pipelineTotal} leads · {pct(pipelineWon, pipelineTotal)}% won</span>
        </div>
        <div className="filters pipeline-tabs" style={{ marginBottom: 16 }}>
          {VERTICALS.map(v => (
            <button
              key={v.id}
              className={`filter-chip ${verticalId === v.id ? 'active' : ''}`}
              onClick={() => setVerticalId(v.id)}
            >
              {v.name}
            </button>
          ))}
        </div>
        <HBarList
          rows={pipeline.map(p => ({
            key: String(p.stage.id),
            label: p.stage.name,
            value: p.count,
            display: String(p.count),
            tip: `${p.stage.name}: ${p.count} leads (${pct(p.count, pipelineTotal)}%)`,
          }))}
        />
      </div>

      {/* 1. Headline tiles: this month, with today alongside */}
      <div className="stat-tiles">
        <div className="stat-tile accent">
          <IndianRupee className="stat-icon" size={24} />
          <div className="num">{rupeesShort(tiles.revenue)}</div>
          <small>+{rupeesShort(tiles.revenueToday)} today</small>
          <div className="label">Sales revenue · this month</div>
        </div>
        <div className="stat-tile">
          <UserPlus className="stat-icon" size={24} />
          <div className="num">{tiles.leadsMonth}</div>
          <small>+{tiles.leadsToday} today</small>
          <div className="label">New leads · this month</div>
        </div>
        <div className="stat-tile">
          <Percent className="stat-icon" size={24} />
          <div className="num">{tiles.conversion}%</div>
          <small>{tiles.converted} of {tiles.leadsMonth} leads</small>
          <div className="label">Conversion</div>
        </div>
        <div className="stat-tile">
          <PhoneCall className="stat-icon" size={24} />
          <div className="num">{tiles.dueToday}</div>
          <small className="warn">{tiles.missedMonth} missed</small>
          <div className="label">Follow-ups due today</div>
        </div>
        <div className="stat-tile">
          <ShoppingCart className="stat-icon" size={24} />
          <div className="num">{tiles.ordersMonth}</div>
          <small className="warn">{tiles.ordersPending} pending</small>
          <div className="label">Website orders · this month</div>
        </div>
        <div className="stat-tile">
          <Mail className="stat-icon" size={24} />
          <div className="num">{tiles.newEnquiries}</div>
          <small className="warn">oldest {tiles.oldestNew}d</small>
          <div className="label">New website enquiries</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Lead Sources</h2>
          <span className="panel-meta">Leads · % bought</span>
        </div>
        <HBarList
          rows={bySource.map(r => ({
            key: r.src,
            label: r.src,
            value: r.leads,
            display: `${r.leads} · ${r.rate}%`,
            tip: `${r.src}: ${r.leads} leads, ${r.conv} bought (${r.rate}%)`,
          }))}
        />
      </div>

      {/* 5. Sales trends */}
      <div className="panel span-2 chart-fill">
        <div className="panel-head">
          <h2>Sales · Last 30 Days</h2>
          <span className="panel-meta">{rupees(trendTotal)} total</span>
        </div>
        <div className="trend-facts">
          <div><span className="k"><i className="swatch avg" />Daily average</span><span className="v">{rupees(trendAvg)}</span></div>
          <div><span className="k">Best day</span><span className="v">{rupees(trendBest.amount)} <small>on {shortDate(trendBest.key)}</small></span></div>
          <div><span className="k"><i className="swatch now" />Today so far</span><span className="v">{rupees(trendToday.amount)} <small>{salesCount(trendToday.count)}</small></span></div>
        </div>
        <div className="trend" role="img" aria-label={`Daily sales for the last 30 days: ${rupees(trendTotal)} in total, ${rupees(trendAvg)} a day on average, best day ${shortDate(trendBest.key)} with ${rupees(trendBest.amount)}`}>
          <div className="trend-y" aria-hidden="true">
            {trendTicks.map(t => (
              <span key={t} style={{ bottom: trendPct(t) }}>{axisRupees(t)}</span>
            ))}
          </div>
          <div className="trend-plot">
            {trendTicks.map(t => <div key={t} className="trend-grid" style={{ bottom: trendPct(t) }} />)}
            <div className="trend-avg" style={{ bottom: trendPct(trendAvg) }} />
            <div className="trend-bars">
              {trend.map(t => (
                <div
                  key={t.key}
                  className="trend-col"
                  data-tip={`${shortDate(t.key)}${t.key === TODAY ? ' (today)' : ''} · ${rupees(t.amount)} · ${salesCount(t.count)}`}
                >
                  <div className={`trend-bar ${t.key === TODAY ? 'now' : ''}`} style={{ height: trendPct(t.amount) }} />
                </div>
              ))}
            </div>
          </div>
          <div className="trend-x" aria-hidden="true">
            {trend.map((t, i) => (
              <span key={t.key}>{i === 0 || i % 5 === 4 ? shortDate(t.key) : ''}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Top products and verticals stacked beside the sales chart */}
      <div className="stack">
        <div className="panel">
          <div className="panel-head">
            <h2>Top Products</h2>
            <span className="panel-meta">This month</span>
          </div>
          <HBarList
            rows={topProducts.map(r => ({
              key: String(r.p.id),
              label: r.p.name,
              value: r.amount,
              display: rupeesShort(r.amount),
              tip: `${r.p.name}: ${rupees(r.amount)} · ${r.units} units`,
            }))}
          />
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Sales by Vertical</h2>
            <span className="panel-meta">This month</span>
          </div>
          <HBarList
            rows={byVertical.map(r => ({
              key: String(r.v.id),
              label: r.v.name,
              value: r.amount,
              display: rupeesShort(r.amount),
              tip: `${r.v.name}: ${rupees(r.amount)} · ${r.count} sales`,
            }))}
          />
        </div>
      </div>

      {/* 4. Needs attention */}
      <div className="panel span-2">
        <div className="panel-head">
          <h2>Needs Attention</h2>
          <span className="panel-meta">{overdueFollowups.length + staleLeads.length + unreplied.length} items</span>
        </div>

        <div className="attn-group">
          <div className="attn-title">Overdue or missed follow-ups <span className="count-pill">{overdueFollowups.length}</span></div>
          <ul className="attn-list">
            {overdueFollowups.slice(0, 3).map(f => {
              const lead = leadById(f.lead_id);
              return (
                <li key={f.id}>
                  <div>
                    <div className="name">{lead.customer_name}</div>
                    <div className="action">{f.note} · {callerName(lead.assigned_to)}</div>
                  </div>
                  <div className="attn-side">
                    <span className="when">{f.status === 'missed' ? 'Missed' : 'Due'} {shortDate(f.due_at)}</span>
                    <select
                      className="reassign"
                      value=""
                      aria-label={`Reassign ${lead.customer_name}`}
                      onChange={e => reassign(lead.id, Number(e.target.value))}
                    >
                      <option value="" disabled>Reassign…</option>
                      {TELECALLERS.filter(t => t.is_active && t.id !== lead.assigned_to).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
          {overdueFollowups.length > 3 && <div className="attn-more">+ {overdueFollowups.length - 3} more</div>}
        </div>

        <div className="attn-group">
          <div className="attn-title">Leads untouched for 3+ days <span className="count-pill">{staleLeads.length}</span></div>
          <ul className="attn-list">
            {staleLeads.slice(0, 2).map(l => (
              <li key={l.id}>
                <div>
                  <div className="name">{l.customer_name}</div>
                  <div className="action">{stageById(l.stage_id)?.name} · {callerName(l.assigned_to)}</div>
                </div>
                <div className="attn-side">
                  <span className="when">{ago(l.updated_at)}</span>
                  <select
                    className="reassign"
                    value=""
                    aria-label={`Reassign ${l.customer_name}`}
                    onChange={e => reassign(l.id, Number(e.target.value))}
                  >
                    <option value="" disabled>Reassign…</option>
                    {TELECALLERS.filter(t => t.is_active && t.id !== l.assigned_to).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
          {staleLeads.length > 2 && <div className="attn-more">+ {staleLeads.length - 2} more</div>}
        </div>

        <div className="attn-group">
          <div className="attn-title">Website enquiries not replied <span className="count-pill">{unreplied.length}</span></div>
          <ul className="attn-list">
            {unreplied.slice(0, 2).map(e => (
              <li key={e.id}>
                <div>
                  <div className="name">{e.name}</div>
                  <div className="action">{e.type} · {e.message}</div>
                </div>
                <div className="attn-side">
                  <span className="when">{ago(e.created_at)}</span>
                  <button className="kanban-btn" onClick={() => markReplied(e.id)}>Mark replied</button>
                </div>
              </li>
            ))}
          </ul>
          {unreplied.length > 2 && <div className="attn-more">+ {unreplied.length - 2} more</div>}
        </div>
      </div>

      {/* 7. Website enquiries */}
      <div className="panel wide-at-2">
        <div className="panel-head">
          <h2>Website Enquiries</h2>
          {unreplied.length > 0 && <span className="panel-meta">Oldest waiting {daysBefore(unreplied[0].created_at)} days</span>}
        </div>
        <div className="mini-stats">
          {ENQUIRY_TYPES.map(type => (
            <div key={type} className="mini-stat">
              <div className="mini-num">{unreplied.filter(e => e.type === type).length}</div>
              <div className="mini-label">new {type}</div>
            </div>
          ))}
        </div>
        <ul className="lead-list">
          {enquiries.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map(e => (
            <li key={e.id}>
              <div>
                <div className="name">{e.name} <span className="type-tag">{e.type}</span></div>
                <div className="action">{e.message}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="when" style={{ color: 'var(--ink-soft)' }}>{ago(e.created_at)}</div>
                <span className={`chip ${e.status === 'new' ? 'pending' : e.status === 'replied' ? 'delivered' : 'muted'}`}>{e.status}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 2. Telecaller performance */}
      <div className="panel span-3">
        <div className="panel-head">
          <h2>Telecaller Performance</h2>
        </div>
        <CardTable>
          <table className="team-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Telecaller</th>
                <th className="num-col">Calls today</th>
                <th className="num-col">Open leads</th>
                <th className="num-col">Follow-ups done / missed</th>
                <th className="num-col">Sales</th>
                <th className="num-col">Revenue</th>
                <th className="num-col">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {team.map((t, i) => (
                <tr key={t.id} className={t.callsToday === 0 ? 'row-alert' : undefined}>
                  <td>{i + 1}</td>
                  <td className="cust">
                    {t.name}
                    {t.callsToday === 0 && <div><span className="chip pending">No calls today</span></div>}
                  </td>
                  <td className="num-col">{t.callsToday}</td>
                  <td className="num-col">{t.openLeads}</td>
                  <td className="num-col">
                    {t.fuDone} / <span className={t.fuMissed > 0 ? 'text-warn' : undefined}>{t.fuMissed}</span>
                  </td>
                  <td className="num-col">{t.salesCount}</td>
                  <td className="num-col strong">{rupees(t.revenue)}</td>
                  <td className="num-col">{t.conversion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
        <div className="panel-note">Sales, revenue and follow-ups are for this month. Conversion is sold leads ÷ all assigned leads.</div>
      </div>

      {/* 6. Website orders */}
      <div className="panel span-3">
        <div className="panel-head">
          <h2>Website Orders</h2>
          <span className="link" onClick={() => onNavigate('orders')}>All orders</span>
        </div>
        <div className="mini-stats">
          {orderCounts.map(c => (
            <div key={c.st} className="mini-stat">
              <div className="mini-num">{c.n}</div>
              <span className={`chip ${ORDER_CHIP[c.st]}`}>{c.st}</span>
            </div>
          ))}
        </div>
        {unpaid.length > 0 && (
          <div className="inline-alert">
            {unpaid.length} orders unpaid · {rupees(unpaid.reduce((a, o) => a + o.total, 0))} to collect
          </div>
        )}
        <CardTable>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th className="num-col">Total</th>
                <th>Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {webOrders.slice(0, 5).map(o => (
                <tr key={o.id}>
                  <td>
                    {o.order_number}
                    <div className="loc">{shortDate(o.created_at)}</div>
                  </td>
                  <td className="cust">{o.customer_name}</td>
                  <td className="num-col">{rupees(o.total)}</td>
                  <td><span className={`chip ${ORDER_CHIP[o.status]}`}>{o.status}</span></td>
                  <td className={o.payment_status === 'unpaid' ? 'text-warn' : undefined}>{o.payment_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
      </div>
    </div>
  );
}
