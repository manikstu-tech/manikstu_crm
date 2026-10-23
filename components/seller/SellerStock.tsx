import React, { useMemo, useState } from 'react';
import { Pencil, PackagePlus, Plus } from 'lucide-react';
import type { CatalogProduct } from '../../data/catalogProducts';
import { LOW_STOCK_LEVEL, RESERVING_STATUSES, StockStatus, stockStatusOf } from '../../data/stockLevels';
import { daysBefore, pct, rupees, rupeesShort, shortDate, shortDateTime } from '../../lib/format';
import { INDIA_STATES, INDIA_UTS, districtFor, stateFor } from '../../lib/regions';
import { SellerOrder } from './sellerData';
import RegionDropdown from './RegionDropdown';

/** Region filter value: 'all', 's:<state>' or 'd:<state>|<district>'. Regions come from where orders are delivered. */
type Region = string;
const regionOf = (o: SellerOrder) => {
  const state = stateFor(o.order.state, o.order.pincode);
  return { state, district: districtFor(o.order.state, o.order.pincode, o.order.city) };
};
const inRegion = (o: SellerOrder, region: Region) => {
  if (region === 'all') return true;
  const { state, district } = regionOf(o);
  return region.startsWith('s:') ? state === region.slice(2) : `${state}|${district}` === region.slice(2);
};
const regionLabel = (region: Region) =>
  region === 'all' ? 'All regions' : region.startsWith('s:') ? region.slice(2) : region.slice(2).replace('|', ' › ');

/** Days of sales that a suggested restock should cover. */
export const COVER_DAYS = 30;

export type { StockStatus };
export const STOCK_LABEL: Record<StockStatus, string> = { in: 'In stock', low: 'Low', out: 'Out of stock' };
export const STOCK_CHIP: Record<StockStatus, string> = { in: 'delivered', low: 'transit', out: 'pending' };

/** A stock change recorded by the seller on this page. */
export interface StockMovement {
  id: number;
  productId: number;
  units: number;
  note: string;
  at: string;
}

export interface StockRow {
  p: CatalogProduct;
  stock: number;
  /** Units in orders that aren't shipped yet. */
  reserved: number;
  available: number;
  /** Units promised beyond what's in stock. */
  short: number;
  sold30: number;
  perDay: number;
  daysLeft: number | null;
  suggested: number;
  status: StockStatus;
  /** Unshipped orders that can't be filled from current stock, oldest first. */
  waiting: SellerOrder[];
}

// Packed (ready for dispatch) orders are still on the shelf too, as the backend counts them.
const UNSHIPPED = RESERVING_STATUSES;

export function stockRows(products: CatalogProduct[], orders: SellerOrder[]): StockRow[] {
  const live = orders.filter(o => o.order.status !== 'cancelled');
  return products.map(p => {
    const lines = live.flatMap(o => o.items.filter(i => i.product_name === p.name).map(i => ({ o, qty: i.quantity })));

    // Hand out stock to unshipped orders, oldest first; whatever doesn't fit is waiting for stock.
    const open = lines.filter(l => UNSHIPPED.has(l.o.order.status)).sort((a, b) => a.o.order.created_at.localeCompare(b.o.order.created_at));
    let left = p.stock_quantity;
    const waiting: SellerOrder[] = [];
    for (const l of open) {
      if (left >= l.qty) left -= l.qty;
      else { waiting.push(l.o); left = 0; }
    }
    const reserved = open.reduce((a, l) => a + l.qty, 0);
    const available = Math.max(0, p.stock_quantity - reserved);
    const sold30 = lines.filter(l => daysBefore(l.o.order.created_at) < 30).reduce((a, l) => a + l.qty, 0);
    const perDay = sold30 / 30;
    const daysLeft = perDay > 0 ? Math.floor(available / perDay) : null;
    const short = Math.max(0, reserved - p.stock_quantity);
    const suggested = perDay > 0 ? Math.max(0, Math.ceil(perDay * COVER_DAYS) - available + short) : short;
    // Under LOW_STOCK_LEVEL available is low, 0 is out; a product selling fast enough to run out within a week is
    // low too, however many units it has.
    const level = stockStatusOf(available);
    const status: StockStatus = level === 'in' && daysLeft !== null && daysLeft < 7 ? 'low' : level;
    return { p, stock: p.stock_quantity, reserved, available, short, sold30, perDay, daysLeft, suggested, status, waiting };
  });
}

export type StockTab = 'all' | 'restock' | 'low' | 'out';
type Tab = StockTab;
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'restock', label: 'Needs restock' },
  { key: 'low', label: 'Low' },
  { key: 'out', label: 'Out of stock' },
];
export const inStockTab = (r: StockRow, t: Tab) => t === 'all' || (t === 'restock' ? r.p.is_active && r.suggested > 0 : r.status === t);

interface Props {
  products: CatalogProduct[];
  orders: SellerOrder[];
  movements: StockMovement[];
  searchQuery: string;
  onRestock: (product: CatalogProduct, suggested: number) => void;
  /** Open the product's listing for editing (price, stock, description, images…). */
  onEditProduct: (product: CatalogProduct) => void;
  onAddProduct: () => void;
}

export default function SellerStock({ products, orders, movements, searchQuery, onRestock, onEditProduct, onAddProduct }: Props) {
  const [tab, setTab] = useState<Tab>('all');
  const [region, setRegion] = useState<Region>('all');
  const rows = useMemo(() => stockRows(products, orders), [products, orders]);
  const count = (t: Tab) => rows.filter(r => inStockTab(r, t)).length;

  // Region dropdown: states and their districts, with order counts
  const regionOptions = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    orders.forEach(o => {
      const { state, district } = regionOf(o);
      const d = m.get(state) ?? new Map<string, number>();
      d.set(district, (d.get(district) ?? 0) + 1);
      m.set(state, d);
    });
    return Array.from(m)
      .map(([state, d]) => ({ state, total: Array.from(d.values()).reduce((a, n) => a + n, 0), districts: Array.from(d).sort((a, b) => a[0].localeCompare(b[0])) }))
      .sort((a, b) => b.total - a.total);
  }, [orders]);
  const stateCount = (state: string) => regionOptions.find(s => s.state === state)?.total ?? 0;
  // State dropdown follows the region: a state, or a district inside it
  const selectedState = region === 'all' ? 'all' : region.slice(2).split('|')[0];

  // Demand from the chosen region, against the shared stock
  const regional = region !== 'all';
  const regionOrders = useMemo(() => orders.filter(o => inRegion(o, region)), [orders, region]);
  const demand = useMemo(() => {
    const live = regionOrders.filter(o => o.order.status !== 'cancelled');
    return new Map(products.map(p => {
      const lines = live.flatMap(o => o.items.filter(i => i.product_name === p.name).map(i => ({ o, qty: i.quantity })));
      const reserved = lines.filter(l => UNSHIPPED.has(l.o.order.status)).reduce((a, l) => a + l.qty, 0);
      const sold30 = lines.filter(l => daysBefore(l.o.order.created_at) < 30).reduce((a, l) => a + l.qty, 0);
      return [p.id, { reserved, sold30, perDay: sold30 / 30, needed: Math.ceil((sold30 / 30) * COVER_DAYS) }];
    }));
  }, [products, regionOrders]);
  const here = (id: number) => demand.get(id) ?? { reserved: 0, sold30: 0, perDay: 0, needed: 0 };

  const q = searchQuery.trim().toLowerCase();
  const shown = rows
    .filter(r => inStockTab(r, tab))
    .filter(r => !q || [r.p.name, r.p.category, r.p.size].some(v => v.toLowerCase().includes(q)))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.available - b.available);

  const units = rows.reduce((a, r) => a + r.stock, 0);
  const value = rows.reduce((a, r) => a + r.stock * (r.p.price ?? 0), 0);
  const reserved = rows.reduce((a, r) => a + r.reserved, 0);
  // Stock goes to unshipped orders oldest first across all regions; then show the region's waiting orders
  const waiting = rows.flatMap(r => r.waiting.filter(o => inRegion(o, region)).map(o => ({ r, o })));

  const sold30All = rows.reduce((a, r) => a + r.sold30, 0);
  const sold30Here = products.reduce((a, p) => a + here(p.id).sold30, 0);
  const reservedHere = products.reduce((a, p) => a + here(p.id).reserved, 0);
  const ordersHere30 = regionOrders.filter(o => o.order.status !== 'cancelled' && daysBefore(o.order.created_at) < 30).length;

  // Movements: restocks recorded here, and units that left with shipped orders in the last 14 days
  const nameToId = new Map(products.map(p => [p.name, p.id]));
  const shipments = regionOrders.flatMap(o => {
    const at = o.order.status_history.find(h => h.status === 'shipped')?.at;
    if (!at || daysBefore(at) >= 14 || o.order.status === 'cancelled') return [];
    return o.items.map(i => ({ key: `s-${o.order.id}-${i.product_name}`, productId: nameToId.get(i.product_name) ?? 0, units: -i.quantity, note: `Shipped · ${o.order.order_number}`, at }));
  });
  const moves = [
    // Restocks go into the shared stock, so they show only for all regions
    ...(regional ? [] : movements).map(m => ({ key: `r-${m.id}`, productId: m.productId, units: m.units, note: m.note ? `Restocked · ${m.note}` : 'Restocked', at: m.at })),
    ...shipments,
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
  const productName = (id: number) => products.find(p => p.id === id)?.name ?? '—';

  return (
    <>
      {regional ? (
        <div className="scoreboard">
          <div className="score"><div className="num">{ordersHere30}</div><div className="label">Orders from {regionLabel(region)} · 30 days</div></div>
          <div className="score"><div className="num">{sold30Here}</div><div className="label">Units sold there · 30 days</div></div>
          <div className="score"><div className="num">{pct(sold30Here, sold30All)}%</div><div className="label">Share of your sales</div></div>
          <div className="score"><div className="num">{reservedHere}</div><div className="label">Reserved for its unshipped orders</div></div>
          <div className="score"><div className="num">{waiting.length}{waiting.length > 0 && <small className="warn">need stock</small>}</div><div className="label">Orders there waiting for stock</div></div>
        </div>
      ) : (
        <div className="scoreboard">
          <div className="score"><div className="num">{units}</div><div className="label">Units in stock</div></div>
          <div className="score"><div className="num">{rupeesShort(value)}</div><div className="label">Stock value (at your prices)</div></div>
          <div className="score"><div className="num">{reserved}</div><div className="label">Reserved for unshipped orders</div></div>
          <div className="score"><div className="num">{count('low') + count('out')}{count('out') > 0 && <small className="warn">{count('out')} out</small>}</div><div className="label">Low or out of stock</div></div>
          <div className="score"><div className="num">{count('restock')}</div><div className="label">To restock for {COVER_DAYS} days</div></div>
        </div>
      )}

      {(count('out') > 0 || count('low') > 0) && (
        <div className="alert-strip">
          <span className="alert-strip-label">Needs action</span>
          {count('out') > 0 && (
            <button className={`alert-pill ${tab === 'out' ? 'active' : ''}`} onClick={() => setTab(tab === 'out' ? 'all' : 'out')}
              title="Customers see these as out of stock on the website and cannot order them until you restock.">
              Out of stock · not orderable on the website · {count('out')}
            </button>
          )}
          {count('low') > 0 && (
            <button className={`alert-pill ${tab === 'low' ? 'active' : ''}`} onClick={() => setTab(tab === 'low' ? 'all' : 'low')}
              title={`Fewer than ${LOW_STOCK_LEVEL} units available, or selling out within a week.`}>
              Low stock · {count('low')}
            </button>
          )}
        </div>
      )}

      <div className="page-toolbar">
        <div className="filters">
          {TABS.map(t => (
            <button key={t.key} className={`filter-chip ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label} ({count(t.key)})</button>
          ))}
          <button className="btn-primary btn-small" onClick={onAddProduct} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Add product
          </button>
        </div>
        <div className="stock-filters">
          <RegionDropdown
            id="state-dd"
            label="State"
            value={selectedState}
            onChange={v => setRegion(v === 'all' ? 'all' : `s:${v}`)}
            options={[
              { value: 'all', label: `All states (${orders.length} orders)` },
              // States you already sell to come first, then everywhere else
              ...regionOptions.map((s, i) => ({ value: s.state, label: `${s.state} (${s.total})`, group: i === 0 ? 'Where you sell' : undefined })),
              ...INDIA_STATES.filter(s => !stateCount(s)).map((s, i) => ({ value: s, label: s, group: i === 0 ? 'Other states' : undefined })),
              ...INDIA_UTS.filter(s => !stateCount(s)).map((s, i) => ({ value: s, label: s, group: i === 0 ? 'Union territories' : undefined })),
            ]}
          />
          <RegionDropdown
            id="region-dd"
            value={region}
            onChange={setRegion}
            options={selectedState === 'all' ? [
              { value: 'all', label: `All regions (${orders.length} orders)` },
              ...regionOptions.flatMap(s => [
                { value: `s:${s.state}`, label: `All of ${s.state} (${s.total})`, group: s.state },
                ...s.districts.map(([d, n]) => ({ value: `d:${s.state}|${d}`, label: `${d} (${n})`, indent: true })),
              ]),
            ] : [
              { value: `s:${selectedState}`, label: `All of ${selectedState} (${stateCount(selectedState)})` },
              ...(regionOptions.find(s => s.state === selectedState)?.districts ?? [])
                .map(([d, n]) => ({ value: `d:${selectedState}|${d}`, label: `${d} (${n})`, indent: true })),
            ]}
          />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head stock-head">
          <div>
            <h2>{regional ? `Stock for ${regionLabel(region)}` : 'Stock by product'}</h2>
            {regional && <div className="loc">Stock is shared by all regions. Reserved, sold and needed are for this region only.</div>}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              {regional ? (
                <tr>
                  <th>Product</th><th className="num-col">Price</th><th className="num-col">In stock</th><th className="num-col">Reserved here</th><th className="num-col">Available</th>
                  <th className="num-col">Sold here · 30 days</th><th>Share of sales</th><th>Status</th><th className="num-col">Needed here · {COVER_DAYS} days</th><th></th>
                </tr>
              ) : (
                <tr>
                  <th>Product</th><th className="num-col">Price</th><th className="num-col">In stock</th><th className="num-col">Reserved</th><th className="num-col">Available</th>
                  <th className="num-col">Sold · 30 days</th><th>Lasts</th><th>Status</th><th className="num-col">Suggested restock</th><th></th>
                </tr>
              )}
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 0' }}>No products here.</td></tr>
              )}
              {shown.map(r => (
                <tr key={r.p.id}>
                  <td className="cust">{r.p.name}<div className="loc">{r.p.size}{r.p.is_active ? '' : ' · hidden on website'}</div></td>
                  <td className="num-col">{r.p.price !== null && r.p.price > 0 ? <strong>{rupees(r.p.price)}</strong> : <span className="text-warn" title="No price yet: it cannot be ordered until a price is set (Edit)">Not set</span>}</td>
                  <td className="num-col">{r.stock}</td>
                  {regional ? (
                    <>
                      <td className="num-col">{here(r.p.id).reserved || '—'}</td>
                      <td className="num-col strong">{r.available}</td>
                      <td className="num-col">{here(r.p.id).sold30}<div className="loc">{here(r.p.id).perDay >= 0.1 ? `${here(r.p.id).perDay.toFixed(1)}/day` : 'slow'}</div></td>
                      <td className="stock-cover">
                        {r.sold30 === 0 ? <span className="loc">No sales</span> : (
                          <>
                            <span className="stock-bar"><span style={{ width: `${pct(here(r.p.id).sold30, r.sold30)}%` }} /></span>
                            <span className="loc">{pct(here(r.p.id).sold30, r.sold30)}% of its sales</span>
                          </>
                        )}
                      </td>
                      <td><span className={`chip ${STOCK_CHIP[r.status]}`}>{STOCK_LABEL[r.status]}</span></td>
                      <td className="num-col">{here(r.p.id).needed > 0 ? <strong>{here(r.p.id).needed}</strong> : <span className="loc">—</span>}</td>
                    </>
                  ) : (
                    <>
                      <td className="num-col">{r.reserved || '—'}</td>
                      <td className="num-col strong">{r.available}{r.short > 0 && <div className="loc text-warn">{r.short} short</div>}</td>
                      <td className="num-col">{r.sold30}<div className="loc">{r.perDay >= 0.1 ? `${r.perDay.toFixed(1)}/day` : 'slow'}</div></td>
                      <td className="stock-cover">
                        {r.daysLeft === null ? <span className="loc">Not selling</span> : (
                          <>
                            <span className="stock-bar"><span className={r.daysLeft < 7 ? 'late' : r.daysLeft < 14 ? 'warn' : ''} style={{ width: `${Math.min(100, (r.daysLeft / COVER_DAYS) * 100)}%` }} /></span>
                            <span className={r.daysLeft < 7 ? 'text-warn' : 'loc'}>{r.daysLeft === 0 ? 'Out now' : `${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'}`}</span>
                          </>
                        )}
                      </td>
                      <td><span className={`chip ${STOCK_CHIP[r.status]}`}>{STOCK_LABEL[r.status]}</span></td>
                      <td className="num-col">{r.suggested > 0 ? <strong>{r.suggested}</strong> : <span className="loc">—</span>}</td>
                    </>
                  )}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-secondary btn-small stock-btn" onClick={() => onRestock(r.p, r.suggested)}><PackagePlus size={14} /> Restock</button>
                    <button className="btn-secondary btn-small stock-btn" style={{ marginLeft: 6 }} onClick={() => onEditProduct(r.p)} aria-label={`Edit ${r.p.name}`}><Pencil size={14} /> Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head"><h2>Waiting for stock</h2><span className="panel-meta">{waiting.length} order{waiting.length === 1 ? '' : 's'}</span></div>
          {waiting.length === 0 ? (
            <div className="loc">Every unshipped order can be filled from current stock.</div>
          ) : (
            <ul className="lead-list">
              {waiting.map(({ r, o }) => (
                <li key={`${r.p.id}-${o.order.id}`}>
                  <div>
                    <div className="name">{o.order.order_number} · {o.order.customer_name}</div>
                    <div className="action">{r.p.name} × {o.items.find(i => i.product_name === r.p.name)?.quantity} · placed {shortDate(o.order.created_at)}</div>
                  </div>
                  <span className="chip pending">Waiting</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Stock movements</h2><span className="panel-meta">{regional ? `Shipped to ${regionLabel(region)} · ` : ''}Last 14 days</span></div>
          {moves.length === 0 ? <div className="loc">No stock movements yet.</div> : (
            <ul className="lead-list stock-moves">
              {moves.map(m => (
                <li key={m.key}>
                  <div><div className="name">{productName(m.productId)}</div><div className="action">{m.note} · {shortDateTime(m.at)}</div></div>
                  <span className={`stock-delta ${m.units > 0 ? 'in' : 'out'}`}>{m.units > 0 ? `+${m.units}` : m.units}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel-note">
        Available = in stock minus units in orders not yet shipped. &ldquo;Lasts&rdquo; uses the last 30 days&apos; sales rate.
        Suggested restock brings each product up to {COVER_DAYS} days of sales, plus anything already owed to customers.
        Stock value uses your listed prices ({rupees(value)} in total).
        Regions come from where your orders are delivered (district from the PIN code). Your stock is one shared pool,
        so a region shows its own demand: units reserved and sold there, its share of each product&apos;s sales, and what it needs for {COVER_DAYS} days.
      </div>
    </>
  );
}
