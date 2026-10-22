import type { CatalogProduct } from '../../data/catalogProducts';
import type { OrderItem, OrderStatus, SalesOrder } from '../../data/managerDashboard';
import { TODAY } from '../../data/today';
import type { Seller } from '../../data/sellers';
import { RESERVING_STATUSES, StockStatus, stockStatusOf } from '../../data/stockLevels';
import { daysBefore, nowStamp } from '../../lib/format';
import { TrackEvent, TrackStage, Tracking, isLiveOrder, realNowStamp, trackingFor } from '../telecaller/orderTracking';

/** Units each product has promised to orders that have not shipped yet, by product name (as order lines name them). */
export function reservedByName(orders: SellerOrder[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of orders) {
    if (!RESERVING_STATUSES.has(o.order.status)) continue;
    for (const i of o.items) out.set(i.product_name, (out.get(i.product_name) ?? 0) + i.quantity);
  }
  return out;
}

/** What can still be sold: the shelf minus what unshipped orders hold. The figure the website shows customers. */
export function availableOf(p: CatalogProduct, reserved: Map<string, number>): number {
  return Math.max(0, p.stock_quantity - (reserved.get(p.name) ?? 0));
}

/** Each product's available units and low / out status. */
export function stockLevels(products: CatalogProduct[], orders: SellerOrder[]): { p: CatalogProduct; available: number; status: StockStatus }[] {
  const reserved = reservedByName(orders);
  return products.map(p => {
    const available = availableOf(p, reserved);
    return { p, available, status: stockStatusOf(available) };
  });
}

/** One order as a seller sees it: only their own items, and their share of the money. */
export interface SellerOrder {
  order: SalesOrder;
  items: OrderItem[];
  units: number;
  gross: number;
  commission: number;
  net: number;
  deliveredAt: string | null;
  payout: PayoutStatus;
}

/**
 * Courier and tracking number a seller types in by hand when confirming an order, plus the
 * fulfilment steps they've clicked through since (sample data, not backed by the API yet).
 * packedAt and outForDeliveryAt exist only once the seller has marked them - the app never
 * guesses these from elapsed time.
 */
export interface ShipmentDetails {
  /** The courier the seller is using (typed in when confirming the order). */
  courier: string;
  trackingNo: string;
  confirmedAt: string;
  packedAt?: string;
  outForDeliveryAt?: string;
}

export type ManualStageAction = 'packed' | 'shipped' | 'out_for_delivery' | 'delivered';

/** The next fulfilment step the seller can take by hand, from confirmed through delivered. */
export function nextManualStep(order: SalesOrder, details: ShipmentDetails | undefined): { action: ManualStageAction; label: string } | null {
  if (order.status === 'confirmed') {
    // Packing is a real status (ready_for_dispatch) on live orders, so an order can only be shipped after it.
    return isLiveOrder(order) || !details?.packedAt ? { action: 'packed', label: 'Mark packed' } : { action: 'shipped', label: 'Mark shipped' };
  }
  if (order.status === 'ready_for_dispatch') return { action: 'shipped', label: 'Mark shipped' };
  if (order.status === 'shipped') {
    return details?.outForDeliveryAt ? { action: 'delivered', label: 'Mark delivered' } : { action: 'out_for_delivery', label: 'Mark out for delivery' };
  }
  return null;
}

const historyAt = (o: SalesOrder, s: OrderStatus) => o.status_history.find(h => h.status === s)?.at ?? null;

/**
 * Delivery tracking driven entirely by the seller's own actions: placed and confirmed come
 * from real order data, and packed / shipped / out-for-delivery / delivered only appear once
 * the seller has actually clicked that step - never guessed from a timer. Courier, AWB and the
 * expected delivery date are still filled in once shipped (the seller doesn't pick a courier
 * by hand), reusing the same values the simulated trackingFor derives from the real ship date.
 */
export function sellerTrackingFor(o: SalesOrder, details: ShipmentDetails | undefined, nowArg = nowStamp()): Tracking {
  const now = isLiveOrder(o) ? realNowStamp() : nowArg; // live orders are dated by the real calendar
  const base = trackingFor(o, now);
  if (o.status === 'cancelled' || o.status === 'rejected') return base;
  // The courier and tracking number the seller typed in when confirming win over the simulated ones.
  const courier = details?.courier.trim() || base.courier;
  const awb = details?.trackingNo.trim() || base.awb;

  const confirmedAt = historyAt(o, 'confirmed');
  const packedAt = historyAt(o, 'ready_for_dispatch') ?? details?.packedAt ?? null;
  const shippedAt = historyAt(o, 'shipped');
  const outAt = details?.outForDeliveryAt ?? null;
  const deliveredAt = historyAt(o, 'delivered');

  const stage: TrackStage = deliveredAt ? 'delivered' : outAt ? 'out_for_delivery' : shippedAt ? 'shipped' : packedAt ? 'packed' : confirmedAt ? 'confirmed' : 'placed';

  const events: TrackEvent[] = [
    { stage: 'placed', at: o.created_at, text: o.source === 'website' ? 'Order placed on the website' : 'Order taken on a call', place: o.source === 'website' ? 'Website' : 'Telecalling team' },
  ];
  if (confirmedAt) events.push({ stage: 'confirmed', at: confirmedAt, text: 'Order confirmed by the seller', place: 'Seller' });
  if (packedAt) events.push({ stage: 'packed', at: packedAt, text: `Packed: ${o.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ')}`, place: 'Seller' });
  if (shippedAt) events.push({ stage: 'shipped', at: shippedAt, text: `Handed to ${courier ?? "the courier"} · tracking ${awb ?? "—"}`, place: 'Seller' });
  if (outAt) events.push({ stage: 'out_for_delivery', at: outAt, text: 'Out for delivery', place: o.city });
  if (deliveredAt) {
    events.push({
      stage: 'delivered',
      at: deliveredAt,
      text: `Delivered to ${o.customer_name}${o.payment_method === 'COD' ? (o.payment_status === 'paid' ? ' · cash collected' : ' · cash not collected yet') : ''}`,
      place: o.city,
    });
  }

  const expected_at = stage === 'delivered' ? null : base.expected_at;
  const delayed = (stage === 'shipped' || stage === 'out_for_delivery') && !!expected_at && expected_at < now;

  return { stage, courier, awb, expected_at, expectedIsEstimate: !shippedAt, delayed, events };
}

export type PayoutStatus = 'Paid out' | 'Due' | 'On hold' | 'None';

/** Chip class for each payout status. */
export const PAYOUT_CHIP: Record<PayoutStatus, string> = {
  'Paid out': 'delivered',
  Due: 'transit',
  'On hold': 'pending',
  None: 'muted',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'New',
  confirmed: 'Confirmed',
  ready_for_dispatch: 'Packed',
  shipped: 'Dispatched',
  delivered: 'Delivered',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/**
 * The seller's orders, newest first. Payout rule (sample, until the backend has settlements):
 * delivered and paid orders are paid out `payoutAfterDays` after delivery; orders not yet
 * delivered are on hold; cancelled or refunded orders earn nothing.
 */
export function sellerOrders(orders: SalesOrder[], seller: Seller, products: CatalogProduct[]): SellerOrder[] {
  const mine = new Set(products.filter(p => seller.productIds.includes(p.id)).map(p => p.name));
  return orders
    .map(order => {
      // The backend has already cut a live order down to this seller's lines, so trust it; only the offline sample needs the name filter.
      const items = isLiveOrder(order) ? order.items : order.items.filter(i => mine.has(i.product_name));
      if (items.length === 0) return null;
      const gross = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const commission = Math.round((gross * seller.commissionPct) / 100);
      const deliveredAt = order.status === 'delivered'
        ? [...order.status_history].reverse().find(h => h.status === 'delivered')?.at ?? order.created_at
        : null;
      let payout: PayoutStatus;
      if (order.status === 'cancelled' || order.status === 'rejected' || order.payment_status === 'refunded') payout = 'None';
      else if (deliveredAt) payout = daysBefore(deliveredAt) >= seller.payoutAfterDays ? 'Paid out' : 'Due';
      else payout = 'On hold';
      return {
        order,
        items,
        units: items.reduce((s, i) => s + i.quantity, 0),
        gross,
        commission,
        net: gross - commission,
        deliveredAt,
        payout,
      };
    })
    .filter((x): x is SellerOrder => x !== null)
    .sort((a, b) => b.order.created_at.localeCompare(a.order.created_at));
}

/** Earnings counted for sales figures: everything except cancelled or refunded orders. */
export const counts = (o: SellerOrder) => o.payout !== 'None';

/** Date of the next weekly payout (Mondays), from the sample TODAY. */
export function nextPayoutDate(): string {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
