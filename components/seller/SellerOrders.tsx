import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, PhoneCall, Wallet } from 'lucide-react';
import type { CommunicationStatus, OrderStatus } from '../../data/managerDashboard';
import { ORDER_CHIP, nowStamp, rupees, rupeesShort, shortDateTime } from '../../lib/format';
import { orderSourceLabel } from '../../lib/orderDisplay';
import { isLiveOrder, realNowStamp } from '../telecaller/orderTracking';
import { ORDER_STATUS_LABEL, SellerOrder } from './sellerData';

// One page, two jobs kept apart:
//   1. "Needs your action": new orders waiting for Confirm / Reject. Nothing else is in here.
//   2. "Confirmed by you": the record of what the seller has confirmed, with its own cards and filters.
// An order moves from the first to the second the moment it is confirmed, so it never just vanishes.
// Rejected / cancelled orders sit in a collapsed list at the bottom. Tracking follows the delivery.

/** Statuses an order has once the seller has confirmed it (and it has not been cancelled since). */
const CONFIRMED: OrderStatus[] = ['confirmed', 'ready_for_dispatch', 'shipped', 'delivered'];
const CLOSED: OrderStatus[] = ['rejected', 'cancelled'];

/** Where a confirmed order has got to, on the timeline shared by every dashboard. */
const STAGES = [
  { key: 'seller_confirmed', label: 'Seller confirmed' },
  { key: 'telecalling', label: 'Telecalling' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

type Focus = 'today' | 'awaiting_call' | 'to_pack';
type DateRange = 'all' | 'today' | '7d' | 'month';

const PAGE_SIZE = 10;

const COMM_LABEL: Record<CommunicationStatus, string> = {
  not_contacted: 'Not called yet', contacted: 'Customer contacted', follow_up: 'Follow-up with customer', unreachable: 'Customer unreachable', resolved: 'Customer informed',
};

/** The clock an order is dated by: the real one for live orders, the demo calendar for the offline sample. */
const clockFor = (s: SellerOrder) => (isLiveOrder(s.order) ? realNowStamp() : nowStamp());
const dayStart = (ts: string) => new Date(`${ts.slice(0, 10)}T00:00:00`).getTime();
const daysAgo = (s: SellerOrder, ts: string) => Math.round((dayStart(clockFor(s)) - dayStart(ts)) / 86400000);

const confirmedEntry = (s: SellerOrder) => s.order.status_history.find(h => h.status === 'confirmed');
const isConfirmed = (s: SellerOrder) => CONFIRMED.includes(s.order.status);

interface Props {
  orders: SellerOrder[];
  /** Orders that also contain other sellers' items. */
  mixedOrderIds: number[];
  searchQuery: string;
  /** Opens the confirm-order card for one order. */
  onOpenConfirm: (orderId: number) => void;
  /** The seller declines a new order. */
  onReject: (orderId: number) => void;
  /** Jump to the Tracking page for one order. */
  onTrack: (orderNumber: string) => void;
  /** Open one order's details: customer, mobile, items and invoice. */
  onView: (orderId: number) => void;
}

export default function SellerOrders({ orders, mixedOrderIds, searchQuery, onOpenConfirm, onReject, onTrack, onView }: Props) {
  // Confirmed section
  const [stage, setStage] = useState<string>('any');
  const [range, setRange] = useState<DateRange>('all');
  const [focus, setFocus] = useState<Focus | null>(null);
  const [page, setPage] = useState(0);
  const reset = () => setPage(0);

  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (s: SellerOrder) =>
    !q || [s.order.order_number, s.order.customer_name, s.order.city, s.order.phone, ...s.items.map(i => i.product_name)]
      .some(v => (v ?? '').toLowerCase().includes(q));

  const newOrders = useMemo(
    () => orders.filter(s => s.order.status === 'pending').sort((a, b) => b.order.created_at.localeCompare(a.order.created_at)),
    [orders],
  );
  const confirmed = useMemo(() => orders.filter(isConfirmed), [orders]);
  const closed = useMemo(() => orders.filter(s => CLOSED.includes(s.order.status)), [orders]);

  const stats = useMemo(() => {
    const today = confirmed.filter(s => {
      const at = confirmedEntry(s)?.at;
      return at !== undefined && daysAgo(s, at) === 0;
    });
    return {
      today,
      awaitingCall: confirmed.filter(s => s.order.status === 'confirmed' && s.order.communication_status === 'not_contacted'),
      toPack: confirmed.filter(s => s.order.status === 'confirmed'),
      value: confirmed.reduce((a, s) => a + s.gross, 0),
    };
  }, [confirmed]);

  const inFocus = (s: SellerOrder) =>
    focus === null ? true
      : focus === 'today' ? stats.today.includes(s)
      : focus === 'awaiting_call' ? stats.awaitingCall.includes(s)
      : stats.toPack.includes(s);
  const inRange = (s: SellerOrder) => {
    if (range === 'all') return true;
    const at = confirmedEntry(s)?.at ?? s.order.created_at; // dated by when it was confirmed
    const age = daysAgo(s, at);
    return range === 'today' ? age === 0 : range === '7d' ? age <= 6 : age <= 29;
  };

  const confirmedRows = confirmed
    .filter(s => stage === 'any' || s.order.stage === stage)
    .filter(inRange)
    .filter(inFocus)
    .filter(matchesSearch)
    .sort((a, b) => (confirmedEntry(b)?.at ?? b.order.created_at).localeCompare(confirmedEntry(a)?.at ?? a.order.created_at));
  const pageCount = Math.max(1, Math.ceil(confirmedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = confirmedRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const newShown = newOrders.filter(matchesSearch);
  const closedShown = closed.filter(matchesSearch);

  /** A summary card is also a filter: click it to see just those orders; click again to clear. */
  const pickFocus = (f: Focus) => {
    setFocus(focus === f ? null : f);
    setStage('any');
    setRange('all');
    reset();
  };
  const filtersOn = focus !== null || stage !== 'any' || range !== 'all';

  const itemsCell = (s: SellerOrder) => (
    <td>
      {s.items.map(i => <div key={i.product_name}>{i.product_name} × {i.quantity}</div>)}
      {mixedOrderIds.includes(s.order.id) && <div className="loc">+ items from other sellers</div>}
    </td>
  );

  return (
    <>
      {/* 1. Needs your action */}
      <div className="panel">
        <div className="panel-header" style={{ padding: '14px 18px 0' }}>
          <h3 style={{ margin: 0 }}>Needs your action <span className="chip pending">{newOrders.length} new</span></h3>
          <div className="loc">New orders waiting for you. Confirm one and it moves to “Confirmed by you” below.</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Order</th><th>Placed</th><th>Customer</th><th>My items</th><th className="num-col">Amount</th><th>Payment</th><th></th></tr>
            </thead>
            <tbody>
              {newShown.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '20px 0' }}>
                  {newOrders.length === 0 ? 'Nothing to confirm right now. New website orders appear here on their own.' : 'No new orders match the search.'}
                </td></tr>
              )}
              {newShown.map(s => (
                <tr key={s.order.id}>
                  <td className="cust">{s.order.order_number}<div className="loc">{orderSourceLabel(s.order)}</div></td>
                  <td>{shortDateTime(s.order.created_at)}</td>
                  <td>{s.order.customer_name}<div className="loc">{[s.order.city, s.order.pincode].filter(Boolean).join(', ')}</div></td>
                  {itemsCell(s)}
                  <td className="num-col strong">{rupees(s.gross)}</td>
                  <td>{s.order.payment_method}<div className="loc">{s.order.payment_status}</div></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-secondary btn-small" onClick={() => onView(s.order.id)} aria-label={`View ${s.order.order_number}`}>View</button>
                      <button className="btn-primary btn-small" onClick={() => onOpenConfirm(s.order.id)}>Confirm</button>
                      <button
                        className="btn-secondary btn-small"
                        onClick={() => { if (window.confirm(`Reject ${s.order.order_number}? The customer will be told it cannot be fulfilled.`)) onReject(s.order.id); }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Confirmed by you: own cards, filters and table */}
      <h3 style={{ margin: '22px 4px 8px' }}>Confirmed by you</h3>
      <div className="scoreboard">
        <button className={`score score-btn ${focus === 'today' ? 'active' : ''}`} onClick={() => pickFocus('today')}>
          <div className="num"><CheckCircle2 size={16} /> {stats.today.length}</div>
          <div className="label">Confirmed today</div>
        </button>
        <button className={`score score-btn ${focus === 'awaiting_call' ? 'active' : ''}`} onClick={() => pickFocus('awaiting_call')}>
          <div className="num"><PhoneCall size={16} /> {stats.awaitingCall.length}</div>
          <div className="label">Waiting for telecalling</div>
        </button>
        <button className={`score score-btn ${focus === 'to_pack' ? 'active' : ''}`} onClick={() => pickFocus('to_pack')}>
          <div className="num"><Clock size={16} /> {stats.toPack.length}</div>
          <div className="label">Ready to pack</div>
        </button>
        <div className="score">
          <div className="num"><Wallet size={16} /> {rupeesShort(stats.value)} <small>{confirmed.length} orders</small></div>
          <div className="label">Total confirmed value</div>
        </div>
      </div>

      <div className="filter-row one-line">
        <select className="filter-select" value={stage} onChange={e => { setStage(e.target.value); setFocus(null); reset(); }} aria-label="Stage">
          <option value="any">Any stage</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label} ({confirmed.filter(c => c.order.stage === s.key).length})</option>)}
        </select>
        <select className="filter-select" value={range} onChange={e => { setRange(e.target.value as DateRange); reset(); }} aria-label="Confirmed on">
          <option value="all">Confirmed any time</option>
          <option value="today">Confirmed today</option>
          <option value="7d">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </select>
        {filtersOn && (
          <button className="link-btn clear-alert" onClick={() => { setFocus(null); setStage('any'); setRange('all'); reset(); }}>Clear filters</button>
        )}
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Order</th><th>Customer</th><th>My items</th><th className="num-col">Amount</th><th>Confirmed</th><th>Stage</th><th></th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 0' }}>
                  {confirmed.length === 0 ? 'You have not confirmed any orders yet.' : 'No confirmed orders match these filters.'}
                </td></tr>
              )}
              {shown.map(s => {
                const o = s.order;
                const done = confirmedEntry(s);
                return (
                  <tr key={o.id}>
                    <td className="cust">{o.order_number}<div className="loc">{orderSourceLabel(o)}</div><div className="loc">Placed {shortDateTime(o.created_at)}</div></td>
                    <td>{o.customer_name}<div className="loc">{[o.phone, o.city].filter(Boolean).join(' · ')}</div></td>
                    {itemsCell(s)}
                    <td className="num-col strong">{rupees(s.gross)}</td>
                    <td>
                      {done ? shortDateTime(done.at) : '—'}
                      {done?.by && <div className="loc">by {done.by}</div>}
                    </td>
                    <td>
                      <span className={`chip ${ORDER_CHIP[o.status]}`}>{o.stage_label ?? ORDER_STATUS_LABEL[o.status]}</span>
                      {o.communication_status && (o.stage === 'seller_confirmed' || o.stage === 'telecalling') && (
                        <div className="loc">{COMM_LABEL[o.communication_status]}</div>
                      )}
                    </td>
                    <td><button className="btn-secondary btn-small" onClick={() => onTrack(o.order_number)}>Track</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {confirmedRows.length > PAGE_SIZE && (
          <div className="pager">
            <span>{safePage * PAGE_SIZE + 1}–{Math.min(confirmedRows.length, (safePage + 1) * PAGE_SIZE)} of {confirmedRows.length} orders</span>
            <div className="pager-btns">
              <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
              <button className="btn-secondary btn-small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Rejected / cancelled: out of the way */}
      {closed.length > 0 && (
        <details className="panel" style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', padding: '12px 18px', fontWeight: 600 }}>Rejected / cancelled ({closed.length})</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Customer</th><th>My items</th><th className="num-col">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {closedShown.map(s => (
                  <tr key={s.order.id}>
                    <td className="cust">{s.order.order_number}<div className="loc">Placed {shortDateTime(s.order.created_at)}</div></td>
                    <td>{s.order.customer_name}<div className="loc">{s.order.city}</div></td>
                    {itemsCell(s)}
                    <td className="num-col">{rupees(s.gross)}</td>
                    <td><span className={`chip ${ORDER_CHIP[s.order.status]}`}>{ORDER_STATUS_LABEL[s.order.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
