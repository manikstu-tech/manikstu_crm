'use client';

import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, IndianRupee, MapPinned, PackageCheck, Receipt, ShoppingCart, Users, Wallet } from 'lucide-react';
import type { OrderStatus } from '../../../data/managerDashboard';
import { TODAY } from '../../../data/today';
import { MONTH, daysBefore, pct, rupees, rupeesShort, shortDate } from '../../../lib/format';
import { ExportFormat, exportTable } from '../../../lib/export';
import { INDIA_STATES, INDIA_UTS, districtFor, stateFor } from '../../../lib/regions';
import { AppLink } from '../app/nav';
import { useSeller } from '../app/SellerProvider';
import { ORDER_STATUS_LABEL, SellerOrder, counts } from '../sellerData';
import { HBars } from './charts';
import { Btn, Card, Chip, EmptyState, Metric, ORDER_TONE, PageIntro, SectionHead, Segmented, useShowMore } from './ui';
import DateRangeSelect from '../../DateRangeSelect';

type Period = 'month' | '30d' | '90d' | 'all';
const PERIOD_LABEL: Record<Period, string> = { month: 'This month', '30d': '30 days', '90d': '90 days', all: 'All time' };
const inPeriod = (ts: string, p: Period) => p === 'all' || (p === 'month' ? ts.startsWith(MONTH) : daysBefore(ts) < (p === '30d' ? 30 : 90));
const STATUSES: OrderStatus[] = ['pending', 'confirmed', 'ready_for_dispatch', 'shipped', 'delivered', 'rejected', 'cancelled'];
const village = (o: SellerOrder) => { const a = o.order.address ?? ''; return a.split(',').slice(1).join(',').trim() || a; };
const itemsText = (o: SellerOrder) => o.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ');

export default function RegionalScreen() {
  const { seller, myOrders, showToast } = useSeller();
  const located = useMemo(
    () => myOrders.map(o => ({ o, state: stateFor(o.order.state, o.order.pincode), district: districtFor(o.order.state, o.order.pincode, o.order.city) })),
    [myOrders],
  );
  const stateCounts = useMemo(() => located.reduce((m, x) => m.set(x.state, (m.get(x.state) ?? 0) + 1), new Map<string, number>()), [located]);
  const topState = Array.from(stateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Odisha';

  const [state, setState] = useState(topState);
  const [district, setDistrict] = useState('all');
  const [period, setPeriod] = useState<Period>('all');
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [view, setView] = useState<'orders' | 'customers'>('orders');
  const [busy, setBusy] = useState<string | null>(null);

  const base = located.filter(x => x.state === state && inPeriod(x.o.order.created_at, period) && (status === 'all' || x.o.order.status === status));
  const rows = base.filter(x => district === 'all' || x.district === district).map(x => x.o);
  const live = rows.filter(counts);
  const sales = live.reduce((a, o) => a + o.gross, 0);
  const net = live.reduce((a, o) => a + o.net, 0);
  const customers = new Set(rows.map(o => o.order.phone)).size;
  const delivered = live.filter(o => o.order.status === 'delivered').length;

  const byDistrict = Array.from(base.filter(x => counts(x.o)).reduce((m, x) => {
    const cur = m.get(x.district) ?? { amt: 0, n: 0 };
    return m.set(x.district, { amt: cur.amt + x.o.gross, n: cur.n + 1 });
  }, new Map<string, { amt: number; n: number }>())).sort((a, b) => b[1].amt - a[1].amt);

  const byProduct = Array.from(live.reduce((m, o) => {
    o.items.forEach(i => m.set(i.product_name, (m.get(i.product_name) ?? 0) + i.price * i.quantity));
    return m;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);
  const productTotal = byProduct.reduce((s, [, v]) => s + v, 0);

  const customerRows = useMemo(() => {
    const m = new Map<string, { key: string; name: string; place: string; orders: number; spent: number; last: string; products: Map<string, number> }>();
    rows.forEach(o => {
      const key = o.order.phone || o.order.customer_name;
      const c = m.get(key) ?? { key, name: o.order.customer_name, place: `${village(o)}, ${o.order.city} ${o.order.pincode}`, orders: 0, spent: 0, last: o.order.created_at, products: new Map() };
      c.orders++;
      if (counts(o)) c.spent += o.gross;
      if (o.order.created_at > c.last) c.last = o.order.created_at;
      o.items.forEach(i => c.products.set(i.product_name, (c.products.get(i.product_name) ?? 0) + i.quantity));
      m.set(key, c);
    });
    return Array.from(m.values()).map(c => ({ ...c, top: Array.from(c.products).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—' })).sort((a, b) => b.spent - a.spent);
  }, [rows]);

  const orderList = useShowMore(rows, 15, `${state}|${district}|${period}|${status}`);
  const custList = useShowMore(customerRows, 15, `${state}|${district}|${period}|${status}`);

  const areaLabel = district === 'all' ? state : `${state} › ${district}`;
  const fileArea = (district === 'all' ? state : district).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const summary = `${rows.length} orders · sales ${rupees(sales)} · you get ${rupees(net)} · ${customers} customers`;

  const download = async (what: 'orders' | 'customers', format: ExportFormat) => {
    const list = what === 'orders' ? rows : customerRows;
    if (list.length === 0) { showToast(`No ${what} in this area to download`, 'info'); return; }
    setBusy(`${what}-${format}`);
    try {
      if (what === 'orders') {
        await exportTable(format, {
          filename: `regional-orders-${fileArea}-${TODAY}`,
          title: `Orders · ${areaLabel}`,
          subtitle: `${seller.business} · ${PERIOD_LABEL[period]} · ${summary} · exported ${shortDate(TODAY)}`,
          columns: [
            { header: 'Order', width: 12 }, { header: 'Date', width: 10 }, { header: 'Customer', width: 18 }, { header: 'Village / address', width: 20 },
            { header: 'Town', width: 12 }, { header: 'District', width: 12 }, { header: 'PIN', width: 8 }, { header: 'My items', width: 28 },
            { header: 'Sale', width: 10, money: true }, { header: 'You get', width: 10, money: true }, { header: 'Status', width: 10 },
          ],
          rows: rows.map(o => [
            o.order.order_number, shortDate(o.order.created_at), o.order.customer_name, o.order.address, o.order.city,
            districtFor(o.order.state, o.order.pincode, o.order.city), o.order.pincode, itemsText(o), o.gross, o.net, ORDER_STATUS_LABEL[o.order.status],
          ]),
        });
      } else {
        await exportTable(format, {
          filename: `regional-customers-${fileArea}-${TODAY}`,
          title: `Customers · ${areaLabel}`,
          subtitle: `${seller.business} · ${PERIOD_LABEL[period]} · ${summary} · exported ${shortDate(TODAY)}`,
          columns: [
            { header: 'Customer', width: 20 }, { header: 'Village, town, PIN', width: 30 }, { header: 'Orders', width: 8 },
            { header: 'Bought from you', width: 14, money: true }, { header: 'Last order', width: 11 }, { header: 'Top product', width: 24 },
          ],
          rows: customerRows.map(c => [c.name, c.place, c.orders, c.spent, shortDate(c.last), c.top]),
        });
      }
      showToast(`${what === 'orders' ? 'Orders' : 'Customers'} for ${district === 'all' ? state : district} downloaded`);
    } catch {
      showToast('Download failed. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const districtOptions = Array.from(base.reduce((m, x) => m.set(x.district, (m.get(x.district) ?? 0) + 1), new Map<string, number>())).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="sx-stack">
      <PageIntro>Where your products sell: sales by state, district and town.</PageIntro>
      <div className="sx-field-row">
        <div className="sx-field">
          <label htmlFor="sx-rg-state">State</label>
          <select id="sx-rg-state" value={state} onChange={e => { setState(e.target.value); setDistrict('all'); }}>
            <optgroup label="States">{INDIA_STATES.map(s => <option key={s} value={s}>{s}{stateCounts.get(s) ? ` (${stateCounts.get(s)})` : ''}</option>)}</optgroup>
            <optgroup label="Union territories">{INDIA_UTS.map(s => <option key={s} value={s}>{s}{stateCounts.get(s) ? ` (${stateCounts.get(s)})` : ''}</option>)}</optgroup>
            {stateCounts.get('Unknown') ? <option value="Unknown">Unknown state ({stateCounts.get('Unknown')})</option> : null}
          </select>
        </div>
        <div className="sx-field">
          <label htmlFor="sx-rg-district">{state === 'Odisha' ? 'District' : 'District / town'}</label>
          <select id="sx-rg-district" value={district} onChange={e => setDistrict(e.target.value)}>
            <option value="all">All ({base.length})</option>
            {districtOptions.map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
          </select>
        </div>
      </div>
      <Segmented<Period> label="Period" value={period} onChange={setPeriod} className="date-chips"
        options={(Object.keys(PERIOD_LABEL) as Period[]).map(k => ({ key: k, label: PERIOD_LABEL[k] }))} />
      {/* Phones: the same periods in one dropdown */}
      <DateRangeSelect<Period> phoneOnly label="Period" value={period} onChange={setPeriod}
        options={(Object.keys(PERIOD_LABEL) as Period[]).map(k => ({ value: k, label: PERIOD_LABEL[k] }))} />
      <div className="sx-field">
        <label htmlFor="sx-rg-status">Order status</label>
        <select id="sx-rg-status" value={status} onChange={e => setStatus(e.target.value as OrderStatus | 'all')}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="sx-metrics sx-metrics-3">
        <Metric icon={IndianRupee} value={rupeesShort(sales)} label="Sales" />
        <Metric icon={ShoppingCart} value={rows.length} label="Orders" />
        <Metric icon={Wallet} value={rupeesShort(net)} label="You get" sub={`after ${seller.commissionPct}%`} />
        <Metric icon={Users} value={customers} label="Customers" />
        <Metric icon={Receipt} value={live.length ? rupees(Math.round(sales / live.length)) : '—'} label="Avg order" />
        <Metric icon={PackageCheck} value={live.length ? `${pct(delivered, live.length)}%` : '—'} label="Delivered" />
      </div>

      <Card aria-labelledby="sx-rg-dist">
        <SectionHead id="sx-rg-dist" title="Sales by district" meta={`${state} · tap to filter`} />
        {byDistrict.length === 0 ? (
          <EmptyState icon={MapPinned} title={`No sales from ${state}`}>{period === 'all' ? 'Orders delivered here will show up.' : `Nothing in ${PERIOD_LABEL[period].toLowerCase()}.`}</EmptyState>
        ) : (
          <HBars
            ariaLabel={`Sales by district in ${state}`}
            selectedKey={district}
            onSelect={k => setDistrict(district === k ? 'all' : k)}
            rows={byDistrict.map(([d, v]) => ({ key: d, label: d, value: v.amt, display: rupees(v.amt), sub: `${v.n} order${v.n === 1 ? '' : 's'}` }))}
          />
        )}
      </Card>

      <Card aria-labelledby="sx-rg-prod">
        <SectionHead id="sx-rg-prod" title="My products here" meta={district === 'all' ? state : district} />
        {byProduct.length === 0 ? <EmptyState icon={ShoppingCart} title="No sales in this area" /> : (
          <HBars ariaLabel="Sales by product in this area"
            rows={byProduct.slice(0, 8).map(([p, v]) => ({ key: p, label: p, value: v, display: rupees(v), sub: `${pct(v, productTotal)}% of sales here` }))} />
        )}
      </Card>

      <Card aria-labelledby="sx-rg-list">
        <SectionHead id="sx-rg-list" title={areaLabel} meta={PERIOD_LABEL[period]} />
        <Segmented<'orders' | 'customers'> label="List" value={view} onChange={setView} className="sx-seg-split"
          options={[{ key: 'orders', label: 'Orders', count: rows.length }, { key: 'customers', label: 'By customer', count: customerRows.length }]} />
        {view === 'orders' ? (
          rows.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders for these filters" /> : (
            <ul className="sx-plain-list">
              {orderList.shown.map(o => (
                <li key={o.order.id}>
                  <AppLink href={`/seller/orders/${o.order.id}`} className="sx-plain-link">
                    <span className="sx-plain-top"><strong>{o.order.order_number}</strong><Chip tone={ORDER_TONE[o.order.status]}>{ORDER_STATUS_LABEL[o.order.status]}</Chip></span>
                    <span>{o.order.customer_name} · {village(o)}, {o.order.city} {o.order.pincode}</span>
                    <span>{itemsText(o)} · <b>{rupees(o.gross)}</b> · you get {rupees(o.net)}</span>
                  </AppLink>
                </li>
              ))}
            </ul>
          )
        ) : (
          customerRows.length === 0 ? <EmptyState icon={Users} title="No customers for these filters" /> : (
            <ul className="sx-plain-list">
              {custList.shown.map(c => (
                <li key={c.key}>
                  <span className="sx-plain-top"><strong>{c.name}</strong><b>{rupees(c.spent)}</b></span>
                  <span>{c.place}</span>
                  <span>{c.orders} order{c.orders === 1 ? '' : 's'} · last {shortDate(c.last)} · mostly {c.top}</span>
                </li>
              ))}
            </ul>
          )
        )}
        {view === 'orders' ? orderList.more : custList.more}
        <div className="sx-downloads">
          <span className="sx-downloads-label">Download {view === 'orders' ? 'orders' : 'customers'}</span>
          <Btn size="sm" variant="secondary" icon={FileSpreadsheet} busy={busy === `${view}-excel`} onClick={() => void download(view, 'excel')}>Excel</Btn>
          <Btn size="sm" variant="secondary" icon={FileText} busy={busy === `${view}-pdf`} onClick={() => void download(view, 'pdf')}>PDF</Btn>
        </div>
      </Card>

      <p className="sx-foot-note">
        Orders don&apos;t store a district yet: for Odisha it&apos;s worked out from the PIN code (or town); for other states the town is shown.
        Cancelled and refunded orders are listed but not counted in sales.
      </p>
    </div>
  );
}
