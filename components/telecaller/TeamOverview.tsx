import React, { useMemo, useState } from 'react';
import { CalendarClock, IndianRupee, Percent, PhoneCall, ShoppingCart, UserPlus, X } from 'lucide-react';
import { TELECALLERS, TODAY, VERTICALS, SalesOrder, WebEnquiry, Telecaller } from '../../data/managerDashboard';
import { ORDER_CHIP, ago, daysBefore, pct, rupees, rupeesShort, shortDate } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import HBarList from '../HBarList';
import ExportMenu from '../ExportMenu';
import {
  PERIOD_LABEL,
  Period,
  StaffStats,
  TeamData,
  callerName,
  inPeriod,
  isOpenLead,
  isOverdue,
  productName,
  salesByMonth,
  stageName,
  stagesFor,
  staffStats,
  teamAlerts,
  verticalName,
} from './tcData';

interface Props {
  data: TeamData;
  orders: SalesOrder[];
  enquiries: WebEnquiry[];
  onReassign: (leadIds: number[], toCallerId: number) => void;
  onOpenLeads: (callerId?: number) => void;
  onOpenFollowups: (callerId?: number) => void;
  onToast: (message: string) => void;
}

type SortKey = 'revenue' | 'calls' | 'connectRate' | 'openLeads' | 'overdueFollowups' | 'sales' | 'conversion';

export default function TeamOverview({ data, orders, enquiries, onReassign, onOpenLeads, onOpenFollowups, onToast }: Props) {
  const [period, setPeriod] = useState<Period>('today');
  const [verticalId, setVerticalId] = useState<number | 'all'>('all');
  const [region, setRegion] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [openStaffId, setOpenStaffId] = useState<number | null>(null);
  const [pipelineVertical, setPipelineVertical] = useState(VERTICALS[0].id);

  const allStats = useMemo(() => staffStats(data, period, verticalId), [data, period, verticalId]);
  const stats = allStats.filter(s => region === 'all' || s.t.region === region);
  const teamIds = new Set(stats.map(s => s.t.id));
  const alerts = teamAlerts(stats);
  const sorted = [...stats].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  const rankOf = new Map([...stats].sort((a, b) => b.revenue - a.revenue).map((s, i) => [s.t.id, i + 1]));

  // Team totals
  const sum = (k: keyof StaffStats) => stats.reduce((a, s) => a + (s[k] as number), 0);
  const leadsInScope = data.leads.filter(l => teamIds.has(l.assigned_to) && (verticalId === 'all' || l.vertical_id === verticalId));
  const newLeads = leadsInScope.filter(l => inPeriod(l.created_at, period)).length;
  const soldLeadIds = new Set(data.sales.map(s => s.lead_id));
  const teamConversion = pct(leadsInScope.filter(l => soldLeadIds.has(l.id)).length, leadsInScope.length);
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const newEnquiries = enquiries.filter(e => e.status === 'new').length;

  // Charts
  const workload = stats.filter(s => s.t.is_active || s.openLeads > 0).sort((a, b) => b.openLeads - a.openLeads);
  const pipeline = stagesFor(pipelineVertical).map(st => {
    const inStage = data.leads.filter(l => l.stage_id === st.id && teamIds.has(l.assigned_to));
    return { st, n: inStage.length, stuck: inStage.filter(l => isOpenLead(l) && daysBefore(l.updated_at) >= 7).length };
  });
  const teamSales = data.sales.filter(s => teamIds.has(s.caller_id));
  const months = salesByMonth(teamSales);
  const maxMonth = Math.max(1, ...months.map(m => m.amount));
  const periodSales = teamSales.filter(s => inPeriod(s.sold_at, period));
  const byProduct = Array.from(periodSales.reduce((m, s) => m.set(s.product_id, (m.get(s.product_id) ?? 0) + s.amount), new Map<number, number>()))
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const orderCounts = (['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map(st => ({ st, n: orders.filter(o => o.status === st).length }));

  // Activity feed: recent sales, orders and enquiries, newest first
  const feed = [
    ...teamSales.slice(-15).map(s => ({ at: `${s.sold_at}T23:59`, kind: 'sale' as const, title: `${callerName(s.caller_id)} sold ${productName(s.product_id)} × ${s.quantity}`, sub: `${s.customer_name} · ${rupees(s.amount)}` })),
    ...orders.slice(0, 10).map(o => ({ at: o.created_at, kind: 'order' as const, title: `Order ${o.order_number} · ${o.status}`, sub: `${o.customer_name} · ${rupees(o.total)}` })),
    ...enquiries.slice(0, 10).map(e => ({ at: e.created_at, kind: 'enquiry' as const, title: `New enquiry from ${e.name}`, sub: `${e.type} · ${e.message}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  const regions = Array.from(new Set(TELECALLERS.map(t => t.region)));
  const openStaff = allStats.find(s => s.t.id === openStaffId) ?? null;

  const exportTeam = async (format: ExportFormat) => {
    try {
      await exportTable(format, {
        filename: `team-performance-${TODAY}`,
        title: 'Telecalling team performance',
        subtitle: `${PERIOD_LABEL[period]} · ${verticalId === 'all' ? 'all products' : verticalName(verticalId)} · ${region === 'all' ? 'all regions' : region} · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Telecaller', width: 18 }, { header: 'Region', width: 12 }, { header: 'Status', width: 9 },
          { header: 'Calls', width: 7 }, { header: 'Connect %', width: 9 }, { header: 'Open leads', width: 9 },
          { header: 'Follow-ups pending', width: 10 }, { header: 'Overdue', width: 8 }, { header: 'Sales', width: 7 },
          { header: 'Revenue', width: 11, money: true }, { header: 'Conversion %', width: 10 },
        ],
        rows: sorted.map(s => [
          s.t.name, s.t.region, s.t.is_active ? 'Active' : 'Inactive', s.calls, s.connectRate, s.openLeads,
          s.pendingFollowups, s.overdueFollowups, s.sales, s.revenue, s.conversion,
        ]),
      });
      onToast(`Team performance exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="num-col">
      <button className={`sort-btn ${sortKey === k ? 'active' : ''}`} onClick={() => setSortKey(k)}>
        {label}{sortKey === k ? ' ▾' : ''}
      </button>
    </th>
  );

  const monthTotal = months.reduce((a, m) => a + m.amount, 0);
  const monthAvg = Math.round(monthTotal / Math.max(1, months.length));
  const bestMonth = months.reduce((b, m) => (m.amount > b.amount ? m : b), months[0]);
  const thisMonth = months[months.length - 1];

  return (
    <>
      {/* Filters */}
      <div className="page-toolbar">
        <div className="filters">
          {(['today', '7d', 'month'] as Period[]).map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
          ))}
        </div>
        <div className="toolbar-actions">
          <select className="filter-select" value={verticalId} onChange={e => setVerticalId(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Product">
            <option value="all">All products</option>
            {VERTICALS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select className="filter-select" value={region} onChange={e => setRegion(e.target.value)} aria-label="Region">
            <option value="all">All regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Card grid, same layout as the manager dashboard */}
      <div className="dash-grid">
        {/* Pipeline */}
        <div className="panel">
          <div className="panel-head">
            <h2>Pipeline</h2>
            <span className="panel-meta">{pipeline.reduce((a, p) => a + p.stuck, 0)} stuck 7+ days</span>
          </div>
          <div className="filters" style={{ marginBottom: 16 }}>
            {VERTICALS.map(v => (
              <button key={v.id} className={`filter-chip ${pipelineVertical === v.id ? 'active' : ''}`} onClick={() => setPipelineVertical(v.id)}>{v.name}</button>
            ))}
          </div>
          <HBarList rows={pipeline.map(p => ({
            key: String(p.st.id),
            label: p.st.name,
            value: p.n,
            display: p.stuck ? `${p.n} · ${p.stuck} stuck` : String(p.n),
            tip: `${p.st.name}: ${p.n} leads${p.stuck ? `, ${p.stuck} not moved in 7+ days` : ''}`,
          }))} />
        </div>

        {/* Headline tiles */}
        <div className="stat-tiles">
          <div className="stat-tile accent">
            <IndianRupee className="stat-icon" size={24} />
            <div className="num">{rupeesShort(sum('revenue'))}</div>
            <small>{sum('sales')} sales</small>
            <div className="label">Revenue · {PERIOD_LABEL[period].toLowerCase()}</div>
          </div>
          <div className="stat-tile">
            <PhoneCall className="stat-icon" size={24} />
            <div className="num">{sum('calls')}</div>
            <small>{pct(sum('connected'), sum('calls'))}% connected</small>
            <div className="label">Calls · {PERIOD_LABEL[period].toLowerCase()}</div>
          </div>
          <div className="stat-tile">
            <UserPlus className="stat-icon" size={24} />
            <div className="num">{sum('openLeads')}</div>
            <small>+{newLeads} new</small>
            <div className="label">Open leads</div>
          </div>
          <div className="stat-tile">
            <CalendarClock className="stat-icon" size={24} />
            <div className="num">{sum('pendingFollowups')}</div>
            <small className="warn">{sum('overdueFollowups')} overdue</small>
            <div className="label">Follow-ups pending</div>
          </div>
          <div className="stat-tile">
            <Percent className="stat-icon" size={24} />
            <div className="num">{teamConversion}%</div>
            <small>of {leadsInScope.length} leads</small>
            <div className="label">Team conversion</div>
          </div>
          <div className="stat-tile">
            <ShoppingCart className="stat-icon" size={24} />
            <div className="num">{pendingOrders}</div>
            <small className="warn">{newEnquiries} new enquiries</small>
            <div className="label">Orders to confirm</div>
          </div>
        </div>

        {/* Workload */}
        <div className="panel">
          <div className="panel-head">
            <h2>Workload</h2>
            <button className="link link-btn" onClick={() => onOpenLeads()}>Assign leads</button>
          </div>
          <HBarList rows={workload.map(s => ({
            key: String(s.t.id),
            label: s.t.is_active ? s.t.name : `${s.t.name} (inactive)`,
            value: s.openLeads,
            display: `${s.openLeads} open`,
            tip: `${s.t.name}: ${s.openLeads} open leads, ${s.staleLeads} untouched 3+ days`,
          }))} />
        </div>

        {/* Team sales */}
        <div className="panel span-2 chart-fill">
          <div className="panel-head">
            <h2>Team Sales · 6 Months</h2>
            <span className="panel-meta">{rupees(monthTotal)} total</span>
          </div>
          <div className="trend-facts">
            <div><span className="k">Monthly average</span><span className="v">{rupees(monthAvg)}</span></div>
            <div><span className="k">Best month</span><span className="v">{rupees(bestMonth.amount)} <small>in {bestMonth.label}</small></span></div>
            <div><span className="k"><i className="swatch now" />This month so far</span><span className="v">{rupees(thisMonth.amount)} <small>{thisMonth.count} sales</small></span></div>
          </div>
          <div className="bar-chart team-sales-chart" role="img" aria-label={`Team sales for the last 6 months: ${rupees(monthTotal)} in total`}>
            {months.map((m, i) => (
              <div key={m.key} className="bc-col" data-tip={`${m.label}: ${rupees(m.amount)} · ${m.count} sales${i === months.length - 1 ? ' (month to date)' : ''}`}>
                <div className={`bc-bar ${i === months.length - 1 ? 'now' : ''}`} style={{ height: `${(m.amount / maxMonth) * 100}%` }} />
                <div className="bc-label">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products and order status stacked beside the sales chart */}
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h2>Top Products</h2><span className="panel-meta">{PERIOD_LABEL[period]}</span></div>
            {byProduct.length === 0
              ? <div className="loc">No sales in this period yet.</div>
              : <HBarList rows={byProduct.map(([id, amount]) => ({ key: String(id), label: productName(id), value: amount, display: rupeesShort(amount), tip: `${productName(id)}: ${rupees(amount)}` }))} />}
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Order Status</h2><span className="panel-meta">{orders.length} orders</span></div>
            <HBarList rows={orderCounts.map(c => ({ key: c.st, label: c.st[0].toUpperCase() + c.st.slice(1), value: c.n, display: String(c.n), tip: `${c.st}: ${c.n} orders` }))} />
            <div className="loc" style={{ marginTop: 12 }}>
              <span className={`chip ${ORDER_CHIP.pending}`}>{pendingOrders} pending</span> orders need a confirmation call.
            </div>
          </div>
        </div>

        {/* Needs attention */}
        <div className="panel span-2 team-alerts">
          <div className="panel-head"><h2>Needs Your Attention</h2><span className="panel-meta">{alerts.length} items</span></div>
          {alerts.length === 0 ? <div className="loc">All clear: nothing needs you right now.</div> : (
            <ul className="attn-list">
              {alerts.map(a => (
                <li key={a.key}>
                  <div className="alert-line">
                    <span className={`alert-dot ${a.level}`} />
                    <span>{a.text}</span>
                  </div>
                  <div className="row-actions">
                    {a.key.startsWith('inactive') && <button className="kanban-btn" onClick={() => setOpenStaffId(a.callerId!)}>Reassign leads</button>}
                    {a.key.startsWith('overdue') && <button className="kanban-btn" onClick={() => onOpenFollowups(a.callerId)}>View follow-ups</button>}
                    {a.key.startsWith('nocalls') && <button className="kanban-btn" onClick={() => setOpenStaffId(a.callerId!)}>View staff</button>}
                    {a.key === 'stale' && <button className="kanban-btn" onClick={() => onOpenLeads()}>View leads</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent activity */}
        <div className="panel wide-at-2">
          <div className="panel-head"><h2>Recent Activity</h2><span className="panel-meta">latest {feed.length}</span></div>
          <ul className="attn-list">
            {feed.map((f, i) => (
              <li key={i}>
                <div>
                  <div className="name"><span className={`feed-kind ${f.kind}`}>{f.kind}</span> {f.title}</div>
                  <div className="action">{f.sub}</div>
                </div>
                <div className="attn-side"><span className="loc">{f.kind === 'sale' ? shortDate(f.at) : ago(f.at)}</span></div>
              </li>
            ))}
          </ul>
        </div>

        {/* Team roster */}
        <div className="panel span-3">
          <div className="panel-head">
            <h2>Telecalling Team</h2>
            <ExportMenu onExport={exportTeam} />
          </div>
          <div className="table-wrap">
            <table className="team-table roster-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Telecaller</th>
                  <SortTh k="calls" label="Calls" />
                  <SortTh k="connectRate" label="Connect" />
                  <SortTh k="openLeads" label="Open leads" />
                  <SortTh k="overdueFollowups" label="Follow-ups" />
                  <SortTh k="sales" label="Sales" />
                  <SortTh k="revenue" label="Revenue" />
                  <SortTh k="conversion" label="Conversion" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => {
                  const flag = !s.t.is_active ? s.openLeads > 0 : s.callsToday === 0 || s.overdueFollowups >= 2;
                  const rank = rankOf.get(s.t.id)!;
                  return (
                    <tr key={s.t.id} className={`clickable ${flag ? 'row-alert' : ''}`} onClick={() => setOpenStaffId(s.t.id)}>
                      <td>{rank <= 3 && s.revenue > 0 ? <span className={`rank-badge r${rank}`}>{rank}</span> : rank}</td>
                      <td className="cust">
                        {s.t.name}
                        <div className="loc">
                          {s.t.region} · <span className={`chip ${s.t.is_active ? 'delivered' : 'muted'}`}>{s.t.is_active ? 'Active' : 'Inactive'}</span>
                          {s.t.is_active && s.callsToday === 0 && <> <span className="chip pending">No calls today</span></>}
                        </div>
                      </td>
                      <td className="num-col">{s.calls}</td>
                      <td className="num-col">{s.calls ? `${s.connectRate}%` : '—'}</td>
                      <td className="num-col">{s.openLeads}</td>
                      <td className="num-col">{s.pendingFollowups} / <span className={s.overdueFollowups ? 'text-warn' : undefined}>{s.overdueFollowups}</span></td>
                      <td className="num-col">{s.sales}</td>
                      <td className="num-col strong">{rupees(s.revenue)}</td>
                      <td className="num-col">{s.conversion}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="panel-note">Click a telecaller for details. Follow-ups show pending / overdue. Calls, sales and revenue are for {PERIOD_LABEL[period].toLowerCase()}.</div>
        </div>
      </div>

      <div className="panel-note">
        Sample data. The backend doesn&apos;t yet have a team-wide call log, call outcome and duration, call targets, or who is online right now.
      </div>

      {openStaff && (
        <StaffDrawer
          stats={openStaff}
          data={data}
          onClose={() => setOpenStaffId(null)}
          onReassign={onReassign}
          onOpenLeads={onOpenLeads}
        />
      )}
    </>
  );
}

// ---- Staff detail drawer --------------------------------------------------------------------

function StaffDrawer({ stats, data, onClose, onReassign, onOpenLeads }: {
  stats: StaffStats;
  data: TeamData;
  onClose: () => void;
  onReassign: (leadIds: number[], toCallerId: number) => void;
  onOpenLeads: (callerId?: number) => void;
}) {
  const t: Telecaller = stats.t;
  const others = TELECALLERS.filter(x => x.is_active && x.id !== t.id);
  const [target, setTarget] = useState<number>(others[0]?.id ?? 0);

  const openLeads = data.leads.filter(l => l.assigned_to === t.id && isOpenLead(l)).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const overdue = data.followups.filter(f => f.caller_id === t.id && isOverdue(f));
  const recentSales = data.sales.filter(s => s.caller_id === t.id).sort((a, b) => b.sold_at.localeCompare(a.sold_at)).slice(0, 5);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${TODAY}T00:00:00`);
    d.setDate(d.getDate() - (13 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, n: data.activities.filter(a => a.caller_id === t.id && a.created_at.startsWith(key)).length };
  });
  const maxDay = Math.max(1, ...days.map(d => d.n));

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="order-drawer" role="dialog" aria-label={t.name}>
        <div className="drawer-head">
          <div>
            <h3>{t.name}</h3>
            <div className="loc">
              {t.region} · <span className={`chip ${t.is_active ? 'delivered' : 'muted'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
              {stats.lastCall && <> · last call {ago(stats.lastCall)}</>}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="drawer-body">
          <section className="od-section">
            <div className="mini-stats">
              <div className="mini-stat"><div className="mini-num">{stats.callsToday}</div><div className="mini-label">calls today</div></div>
              <div className="mini-stat"><div className="mini-num">{stats.openLeads}</div><div className="mini-label">open leads</div></div>
              <div className="mini-stat"><div className="mini-num">{stats.overdueFollowups}</div><div className="mini-label">overdue</div></div>
              <div className="mini-stat"><div className="mini-num">{rupeesShort(stats.revenue)}</div><div className="mini-label">revenue</div></div>
            </div>
          </section>

          <section className="od-section">
            <div className="od-label">Calls · last 14 days</div>
            <div className="bar-chart dense mini-trend">
              {days.map((d, i) => (
                <div key={d.key} className="bc-col" data-tip={`${shortDate(d.key)}: ${d.n} calls`}>
                  <div className={`bc-bar ${i === 13 ? 'now' : ''}`} style={{ height: `${(d.n / maxDay) * 100}%` }} />
                </div>
              ))}
            </div>
          </section>

          <section className="od-section">
            <div className="od-label">Reassign open leads</div>
            {openLeads.length === 0 ? (
              <div className="loc">No open leads to reassign.</div>
            ) : (
              <>
                <div className="loc" style={{ marginBottom: 8 }}>
                  Move all {openLeads.length} open leads and their pending follow-ups to another telecaller{!t.is_active ? ', since ' + t.name.split(' ')[0] + ' is inactive' : ''}.
                </div>
                <div className="inline-edit">
                  <select className="filter-select" value={target} onChange={e => setTarget(Number(e.target.value))} aria-label="Reassign to">
                    {others.map(o => <option key={o.id} value={o.id}>{o.name} · {o.region}</option>)}
                  </select>
                  <button className="btn-primary btn-small" onClick={() => { onReassign(openLeads.map(l => l.id), target); onClose(); }}>Move all</button>
                </div>
                <button className="link link-btn" style={{ marginTop: 8 }} onClick={() => { onClose(); onOpenLeads(t.id); }}>Pick leads one by one</button>
              </>
            )}
          </section>

          <section className="od-section">
            <div className="od-label">Oldest open leads</div>
            <ul className="attn-list">
              {openLeads.length === 0 && <li><div className="action">None.</div></li>}
              {openLeads.slice(0, 5).map(l => (
                <li key={l.id}>
                  <div>
                    <div className="name">{l.customer_name}</div>
                    <div className="action">{verticalName(l.vertical_id)} · {stageName(l.stage_id)} · {l.source}</div>
                  </div>
                  <div className="attn-side"><span className="when">touched {ago(l.updated_at)}</span></div>
                </li>
              ))}
            </ul>
          </section>

          <section className="od-section">
            <div className="od-label">Overdue follow-ups · {overdue.length}</div>
            <ul className="attn-list">
              {overdue.length === 0 && <li><div className="action">None.</div></li>}
              {overdue.slice(0, 5).map(f => (
                <li key={f.id}>
                  <div>
                    <div className="name">{data.leads.find(l => l.id === f.lead_id)?.customer_name ?? '—'}</div>
                    <div className="action">{f.note}</div>
                  </div>
                  <div className="attn-side"><span className="when">{f.status === 'missed' ? 'Missed' : 'Due'} {shortDate(f.due_at)}</span></div>
                </li>
              ))}
            </ul>
          </section>

          <section className="od-section">
            <div className="od-label">Recent sales</div>
            <ul className="attn-list">
              {recentSales.length === 0 && <li><div className="action">No sales yet.</div></li>}
              {recentSales.map(s => (
                <li key={s.id}>
                  <div>
                    <div className="name">{s.customer_name}</div>
                    <div className="action">{productName(s.product_id)} × {s.quantity}</div>
                  </div>
                  <div className="attn-side"><span className="strong">{rupees(s.amount)}</span><span className="loc">{shortDate(s.sold_at)}</span></div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </>
  );
}
