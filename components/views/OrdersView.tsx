import React, { useMemo, useState } from 'react';
import { Phone, Printer, X } from 'lucide-react';
import {
  TODAY,
  TELECALLERS,
  SalesOrder,
  OrderStatus,
  PaymentStatus,
  OrderSource,
  OrderReport,
  CommunicationStatus,
} from '../../data/managerDashboard';
import { MONTH, ORDER_CHIP, daysBefore, rupees, rupeesShort, shortDate, shortDateTime } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import CardTable from '../CardTable';

// The manager sees orders read-only: status, payment and details, no changes.
interface OrdersViewProps {
  orders: SalesOrder[];
  onToast: (message: string) => void;
  initialQuery?: string;
  /** Seller-wise / telecaller-wise roll-ups from the CRM backend; null on the offline sample data. */
  report?: OrderReport | null;
}

const COMM_LABEL: Record<CommunicationStatus, string> = {
  not_contacted: 'Not called yet', contacted: 'Contacted', follow_up: 'Follow-up due', unreachable: 'Unreachable', resolved: 'Resolved',
};
const COMM_CHIP: Record<CommunicationStatus, string> = {
  not_contacted: 'pending', contacted: 'delivered', follow_up: 'transit', unreachable: 'muted', resolved: 'delivered',
};
const CALL_LABEL: Record<string, string> = {
  connected: 'Call connected', no_answer: 'No answer', busy: 'Line busy', switched_off: 'Phone switched off',
  wrong_number: 'Wrong number', callback_requested: 'Asked for a callback',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Order placed', confirmed: 'Seller confirmed', ready_for_dispatch: 'Packed by seller', shipped: 'Shipped',
  delivered: 'Delivered', rejected: 'Rejected by seller', cancelled: 'Cancelled',
};

/** The shared timeline every dashboard follows (the backend names the current step in `stage`). */
const TIMELINE_STEPS = [
  { key: 'seller_pending', label: 'Placed · seller pending' },
  { key: 'seller_confirmed', label: 'Seller confirmed' },
  { key: 'telecalling', label: 'Telecalling' },
  { key: 'processing', label: 'Packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

const STATUSES: OrderStatus[] = ['pending', 'confirmed', 'ready_for_dispatch', 'shipped', 'delivered', 'rejected', 'cancelled'];
const FLOW: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered'];
const PAYMENT_CHIP: Record<PaymentStatus, string> = { paid: 'delivered', unpaid: 'pending', refunded: 'muted' };
const PAGE_SIZE = 15;

type Alert = 'stale-pending' | 'unpaid-delivered' | 'slow-shipping';
type DateRange = 'today' | '7d' | 'month' | 'all';

const callerName = (id: number | null) => (id === null ? 'Manager' : TELECALLERS.find(t => t.id === id)?.name ?? '—');
const lastChange = (o: SalesOrder, s: OrderStatus) => [...o.status_history].reverse().find(h => h.status === s)?.at ?? o.created_at;

const ALERTS: Record<Alert, { label: string; test: (o: SalesOrder) => boolean }> = {
  'stale-pending': { label: 'pending over 48 hours', test: o => o.status === 'pending' && daysBefore(o.created_at) >= 2 },
  'unpaid-delivered': { label: 'delivered but unpaid', test: o => o.status === 'delivered' && o.payment_status === 'unpaid' },
  'slow-shipping': { label: 'shipped over 7 days ago', test: o => o.status === 'shipped' && daysBefore(lastChange(o, 'shipped')) > 7 },
};

const itemsSummary = (o: SalesOrder) => ({
  first: o.items[0]?.product_name ?? '—',
  more: o.items.length - 1,
  qty: o.items.reduce((a, it) => a + it.quantity, 0),
});

function exportOrders(rows: SalesOrder[], format: ExportFormat, scope: string) {
  const total = rows.reduce((a, o) => a + o.total, 0);
  return exportTable(format, {
    filename: `orders-${TODAY}`,
    title: 'Orders',
    // "Rs." rather than ₹: the PDF's built-in fonts can't draw the rupee sign
    subtitle: `${rows.length} ${rows.length === 1 ? 'order' : 'orders'} · Rs. ${total.toLocaleString('en-IN')} · ${scope} · exported ${shortDate(TODAY)}`,
    columns: [
      { header: 'Order', width: 12 },
      { header: 'Date', width: 14 },
      { header: 'Source', width: 11 },
      { header: 'Telecaller', width: 16 },
      { header: 'Customer', width: 20 },
      { header: 'Phone', width: 13 },
      { header: 'City', width: 13 },
      { header: 'Items', width: 40 },
      { header: 'Total', width: 11, money: true },
      { header: 'Payment', width: 10 },
      { header: 'Method', width: 11 },
      { header: 'Status', width: 11 },
    ],
    rows: rows.map(o => [
      o.order_number, shortDateTime(o.created_at), o.source === 'website' ? 'Website' : 'Telecaller',
      o.source === 'telecaller' ? callerName(o.caller_id) : '', o.customer_name, o.phone, o.city,
      o.items.map(it => `${it.product_name} x ${it.quantity}`).join(', '),
      o.total, o.payment_status, o.payment_method, o.status,
    ]),
  });
}

function printInvoice(o: SalesOrder) {
  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) return;
  const rows = o.items
    .map(it => `<tr><td>${it.product_name}</td><td>${it.quantity}</td><td>${rupees(it.price)}</td><td>${rupees(it.price * it.quantity)}</td></tr>`)
    .join('');
  win.document.write(`<!doctype html><title>Invoice ${o.order_number}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#2B2A22}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:18px}
th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;font-size:14px}.r{text-align:right}.muted{color:#6B6A5C;font-size:13px}</style>
<h1>Manikstu Agri Network</h1><p class="muted">Invoice for order ${o.order_number} · ${shortDateTime(o.created_at)}</p>
<p><strong>${o.customer_name}</strong><br>${o.address}, ${o.city}, ${o.state} ${o.pincode}<br>${o.phone}</p>
<table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><th colspan="3">Total</th><th>${rupees(o.total)}</th></tr></tfoot></table>
<p class="muted">Payment: ${o.payment_method} · ${o.payment_status}</p>`);
  win.document.close();
  win.focus();
  win.print();
}

export default function OrdersView({ orders, onToast, initialQuery, report = null }: OrdersViewProps) {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<OrderSource | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | 'all'>('all');
  const [dateRange, setDateRange] = useState<DateRange>(initialQuery || report ? 'all' : 'month'); // live orders are dated by the real calendar, not the sample one
  const [alert, setAlert] = useState<Alert | null>(null);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  // Summary tiles: this month, all sources
  const month = orders.filter(o => o.created_at.startsWith(MONTH));
  const tiles = {
    count: month.length,
    today: month.filter(o => o.created_at.startsWith(TODAY)).length,
    revenue: month.filter(o => o.payment_status === 'paid').reduce((a, o) => a + o.total, 0),
    pending: orders.filter(o => o.status === 'pending').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    toCollect: orders.filter(o => o.payment_status === 'unpaid' && o.status !== 'cancelled'),
    cancelled: month.filter(o => o.status === 'cancelled').length,
    refunded: month.filter(o => o.payment_status === 'refunded').length,
  };

  // Everything except the status tab, so the tab counts reflect the other filters
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(o => {
      if (alert) return ALERTS[alert].test(o);
      if (sourceFilter !== 'all' && o.source !== sourceFilter) return false;
      if (paymentFilter !== 'all' && o.payment_status !== paymentFilter) return false;
      const age = daysBefore(o.created_at);
      if (dateRange === 'today' && age !== 0) return false;
      if (dateRange === '7d' && age > 6) return false;
      if (dateRange === 'month' && !o.created_at.startsWith(MONTH)) return false;
      if (q && ![o.order_number, o.customer_name, o.phone, o.city].some(v => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [orders, alert, sourceFilter, paymentFilter, dateRange, query]);

  const filtered = statusFilter === 'all' ? baseFiltered : baseFiltered.filter(o => o.status === statusFilter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const open = orders.find(o => o.id === openId) ?? null;

  const resetPage = () => setPage(0);

  const openOrder = (o: SalesOrder) => setOpenId(o.id);

  const runExport = async (rows: SalesOrder[], format: ExportFormat, scope: string) => {
    if (rows.length === 0) {
      onToast('No orders to export');
      return;
    }
    try {
      await exportOrders(rows, format, scope);
      onToast(`Exported ${rows.length} ${rows.length === 1 ? 'order' : 'orders'} to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  return (
    <>
      {/* 1. Summary tiles */}
      <div className="scoreboard">
        <div className="score">
          <div className="num">{tiles.count} <small>+{tiles.today} today</small></div>
          <div className="label">Orders · this month</div>
        </div>
        <div className="score">
          <div className="num">{rupeesShort(tiles.revenue)}</div>
          <div className="label">Paid revenue · this month</div>
        </div>
        <div className="score">
          <div className="num">{tiles.pending}</div>
          <div className="label">Waiting to confirm</div>
        </div>
        <div className="score">
          <div className="num">{tiles.shipped}</div>
          <div className="label">Out for delivery</div>
        </div>
        <div className="score">
          <div className="num">{rupeesShort(tiles.toCollect.reduce((a, o) => a + o.total, 0))} <small className="warn">{tiles.toCollect.length} orders</small></div>
          <div className="label">Unpaid · to collect</div>
        </div>
        <div className="score">
          <div className="num">{tiles.cancelled} <small className="warn">{tiles.refunded} refunded</small></div>
          <div className="label">Cancelled · this month</div>
        </div>
      </div>

      {/* 1b. Order board: headline counts, then seller-wise and telecaller-wise (live backend only) */}
      {report && (
        <>
          <div className="scoreboard">
            <div className="score"><div className="num">{report.totals.total}</div><div className="label">Total orders</div></div>
            <div className="score"><div className="num">{report.totals.pending}</div><div className="label">Pending · awaiting seller</div></div>
            <div className="score"><div className="num">{report.totals.confirmed}</div><div className="label">Confirmed by seller</div></div>
            <div className="score"><div className="num">{report.totals.cancelled}</div><div className="label">Cancelled / rejected</div></div>
            <div className="score">
              <div className="num">{report.telecalling.awaiting_first_call} <small className={report.telecalling.followups_overdue ? 'warn' : ''}>{report.telecalling.followups_overdue} overdue</small></div>
              <div className="label">Awaiting first call · follow-ups</div>
            </div>
          </div>

          <div className="panel">
            <CardTable>
              <table>
                <caption style={{ textAlign: 'left', fontWeight: 600, padding: '10px 14px' }}>Seller-wise orders</caption>
                <thead>
                  <tr><th>Seller</th><th className="num-col">Orders</th><th className="num-col">Pending</th><th className="num-col">Confirmed</th><th className="num-col">Cancelled</th><th className="num-col">Revenue</th></tr>
                </thead>
                <tbody>
                  {report.sellers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>No orders yet.</td></tr>}
                  {report.sellers.map(s => (
                    <tr key={s.seller_id ?? 'none'}>
                      <td className="strong">{s.seller}</td>
                      <td className="num-col">{s.orders}</td>
                      <td className="num-col">{s.pending}</td>
                      <td className="num-col">{s.confirmed}</td>
                      <td className="num-col">{s.cancelled}</td>
                      <td className="num-col">{rupees(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardTable>
          </div>

          <div className="panel">
            <CardTable>
              <table>
                <caption style={{ textAlign: 'left', fontWeight: 600, padding: '10px 14px' }}>Telecaller-wise order status</caption>
                <thead>
                  <tr><th>Telecaller</th><th className="num-col">Orders worked</th><th className="num-col">Contacted</th><th className="num-col">Follow-up</th><th className="num-col">Unreachable</th><th className="num-col">Resolved</th></tr>
                </thead>
                <tbody>
                  {report.telecallers.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>No calls logged on orders yet.</td></tr>
                  )}
                  {report.telecallers.map(t => (
                    <tr key={t.user_id}>
                      <td className="strong">{t.name}</td>
                      <td className="num-col">{t.orders}</td>
                      <td className="num-col">{t.contacted}</td>
                      <td className="num-col">{t.follow_up}</td>
                      <td className="num-col">{t.unreachable}</td>
                      <td className="num-col">{t.resolved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardTable>
          </div>
        </>
      )}

      {/* 2. Needs-attention strip (filters only) */}
      <div className="alert-strip">
        <span className="alert-strip-label">Needs attention</span>
        {(Object.keys(ALERTS) as Alert[]).map(key => {
          const n = orders.filter(ALERTS[key].test).length;
          return (
            <button
              key={key}
              className={`alert-pill ${alert === key ? 'active' : ''} ${n === 0 ? 'zero' : ''}`}
              onClick={() => { setAlert(alert === key ? null : key); setStatusFilter('all'); resetPage(); }}
            >
              <strong>{n}</strong> {ALERTS[key].label}
            </button>
          );
        })}
        {alert && <button className="link-btn clear-alert" onClick={() => { setAlert(null); resetPage(); }}>Show all orders</button>}
      </div>

      {/* 3. Filters: search, status, source, payment and date on one line, export at the end */}
      <div className="filter-row one-line orders-filters">
        <input
          className="filter-input"
          type="search"
          placeholder="Search order no., customer, phone, city…"
          value={query}
          onChange={e => { setQuery(e.target.value); resetPage(); }}
        />
        <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value as OrderStatus | 'all'); resetPage(); }} aria-label="Status">
          {(['all', ...STATUSES] as const).map(st => (
            <option key={st} value={st}>
              {st === 'all' ? 'All statuses' : st === 'ready_for_dispatch' ? 'Packed' : st[0].toUpperCase() + st.slice(1)} ({st === 'all' ? baseFiltered.length : baseFiltered.filter(o => o.status === st).length})
            </option>
          ))}
        </select>
        <select className="filter-select" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value as OrderSource | 'all'); resetPage(); }} aria-label="Source">
          <option value="all">All sources</option>
          <option value="website">Website</option>
          <option value="telecaller">Telecaller</option>
        </select>
        <select className="filter-select" value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value as PaymentStatus | 'all'); resetPage(); }} aria-label="Payment">
          <option value="all">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="refunded">Refunded</option>
        </select>
        <select className="filter-select" value={dateRange} onChange={e => { setDateRange(e.target.value as DateRange); resetPage(); }} aria-label="Date range">
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="month">This month</option>
          <option value="all">All time</option>
        </select>
        <div className="filter-row-end">
          <ExportMenu onExport={format => runExport(filtered, format, 'current filters')} />
        </div>
      </div>
      {alert && <div className="filter-note filter-note-below">Other filters are paused while a “Needs attention” filter is on.</div>}

      {/* 4. Orders table */}
      <div className="panel">
        <CardTable>
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Source</th>
                <th>Customer</th>
                <th>Items</th>
                <th className="num-col">Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 0' }}>
                    No orders match these filters.
                  </td>
                </tr>
              ) : pageRows.map(o => {
                const it = itemsSummary(o);
                return (
                  <tr key={o.id}>
                    <td>
                      <button className="link-btn order-no" onClick={() => openOrder(o)}>{o.order_number}</button>
                      <div className="loc">{shortDateTime(o.created_at)}</div>
                    </td>
                    <td>
                      <span className={`source-tag ${o.source}`}>{o.source === 'website' ? 'Website' : 'Telecaller'}</span>
                      {o.source === 'telecaller' && <div className="loc">{callerName(o.caller_id)}</div>}
                    </td>
                    <td className="cust">
                      {o.customer_name}
                      <div className="loc">{o.phone} · {o.city}</div>
                    </td>
                    <td>
                      {it.first}{it.more > 0 && <span className="more-items"> +{it.more} more</span>}
                      <div className="loc">{it.qty} {it.qty === 1 ? 'unit' : 'units'}</div>
                    </td>
                    <td className="num-col strong">{rupees(o.total)}</td>
                    <td>
                      <span className={`chip ${PAYMENT_CHIP[o.payment_status]}`}>{o.payment_status}</span>
                      <div className="loc">{o.payment_method}</div>
                    </td>
                    <td>
                      <span className={`chip ${ORDER_CHIP[o.status]}`}>{o.stage_label ?? o.status}</span>
                      {o.communication_status && o.communication_status !== 'not_contacted' && (
                        <div className="loc">{COMM_LABEL[o.communication_status]}{o.handled_by_name ? ` · ${o.handled_by_name}` : ''}</div>
                      )}
                    </td>
                    <td>
                      <button className="kanban-btn" onClick={() => openOrder(o)}>View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
        <div className="pager">
          <span>
            {filtered.length === 0 ? '0 orders' : `${safePage * PAGE_SIZE + 1}–${Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of ${filtered.length} orders`}
            {' · '}{rupees(filtered.reduce((a, o) => a + o.total, 0))}
          </span>
          <div className="pager-btns">
            <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button className="btn-secondary btn-small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </div>
      </div>

      <div className="panel-note">
        {report ? 'Live data from the CRM backend, refreshed every 15 seconds. Not stored yet:' : 'Sample data. The backend doesn’t store yet:'} order source, telecaller on website orders, status change dates, courier and tracking number,
        delivery address per order, discounts and shipping charges, and cancellation reason.
      </div>

      {/* 5. Order detail drawer (read-only) */}
      {open && (
        <>
          <div className="drawer-overlay" onClick={() => setOpenId(null)} />
          <aside className="order-drawer" role="dialog" aria-label={`Order ${open.order_number}`}>
            <div className="drawer-head">
              <div>
                <h3>{open.order_number}</h3>
                <div className="loc">
                  {shortDateTime(open.created_at)} · <span className={`source-tag ${open.source}`}>{open.source === 'website' ? 'Website' : 'Telecaller'}</span>
                  {open.source === 'telecaller' && <> · {callerName(open.caller_id)}</>}
                </div>
              </div>
              <button className="modal-close" onClick={() => setOpenId(null)} aria-label="Close"><X size={20} /></button>
            </div>

            <div className="drawer-body">
              <section className="od-section">
                <div className="od-label">Customer</div>
                <div className="od-customer">
                  <div>
                    <div className="strong">{open.customer_name}</div>
                    <div className="loc">{open.address}, {open.city}, {open.state} {open.pincode}</div>
                  </div>
                  <a className="call-btn" href={`tel:+91${open.phone}`}><Phone size={13} /> {open.phone}</a>
                </div>
              </section>

              <section className="od-section">
                <div className="od-label">Items</div>
                <table>
                  <thead>
                    <tr><th>Product</th><th className="num-col">Qty</th><th className="num-col">Price</th><th className="num-col">Amount</th></tr>
                  </thead>
                  <tbody>
                    {open.items.map(item => (
                      <tr key={item.product_name}>
                        <td>{item.product_name}</td>
                        <td className="num-col">{item.quantity}</td>
                        <td className="num-col">{rupees(item.price)}</td>
                        <td className="num-col">{rupees(item.price * item.quantity)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} className="strong">Total</td>
                      <td className="num-col strong">{rupees(open.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="od-section od-row">
                <div>
                  <div className="od-label">Payment</div>
                  <span className={`chip ${PAYMENT_CHIP[open.payment_status]}`}>{open.payment_status}</span> <span className="loc">{open.payment_method}</span>
                </div>
                <div>
                  <div className="od-label">Status</div>
                  <span className={`chip ${ORDER_CHIP[open.status]}`}>{open.status}</span>
                </div>
              </section>

              {open.activity ? (
                <>
                  <section className="od-section">
                    <div className="od-label">Order tracking · {open.stage_label ?? open.status}</div>
                    {open.stage === 'cancelled' || open.stage === 'rejected' ? (
                      <div className="track-bar cancelled" aria-label={open.stage_label}><span /></div>
                    ) : (
                      <>
                        <div className="track-bar" aria-label={`${open.stage_label}, step ${(TIMELINE_STEPS.findIndex(s => s.key === open.stage)) + 1} of ${TIMELINE_STEPS.length}`}>
                          {TIMELINE_STEPS.map((s, i) => {
                            const at = TIMELINE_STEPS.findIndex(x => x.key === open.stage);
                            return <span key={s.key} className={i < at || open.stage === 'delivered' ? 'done' : i === at ? 'now' : ''} title={s.label} />;
                          })}
                        </div>
                        <div className="loc">{TIMELINE_STEPS.map(s => s.label).join(' → ')}</div>
                      </>
                    )}
                  </section>
                  <section className="od-section od-row">
                    <div>
                      <div className="od-label">Seller</div>
                      <div className="strong">{open.sellers?.length ? open.sellers.join(', ') : '—'}</div>
                    </div>
                    <div>
                      <div className="od-label">Telecalling</div>
                      <span className={`chip ${COMM_CHIP[open.communication_status ?? 'not_contacted']}`}>{COMM_LABEL[open.communication_status ?? 'not_contacted']}</span>
                      {open.handled_by_name && <div className="loc">{open.handled_by_name}</div>}
                      {open.next_followup_at && <div className="loc">Follow up {shortDateTime(open.next_followup_at)}</div>}
                    </div>
                  </section>
                  <section className="od-section">
                    <div className="od-label">Activity &amp; history</div>
                    <ul className="track-timeline">
                      {[...open.activity].reverse().map((a, i) => (
                        <li key={i}>
                          <div className="tt-title">{a.kind === 'call' ? CALL_LABEL[a.status] ?? a.status : STATUS_LABEL[a.status] ?? a.status}</div>
                          <div className="tt-time">
                            {shortDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}{a.text ? ` · ${a.text}` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              ) : (
              <section className="od-section">
                <div className="od-label">Status history</div>
                <ul className="track-timeline">
                  {(open.status === 'cancelled' ? open.status_history : FLOW.map(s => ({
                    status: s,
                    at: open.status_history.find(h => h.status === s)?.at ?? '',
                  }))).map(h => (
                    <li key={h.status} className={h.at ? '' : 'pending'}>
                      <div className="tt-title" style={{ textTransform: 'capitalize' }}>{h.status === 'pending' ? 'Placed' : h.status}</div>
                      <div className="tt-time">{h.at ? shortDateTime(h.at) : 'Not yet'}</div>
                    </li>
                  ))}
                </ul>
              </section>
              )}

              {open.notes && (
                <section className="od-section">
                  <div className="od-label">Notes</div>
                  <p className="od-note-text">{open.notes}</p>
                </section>
              )}
            </div>

            <div className="drawer-actions">
              <button className="btn-secondary" onClick={() => printInvoice(open)}><Printer size={14} /> Invoice</button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
