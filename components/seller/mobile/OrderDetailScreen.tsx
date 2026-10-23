'use client';

import React, { useMemo } from 'react';
import { ExternalLink, FileQuestion, MapPin, Pencil, Phone, Truck, UserRound, Wallet } from 'lucide-react';
import { rupees, shortDateTime } from '../../../lib/format';
import { STAGE_LABEL } from '../../telecaller/orderTracking';
import { AppLink } from '../app/nav';
import { useSeller } from '../app/SellerProvider';
import { ORDER_STATUS_LABEL, sellerTrackingFor } from '../sellerData';
import { STEP_SHORT, useRejectRunner, useStageRunner } from './dialogs';
import { COMM_LABEL } from './OrdersScreen';
import { TrackSteps } from './TrackingScreen';
import { Btn, Card, Chip, EmptyState, KeyVal, Notice, ORDER_TONE, ProductThumb, SectionHead } from './ui';

const CALL_LABEL: Record<string, string> = {
  connected: 'Call connected', no_answer: 'No answer', busy: 'Line busy', switched_off: 'Phone switched off', wrong_number: 'Wrong number', callback_requested: 'Callback requested',
};

const telHref = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `tel:+91${digits}` : `tel:${digits}`;
};

export default function OrderDetailScreen({ id }: { id: number }) {
  const { myOrders, myProducts, seller, shipmentDetails, nextManualStep, openConfirmCard, busyOrderIds, trackOrder, mixedOrderIds } = useSeller();
  const s = myOrders.find(x => x.order.id === id);
  const reject = useRejectRunner();
  const stage = useStageRunner();
  const details = s ? shipmentDetails[s.order.id] : undefined;
  const tracking = useMemo(() => (s ? sellerTrackingFor(s.order, details) : null), [s, details]);

  if (!s || !tracking) {
    return (
      <EmptyState icon={FileQuestion} title="Order not found" action={<AppLink href="/seller/orders" className="sx-btn sx-btn-secondary sx-btn-md">Back to orders</AppLink>}>
        It may belong to another seller, or the link is out of date.
      </EmptyState>
    );
  }

  const o = s.order;
  const busy = busyOrderIds.includes(o.id);
  const step = nextManualStep(o, details);
  const closed = o.status === 'rejected' || o.status === 'cancelled';
  const confirmedOrLater = !closed && o.status !== 'pending';

  // History: delivery steps plus the telecalling team's calls, newest first.
  const history = [
    ...tracking.events.map(e => ({ key: `e-${e.stage}-${e.at}`, at: e.at, title: e.text, sub: e.place })),
    ...(o.calls ?? []).map(c => ({ key: `c-${c.id}`, at: c.at, title: `${CALL_LABEL[c.call_status] ?? 'Call'}${c.remarks ? `: ${c.remarks}` : ''}`, sub: c.by ? `Telecalling · ${c.by}` : 'Telecalling team' })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const address = [o.address, o.city, o.state, o.pincode].filter(Boolean).join(', ');
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const payTone = o.payment_status === 'paid' ? 'success' : o.payment_status === 'refunded' ? 'muted' : 'warn';

  return (
    <div className="sx-stack sx-detail">
      <Card className="sx-detail-head">
        <div className="sx-detail-top">
          <span className="sx-detail-num">{o.order_number}</span>
          <Chip tone={ORDER_TONE[o.status]}>{o.status === 'pending' ? 'New' : o.stage_label ?? ORDER_STATUS_LABEL[o.status]}</Chip>
        </div>
        <p className="sx-detail-meta">{shortDateTime(o.created_at)} · {o.source === 'website' ? 'Website order' : 'Telecalling order'}</p>
        {!closed && <TrackSteps t={tracking} />}
        {!closed && tracking.expected_at && (
          <p className={`sx-detail-eta ${tracking.delayed ? 'sx-tone-danger' : ''}`}>
            {tracking.delayed ? 'Late · ' : ''}Est. delivery {shortDateTime(tracking.expected_at).split(',')[0]}
          </p>
        )}
        {o.communication_status && (o.stage === 'seller_confirmed' || o.stage === 'telecalling') && (
          <p className="sx-detail-meta">{COMM_LABEL[o.communication_status]}{o.handled_by_name ? ` · ${o.handled_by_name}` : ''}</p>
        )}
      </Card>

      <Card aria-labelledby="sx-d-cust">
        <SectionHead id="sx-d-cust" title="Customer" />
        <div className="sx-contact">
          <UserRound size={20} aria-hidden />
          <div><strong>{o.customer_name}</strong>{o.phone && <span>{o.phone}</span>}</div>
          {o.phone && <a href={telHref(o.phone)} className="sx-icon-btn sx-call" aria-label={`Call ${o.customer_name}`}><Phone size={19} aria-hidden /></a>}
        </div>
        <div className="sx-contact">
          <MapPin size={20} aria-hidden />
          <div><strong>Delivery address</strong><span>{address || 'No address on this order'}</span></div>
          {address && <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="sx-icon-btn" aria-label="Open the address in Maps (opens a new window)"><ExternalLink size={18} aria-hidden /></a>}
        </div>
      </Card>

      <Card aria-labelledby="sx-d-items">
        <SectionHead id="sx-d-items" title="Order items" meta={`${s.units} unit${s.units === 1 ? '' : 's'}`} />
        <ul className="sx-items">
          {s.items.map(i => {
            const p = myProducts.find(x => x.name === i.product_name);
            return (
              <li key={i.product_name}>
                <ProductThumb product={p} name={i.product_name} size={52} />
                <span className="sx-items-main">
                  <strong>{i.product_name}</strong>
                  <span>{p?.size ? `${p.size} · ` : ''}{rupees(i.price)} × {i.quantity}</span>
                </span>
                <strong className="sx-items-amt">{rupees(i.price * i.quantity)}</strong>
              </li>
            );
          })}
        </ul>
        {mixedOrderIds.includes(o.id) && <p className="sx-order-note">This order also has items from other sellers; only yours are shown.</p>}
      </Card>

      <Card aria-labelledby="sx-d-pay">
        <SectionHead id="sx-d-pay" title="Payment" />
        <dl className="sx-kvs">
          <KeyVal k="Method" v={o.payment_method === 'COD' ? 'Cash on delivery' : o.payment_method} />
          <KeyVal k="Status" v={<Chip tone={payTone}>{o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'refunded' ? 'Refunded' : 'Unpaid'}</Chip>} />
          <KeyVal k="Items total" v={rupees(s.gross)} />
          <KeyVal k={`Manikstu commission (${seller.commissionPct}%)`} v={`− ${rupees(s.commission)}`} />
          <KeyVal k="You get" v={rupees(s.net)} strong />
        </dl>
        {s.payout !== 'None' && (
          <AppLink href="/seller/payouts" className="sx-inline-link"><Wallet size={16} aria-hidden /> Payout: {s.payout === 'Paid out' ? 'past payout date (estimated)' : s.payout.toLowerCase()}</AppLink>
        )}
      </Card>

      {confirmedOrLater && (
        <Card aria-labelledby="sx-d-courier">
          <SectionHead id="sx-d-courier" title="Courier & tracking"
            action={<Btn size="sm" variant="ghost" icon={Pencil} onClick={() => openConfirmCard(o.id)}>{details?.courier ? 'Edit' : 'Add'}</Btn>} />
          {details?.courier ? (
            <dl className="sx-kvs">
              <KeyVal k="Courier" v={details.courier} />
              <KeyVal k="Tracking / AWB" v={<span className="sx-mono">{details.trackingNo}</span>} />
            </dl>
          ) : (
            <Notice tone="info" icon={Truck}>No courier details on this device. They are kept only until the app is closed, because the CRM doesn&apos;t store them yet.</Notice>
          )}
        </Card>
      )}

      {o.notes && (
        <Card aria-labelledby="sx-d-notes">
          <SectionHead id="sx-d-notes" title="Notes" />
          <p className="sx-body">{o.notes}</p>
        </Card>
      )}

      <Card aria-labelledby="sx-d-hist">
        <SectionHead id="sx-d-hist" title="Order history" meta={STAGE_LABEL[tracking.stage]} />
        <ol className="sx-timeline">
          {history.map(h => (
            <li key={h.key}>
              <span className="sx-tl-title">{h.title}</span>
              <span className="sx-tl-sub">{shortDateTime(h.at)}{h.sub ? ` · ${h.sub}` : ''}</span>
            </li>
          ))}
        </ol>
      </Card>

      {(o.status === 'pending' || confirmedOrLater) && (
        <div className="sx-actionbar">
          {o.status === 'pending' ? (
            <>
              <Btn variant="danger" size="lg" onClick={() => reject.ask(o.id)} disabled={busy}>Reject</Btn>
              <Btn size="lg" onClick={() => openConfirmCard(o.id)} disabled={busy}>Confirm order</Btn>
            </>
          ) : (
            <>
              <Btn variant="secondary" size="lg" icon={Truck} onClick={() => trackOrder(o.order_number)}>Track</Btn>
              {step && <Btn size="lg" busy={busy || stage.runningId === o.id} onClick={() => void stage.run(o.id, step.action)}>{STEP_SHORT[step.action]}</Btn>}
            </>
          )}
        </div>
      )}
      {reject.sheet}
      {stage.sheet}
    </div>
  );
}
