import React, { useEffect, useState } from 'react';
import type { SalesOrder, TrackerSale } from '../../data/managerDashboard';
import { ORDER_CHIP, rupees, shortDate, shortDateTime } from '../../lib/format';
import Modal from '../Modal';
import TrackingTimeline from '../seller/TrackingTimeline';
import { ORDER_STATUS_LABEL, sellerTrackingFor } from '../seller/sellerData';
import { callerName, productName } from './tcData';

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; order: SalesOrder | null };

const PAYMENT_LABEL = { paid: 'Paid', unpaid: 'Not paid yet', refunded: 'Refunded' } as const;

/**
 * Read-only details of one sale on the Sales page: the sale itself, the order it was taken as (items, prices, payment,
 * status) and that order's tracking, drawn by the same TrackingTimeline the seller's Tracking page uses, from the
 * order's recorded status changes only (sellerTrackingFor). Nothing here can change the order.
 */
export default function SaleDetails({ sale, onClose }: { sale: TrackerSale | null; onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const saleId = sale?.id ?? null;

  useEffect(() => {
    if (saleId === null) return;
    // A new sale (or a retry) starts from a blank state and ignores any answer still on its way for the previous one,
    // so one sale's order never shows under another.
    const controller = new AbortController();
    setLoad({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/tracker/sales/${saleId}/order`, { cache: 'no-store', signal: controller.signal });
        const body = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!res.ok || !body?.data) {
          setLoad({ status: 'error', error: body?.error || 'Could not load the order details.' });
          return;
        }
        setLoad({ status: 'ok', order: (body.data.order ?? null) as SalesOrder | null });
      } catch {
        if (!controller.signal.aborted) setLoad({ status: 'error', error: 'Could not reach the server. Check your connection and try again.' });
      }
    })();
    return () => controller.abort();
  }, [saleId, attempt]);

  const order = load.status === 'ok' ? load.order : null;
  const tracking = order ? sellerTrackingFor(order, undefined) : null;
  const lineTotal = order ? order.items.reduce((a, i) => a + i.price * i.quantity, 0) : 0;

  return (
    <Modal isOpen={!!sale} onClose={onClose} wide title={order ? `Order ${order.order_number}` : 'Sale details'}>
      {sale && (
        <div className="sale-details">
          <section className="od-section od-row">
            <div><div className="od-label">Sale</div>{productName(sale.product_id)} × {sale.quantity} · <strong>{rupees(sale.amount)}</strong>
              <div className="loc">{shortDate(sale.sold_at)} · by {callerName(sale.caller_id)}</div></div>
            <div><div className="od-label">Customer</div>{sale.customer_name}
              {order && <div className="loc">{order.phone}</div>}</div>
          </section>

          {load.status === 'loading' && <p className="loc sd-state" role="status">Loading the order…</p>}

          {load.status === 'error' && (
            <div className="inline-alert sd-state" role="alert">
              <span>{load.error}</span>
              <button type="button" className="btn-secondary btn-small" onClick={() => setAttempt(n => n + 1)}>Try again</button>
            </div>
          )}

          {load.status === 'ok' && !order && (
            <p className="loc sd-state">
              No order is linked to this sale. It was recorded without a delivery order (or before sales were linked to
              orders), so there are no items or tracking to show.
            </p>
          )}

          {order && tracking && (
            <>
              <section className="od-section od-row">
                <div>
                  <div className="od-label">Order</div>
                  <span className={`chip ${ORDER_CHIP[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
                  <div className="loc">Placed {shortDateTime(order.created_at)} · {order.source === 'website' ? 'website' : 'on a call'}</div>
                </div>
                <div>
                  <div className="od-label">Payment</div>
                  {order.payment_method} · {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
                </div>
              </section>

              <section className="od-section">
                <div className="od-label">Delivering to</div>
                {[order.address, order.city, order.state, order.pincode].filter(Boolean).join(', ') || <span className="loc">No address recorded</span>}
              </section>

              <section className="od-section">
                <div className="od-label">Items</div>
                <div className="table-wrap">
                  <table className="sd-items">
                    <thead><tr><th>Product</th><th className="num-col">Qty</th><th className="num-col">Unit price</th><th className="num-col">Line total</th></tr></thead>
                    <tbody>
                      {order.items.map((i, n) => (
                        <tr key={n}>
                          <td>{i.product_name}</td>
                          <td className="num-col">{i.quantity}</td>
                          <td className="num-col">{rupees(i.price)}</td>
                          <td className="num-col">{rupees(i.price * i.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><th colSpan={3}>Order total</th><td className="num-col strong">{rupees(order.total)}</td></tr>
                    </tfoot>
                  </table>
                </div>
                {Math.abs(lineTotal - order.total) >= 1 && (
                  <p className="loc text-warn">The order total differs from the items added up ({rupees(lineTotal)}).</p>
                )}
              </section>

              <TrackingTimeline tracking={tracking}
                courierMissing={order.status === 'shipped' || order.status === 'delivered' ? 'Courier not recorded' : 'Not shipped yet'} />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
