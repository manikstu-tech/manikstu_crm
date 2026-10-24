'use client';

import React, { useMemo, useState } from 'react';
import { Inbox, Phone, SlidersHorizontal, Truck, UserRound } from 'lucide-react';
import type { CommunicationStatus, OrderStatus } from '../../../data/managerDashboard';
import { daysBefore, rupees, shortDateTime } from '../../../lib/format';
import { AppLink, useNav } from '../app/nav';
import { useSeller } from '../app/SellerProvider';
import { ORDER_STATUS_LABEL, SellerOrder } from '../sellerData';
import { STEP_SHORT, useRejectRunner, useStageRunner } from './dialogs';
import { Btn, Chip, EmptyState, ORDER_TONE, PageIntro, ProductThumb, SearchField, Segmented, Sheet, useShowMore } from './ui';

type Tab = 'new' | 'confirmed' | 'all' | 'closed';
const CONFIRMED: OrderStatus[] = ['confirmed', 'ready_for_dispatch', 'shipped', 'delivered'];
const CLOSED: OrderStatus[] = ['rejected', 'cancelled'];
type Range = 'any' | 'today' | '7d' | '30d';
type Pay = 'any' | 'unpaid' | 'paid';
type Source = 'any' | 'website' | 'telecaller';

export const COMM_LABEL: Record<CommunicationStatus, string> = {
  not_contacted: 'Waiting for telecalling', contacted: 'Customer contacted', follow_up: 'Follow-up with customer', unreachable: 'Customer unreachable', resolved: 'Customer informed',
};

const telHref = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `tel:+91${digits}` : `tel:${digits}`;
};

const confirmedAt = (s: SellerOrder) => s.order.status_history.find(h => h.status === 'confirmed')?.at;

/** One order as a card: tap anywhere to open it; call, confirm, reject and next step act directly. */
export function OrderCard({ s, mixed, onReject, stage }: { s: SellerOrder; mixed: boolean; onReject: (id: number) => void; stage: ReturnType<typeof useStageRunner> }) {
  const { myProducts, shipmentDetails, nextManualStep, openConfirmCard, busyOrderIds, trackOrder } = useSeller();
  const o = s.order;
  const busy = busyOrderIds.includes(o.id);
  const step = nextManualStep(o, shipmentDetails[o.id]);
  const shownStatus = o.status === 'pending' ? 'New' : CONFIRMED.includes(o.status) && o.stage_label ? o.stage_label : ORDER_STATUS_LABEL[o.status];
  return (
    <article className="sx-order" aria-labelledby={`sx-o-${o.id}`}>
      <div className="sx-order-top">
        <AppLink href={`/seller/orders/${o.id}`} className="sx-order-num sx-stretch" id={`sx-o-${o.id}`}>{o.order_number}</AppLink>
        <Chip tone={ORDER_TONE[o.status]}>{shownStatus}</Chip>
      </div>
      <div className="sx-order-meta">{shortDateTime(o.created_at)} · {o.source === 'website' ? 'Website' : 'Telecaller'}</div>
      <div className="sx-order-cust">
        <UserRound size={17} aria-hidden />
        <span><strong>{o.customer_name}</strong><span>{o.city}{o.pincode ? `, ${o.pincode}` : ''}</span></span>
        {o.phone && <a href={telHref(o.phone)} className="sx-icon-btn sx-call sx-above" aria-label={`Call ${o.customer_name}`}><Phone size={18} aria-hidden /></a>}
      </div>
      <ul className="sx-order-items">
        {s.items.map(i => (
          <li key={i.product_name}>
            <ProductThumb product={myProducts.find(p => p.name === i.product_name)} name={i.product_name} size={40} />
            <span className="sx-oi-name">{i.product_name} <span className="sx-muted">× {i.quantity}</span></span>
            <span className="sx-oi-amt">{rupees(i.price * i.quantity)}</span>
          </li>
        ))}
      </ul>
      {mixed && <p className="sx-order-note">This order also has items from other sellers; only yours are shown.</p>}
      <div className="sx-order-pay">
        <span>{o.payment_method} · <span className={o.payment_status === 'paid' ? 'sx-tone-good' : o.payment_status === 'refunded' ? 'sx-muted' : 'sx-tone-warn'}>{o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'refunded' ? 'Refunded' : 'Unpaid'}</span></span>
        <strong>{rupees(s.gross)}</strong>
      </div>
      {o.communication_status && (o.stage === 'seller_confirmed' || o.stage === 'telecalling') && (
        <p className="sx-order-note">{COMM_LABEL[o.communication_status]}</p>
      )}
      {o.status === 'pending' ? (
        <div className="sx-order-actions sx-above">
          <Btn onClick={() => openConfirmCard(o.id)} disabled={busy}>Confirm order</Btn>
          <Btn variant="secondary" onClick={() => onReject(o.id)} disabled={busy}>Reject</Btn>
        </div>
      ) : CONFIRMED.includes(o.status) ? (
        <div className="sx-order-actions sx-above">
          <Btn variant="secondary" icon={Truck} onClick={() => trackOrder(o.order_number)}>Track</Btn>
          {step && <Btn variant="soft" busy={busy || stage.runningId === o.id} onClick={() => void stage.run(o.id, step.action)}>{STEP_SHORT[step.action]}</Btn>}
        </div>
      ) : null}
    </article>
  );
}

export default function OrdersScreen() {
  const { myOrders, mixedOrderIds } = useSeller();
  const { query, setQuery } = useNav();
  const tabParam = query.get('tab');
  const tab: Tab = tabParam === 'confirmed' || tabParam === 'all' || tabParam === 'closed' ? tabParam : 'new';
  const [q, setQ] = useState(query.get('q') ?? '');
  const [range, setRange] = useState<Range>('any');
  const [pay, setPay] = useState<Pay>('any');
  const [source, setSource] = useState<Source>('any');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const reject = useRejectRunner();
  const stage = useStageRunner();

  const needle = q.trim().toLowerCase();
  const matches = (s: SellerOrder) =>
    (!needle || [s.order.order_number, s.order.customer_name, s.order.city, s.order.pincode, s.order.phone, ...s.items.map(i => i.product_name)]
      .some(v => (v ?? '').toLowerCase().includes(needle)))
    && (range === 'any' || daysBefore(s.order.created_at) <= (range === 'today' ? 0 : range === '7d' ? 6 : 29))
    && (pay === 'any' || (pay === 'paid' ? s.order.payment_status === 'paid' : s.order.payment_status === 'unpaid'))
    && (source === 'any' || s.order.source === source);

  const groups = useMemo(() => ({
    new: myOrders.filter(s => s.order.status === 'pending'),
    confirmed: myOrders.filter(s => CONFIRMED.includes(s.order.status)).sort((a, b) => (confirmedAt(b) ?? b.order.created_at).localeCompare(confirmedAt(a) ?? a.order.created_at)),
    all: myOrders,
    closed: myOrders.filter(s => CLOSED.includes(s.order.status)),
  }), [myOrders]);

  const filtered = (t: Tab) => groups[t].filter(matches);
  const rows = filtered(tab);
  const filterCount = Number(range !== 'any') + Number(pay !== 'any') + Number(source !== 'any');
  const { shown, more } = useShowMore(rows, 20, `${tab}|${needle}|${range}|${pay}|${source}`);

  return (
    <div className="sx-stack">
      <PageIntro>Confirm new orders, and follow the ones you have confirmed.</PageIntro>
      <div className="sx-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Order, customer, city, product" label="Search orders" />
        <button type="button" className={`sx-icon-btn sx-filter-btn ${filterCount ? 'sx-filter-on' : ''}`} onClick={() => setFiltersOpen(true)}
          aria-label={filterCount ? `Filters, ${filterCount} on` : 'Filters'}>
          <SlidersHorizontal size={19} aria-hidden />{filterCount > 0 && <span className="sx-filter-count" aria-hidden>{filterCount}</span>}
        </button>
      </div>
      <Segmented<Tab>
        label="Show orders"
        value={tab}
        onChange={t => setQuery({ tab: t === 'new' ? null : t })}
        options={[
          { key: 'new', label: 'New', count: filtered('new').length, tone: 'warn' },
          { key: 'confirmed', label: 'Confirmed', count: filtered('confirmed').length },
          { key: 'all', label: 'All orders', count: filtered('all').length },
          { key: 'closed', label: 'Rejected / cancelled', count: filtered('closed').length },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={needle || filterCount ? 'No orders match' : tab === 'new' ? 'No new orders' : tab === 'confirmed' ? 'Nothing confirmed yet' : tab === 'closed' ? 'No rejected or cancelled orders' : 'No orders yet'}
          action={needle || filterCount ? <Btn variant="secondary" onClick={() => { setQ(''); setRange('any'); setPay('any'); setSource('any'); }}>Clear search and filters</Btn> : undefined}
        >
          {needle || filterCount ? 'Try a different search or fewer filters.' : tab === 'new' ? 'New website and telecalling orders appear here on their own.' : undefined}
        </EmptyState>
      ) : (
        <div className="sx-cards">
          {shown.map(s => <OrderCard key={s.order.id} s={s} mixed={mixedOrderIds.includes(s.order.id)} onReject={reject.ask} stage={stage} />)}
        </div>
      )}
      {more}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter orders"
        footer={
          <div className="sx-actions">
            <Btn variant="secondary" onClick={() => { setRange('any'); setPay('any'); setSource('any'); }} disabled={!filterCount}>Clear</Btn>
            <Btn onClick={() => setFiltersOpen(false)}>Show {rows.length} order{rows.length === 1 ? '' : 's'}</Btn>
          </div>
        }
      >
        <fieldset className="sx-choice">
          <legend>Placed</legend>
          {([['any', 'Any time'], ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']] as [Range, string][]).map(([k, l]) => (
            <label key={k}><input type="radio" name="sx-f-range" checked={range === k} onChange={() => setRange(k)} />{l}</label>
          ))}
        </fieldset>
        <fieldset className="sx-choice">
          <legend>Payment</legend>
          {([['any', 'Any'], ['unpaid', 'Unpaid'], ['paid', 'Paid']] as [Pay, string][]).map(([k, l]) => (
            <label key={k}><input type="radio" name="sx-f-pay" checked={pay === k} onChange={() => setPay(k)} />{l}</label>
          ))}
        </fieldset>
        <fieldset className="sx-choice">
          <legend>Came from</legend>
          {([['any', 'Anywhere'], ['website', 'Website'], ['telecaller', 'Telecalling team']] as [Source, string][]).map(([k, l]) => (
            <label key={k}><input type="radio" name="sx-f-src" checked={source === k} onChange={() => setSource(k)} />{l}</label>
          ))}
        </fieldset>
      </Sheet>
      {reject.sheet}
      {stage.sheet}
    </div>
  );
}
