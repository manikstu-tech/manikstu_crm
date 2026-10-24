'use client';

import React, { useState } from 'react';
import { CalendarClock, Hourglass, Info, Percent, ReceiptIndianRupee, Wallet } from 'lucide-react';
import { rupees, shortDate } from '../../../lib/format';
import { AppLink, useNav } from '../app/nav';
import { useSeller } from '../app/SellerProvider';
import { PayoutStatus, SellerOrder, nextPayoutDate, scheduledPayoutDate } from '../sellerData';
import { Btn, Card, Chip, EmptyState, KeyVal, Metric, Notice, Segmented, Sheet, Tone, useShowMore } from './ui';

type Tab = 'Due' | 'On hold' | 'Paid out';
// "Paid out" is worked out from dates, not confirmed by Manikstu's accounts, so the app says so.
const LABEL: Record<PayoutStatus, string> = { Due: 'Due', 'On hold': 'On hold', 'Paid out': 'Past payout date', None: 'No payout' };
const TONE: Record<PayoutStatus, Tone> = { Due: 'transit', 'On hold': 'new', 'Paid out': 'delivered', None: 'muted' };

export default function PayoutsScreen() {
  const { seller, myOrders } = useSeller();
  const { query, setQuery } = useNav();
  const t = query.get('tab');
  const tab: Tab = t === 'hold' ? 'On hold' : t === 'paid' ? 'Paid out' : 'Due';
  const [open, setOpen] = useState<SellerOrder | null>(null);

  const of = (s: PayoutStatus) => myOrders.filter(o => o.payout === s);
  const sum = (s: PayoutStatus) => of(s).reduce((n, o) => n + o.net, 0);
  const commission = myOrders.filter(o => o.payout === 'Paid out' || o.payout === 'Due').reduce((n, o) => n + o.commission, 0);
  const rows = of(tab).sort((a, b) => (b.deliveredAt ?? b.order.created_at).localeCompare(a.deliveredAt ?? a.order.created_at));
  const { shown, more } = useShowMore(rows, 20, tab);
  const payDate = (o: SellerOrder) => (o.deliveredAt ? scheduledPayoutDate(o.deliveredAt, seller.payoutAfterDays) : null);

  return (
    <div className="sx-stack">
      <section className="sx-hero sx-hero-compact" aria-labelledby="sx-po-due">
        <span id="sx-po-due" className="sx-hero-label">Payout due</span>
        <span className="sx-hero-value">{rupees(sum('Due'))}</span>
        <span className="sx-hero-sub">
          <CalendarClock size={15} aria-hidden /> {of('Due').length} delivered order{of('Due').length === 1 ? '' : 's'} · next payout day Monday {shortDate(nextPayoutDate())}
        </span>
      </section>

      <div className="sx-metrics sx-metrics-3">
        <Metric icon={Hourglass} value={rupees(sum('On hold'))} label="On hold" sub="not delivered yet" onClick={() => setQuery({ tab: 'hold' })} pressed={tab === 'On hold'} />
        <Metric icon={Wallet} value={rupees(sum('Paid out'))} label="Past payout date" sub="estimated" onClick={() => setQuery({ tab: 'paid' })} pressed={tab === 'Paid out'} />
        <Metric icon={Percent} value={rupees(commission)} label="Commission" sub={`${seller.commissionPct}% to Manikstu`} />
      </div>

      <Notice tone="info" icon={Info}>
        Worked out from your orders: delivered orders are paid every Monday, {seller.payoutAfterDays} days after delivery, minus {seller.commissionPct}% commission.
        Manikstu&apos;s settlement records aren&apos;t connected yet, so check money received against your bank statement.
      </Notice>

      <Segmented<Tab>
        label="Show payouts"
        value={tab}
        onChange={k => setQuery({ tab: k === 'Due' ? null : k === 'On hold' ? 'hold' : 'paid' })}
        options={[
          { key: 'Due', label: 'Due', count: of('Due').length },
          { key: 'On hold', label: 'On hold', count: of('On hold').length },
          { key: 'Paid out', label: 'Past payout date', count: of('Paid out').length },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptIndianRupee} title={tab === 'Due' ? 'Nothing due right now' : tab === 'On hold' ? 'Nothing on hold' : 'No earlier payouts'}>
          {tab === 'Due' ? 'Delivered orders appear here until their payout date.' : tab === 'On hold' ? 'Orders wait here until they are delivered.' : undefined}
        </EmptyState>
      ) : (
        <Card className="sx-card-flush">
          <ul className="sx-pay-list">
            {shown.map(o => (
              <li key={o.order.id}>
                <button type="button" className="sx-pay-row" onClick={() => setOpen(o)}>
                  <span className="sx-pay-main">
                    <strong>{o.order.order_number}</strong>
                    <span>{o.order.customer_name} · {o.deliveredAt ? `delivered ${shortDate(o.deliveredAt)}` : 'not delivered yet'}</span>
                  </span>
                  <span className="sx-pay-amt">
                    <strong>{rupees(o.net)}</strong>
                    <Chip tone={TONE[o.payout]}>{LABEL[o.payout]}</Chip>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {more}
        </Card>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `Payout · ${open.order.order_number}` : 'Payout'}
        footer={open && <div className="sx-actions"><Btn variant="secondary" onClick={() => setOpen(null)}>Close</Btn><AppLink href={`/seller/orders/${open.order.id}`} className="sx-btn sx-btn-primary sx-btn-md">View order</AppLink></div>}>
        {open && (
          <div className="sx-stack">
            <dl className="sx-kvs">
              <KeyVal k="Status" v={<Chip tone={TONE[open.payout]}>{LABEL[open.payout]}</Chip>} />
              <KeyVal k="Customer" v={`${open.order.customer_name}, ${open.order.city}`} />
              <KeyVal k="Items" v={open.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ')} />
              <KeyVal k="Delivered" v={open.deliveredAt ? shortDate(open.deliveredAt) : 'Not yet'} />
              <KeyVal k="Sale amount" v={rupees(open.gross)} />
              <KeyVal k={`Commission (${seller.commissionPct}%)`} v={`− ${rupees(open.commission)}`} />
              <KeyVal k="You get" v={rupees(open.net)} strong />
              {payDate(open) && <KeyVal k={open.payout === 'Paid out' ? 'Payout date (estimated)' : 'Expected payout'} v={shortDate(payDate(open)!)} />}
            </dl>
            {open.payout === 'On hold' && <p className="sx-hint">Paid after delivery: the Monday at least {seller.payoutAfterDays} days later.</p>}
            {open.payout === 'Paid out' && <p className="sx-hint">This date is from the payout schedule. The app can&apos;t confirm the transfer yet.</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
