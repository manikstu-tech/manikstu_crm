import { CATALOG_PRODUCTS, CatalogProduct, LOW_STOCK_LEVEL } from '../../data/catalogProducts';
import { SalesOrder } from '../../data/managerDashboard';
import { Complaint } from '../../data/complaints';
import { daysBefore } from '../../lib/format';
import { Tracking } from './orderTracking';

// Stock for the head's Inventory page. The backend has one number per product
// (`products.stock_quantity`); reserved, available and days left are worked out here from orders.

export type StockStatus = 'in' | 'low' | 'out';
export const STOCK_LABEL: Record<StockStatus, string> = { in: 'In stock', low: 'Low', out: 'Out of stock' };
export const STOCK_CHIP: Record<StockStatus, string> = { in: 'delivered', low: 'transit', out: 'pending' };

/** Orders not yet handed to the courier: their units are still in the warehouse, promised to someone. */
const UNSHIPPED = new Set(['placed', 'confirmed', 'packed']);

export interface StockRow {
  p: CatalogProduct;
  stock: number;
  reserved: number;
  available: number;
  /** Units promised to customers beyond what's in stock. */
  short: number;
  sold7: number;
  sold30: number;
  team30: number;
  web30: number;
  /** Average units sold per day over 30 days. */
  perDay: number;
  /** Days until available stock runs out at that pace (null = not selling). */
  daysLeft: number | null;
  value: number;
  status: StockStatus;
  /** Unshipped orders that can't be filled from current stock, oldest first. */
  waiting: SalesOrder[];
  complaints: Complaint[];
  /** Units sold per day, last 30 days (oldest first). */
  trend: number[];
  /** Telecaller id → units sold in 30 days. */
  byCaller: Map<number, number>;
}

export function stockRows(tracked: { o: SalesOrder; t: Tracking }[], complaints: Complaint[]): StockRow[] {
  const live = tracked.filter(x => x.t.stage !== 'cancelled');
  return CATALOG_PRODUCTS.map(p => {
    const lines = live.flatMap(x => x.o.items.filter(i => i.product_name === p.name).map(i => ({ ...x, qty: i.quantity })));

    // Hand out stock to unshipped orders, oldest first; whoever is left over is waiting for stock.
    const open = lines.filter(l => UNSHIPPED.has(l.t.stage)).sort((a, b) => a.o.created_at.localeCompare(b.o.created_at));
    let left = p.stock_quantity;
    const waiting: SalesOrder[] = [];
    for (const l of open) {
      if (left >= l.qty) left -= l.qty;
      else { waiting.push(l.o); left = 0; }
    }
    const reserved = open.reduce((a, l) => a + l.qty, 0);

    const recent = lines.filter(l => daysBefore(l.o.created_at) < 30);
    const sold30 = recent.reduce((a, l) => a + l.qty, 0);
    const team30 = recent.filter(l => l.o.source === 'telecaller').reduce((a, l) => a + l.qty, 0);
    const trend = Array.from({ length: 30 }, (_, i) => recent.filter(l => daysBefore(l.o.created_at) === 29 - i).reduce((a, l) => a + l.qty, 0));
    const byCaller = new Map<number, number>();
    recent.forEach(l => l.o.caller_id !== null && byCaller.set(l.o.caller_id, (byCaller.get(l.o.caller_id) ?? 0) + l.qty));

    const available = Math.max(0, p.stock_quantity - reserved);
    const perDay = sold30 / 30;
    const daysLeft = perDay > 0 ? Math.floor(available / perDay) : null;
    const status: StockStatus =
      available === 0 ? 'out'
      : p.stock_quantity < LOW_STOCK_LEVEL || (daysLeft !== null && daysLeft < 7) ? 'low'
      : 'in';

    return {
      p,
      stock: p.stock_quantity,
      reserved,
      available,
      short: Math.max(0, reserved - p.stock_quantity),
      sold7: lines.filter(l => daysBefore(l.o.created_at) < 7).reduce((a, l) => a + l.qty, 0),
      sold30,
      team30,
      web30: sold30 - team30,
      perDay,
      daysLeft,
      value: p.stock_quantity * (p.price ?? 0),
      status,
      waiting,
      complaints: complaints.filter(c => c.product === p.name),
      trend,
      byCaller,
    };
  });
}

/** Well stocked but selling slowly: worth pushing on calls. */
export const isSlow = (r: StockRow) => r.p.is_active && r.p.price !== null && r.available >= 25 && (r.daysLeft === null || r.daysLeft > 45);
/** Selling fast enough to run out within a week. */
export const runsOutSoon = (r: StockRow) => r.available > 0 && r.daysLeft !== null && r.daysLeft < 7;
