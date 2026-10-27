'use client';

import React, { useMemo, useState } from 'react';
import { Ban, Boxes, FileSpreadsheet, FileText, IndianRupee, PackageCheck, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import type { CatalogProduct } from '../../../data/catalogProducts';
import { TODAY } from '../../../data/today';
import { MONTH, daysBefore, rupees, rupeesShort, shortDate, shortDateTime } from '../../../lib/format';
import { ExportFormat, ExportTable, exportTable } from '../../../lib/export';
import { AppLink } from '../app/nav';
import { useSeller } from '../app/SellerProvider';
import { ORDER_STATUS_LABEL, SellerOrder, counts } from '../sellerData';
import { BarChart, HBars, StackBar } from './charts';
import { Btn, Card, EmptyState, Metric, PageIntro, ProductThumb, SectionHead, Segmented } from './ui';
import DateRangeSelect from '../../DateRangeSelect';

type Period = 'month' | '30d' | '90d' | 'all';
const PERIOD_LABEL: Record<Period, string> = { month: 'This month', '30d': '30 days', '90d': '90 days', all: 'All time' };
const inPeriod = (ts: string, p: Period) => p === 'all' || (p === 'month' ? ts.startsWith(MONTH) : daysBefore(ts) < (p === '30d' ? 30 : 90));
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Buckets for the trend chart: days for a month, weeks (ending on the last day) for longer periods. */
function buckets(period: Period, orders: SellerOrder[]): { key: string; from: string; to: string; label: string }[] {
  const end = new Date(`${TODAY}T00:00:00`);
  if (period === 'month' || period === '30d') {
    const n = period === 'month' ? end.getDate() : 30;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(end); d.setDate(d.getDate() - (n - 1 - i));
      const k = key(d);
      return { key: k, from: k, to: k, label: shortDate(k) };
    });
  }
  const oldest = orders.reduce((m, o) => (o.order.created_at < m ? o.order.created_at : m), TODAY);
  const weeks = period === '90d' ? 13 : Math.min(26, Math.max(4, Math.ceil((daysBefore(oldest) + 1) / 7)));
  return Array.from({ length: weeks }, (_, i) => {
    const to = new Date(end); to.setDate(to.getDate() - 7 * (weeks - 1 - i));
    const from = new Date(to); from.setDate(from.getDate() - 6);
    return { key: key(to), from: key(from), to: key(to), label: shortDate(key(from)) };
  });
}

export default function ReportsScreen() {
  const { seller, myOrders, myProducts, stock, showToast } = useSeller();
  const [period, setPeriod] = useState<Period>('month');
  const [metric, setMetric] = useState<'sales' | 'orders'>('sales');
  const [busy, setBusy] = useState<string | null>(null);

  const inP = useMemo(() => myOrders.filter(o => inPeriod(o.order.created_at, period)), [myOrders, period]);
  const live = inP.filter(counts);
  const sales = live.reduce((s, o) => s + o.gross, 0);
  const net = live.reduce((s, o) => s + o.net, 0);
  const units = live.reduce((s, o) => s + o.units, 0);
  const closed = inP.filter(o => o.order.status === 'cancelled' || o.order.status === 'rejected').length;

  const trend = useMemo(() => buckets(period, myOrders).map(b => {
    const rows = myOrders.filter(o => counts(o) && o.order.created_at.slice(0, 10) >= b.from && o.order.created_at.slice(0, 10) <= b.to);
    const amt = rows.reduce((s, o) => s + o.gross, 0);
    const span = b.from === b.to ? shortDate(b.from) : `${shortDate(b.from)} – ${shortDate(b.to)}`;
    return { key: b.key, label: b.label, value: metric === 'sales' ? amt : rows.length, detail: `${span}: ${rupees(amt)} · ${rows.length} order${rows.length === 1 ? '' : 's'}` };
  }), [period, metric, myOrders]);
  const daily = period === 'month' || period === '30d';

  const status = (s: string[]) => inP.filter(o => s.includes(o.order.status)).length;
  const top = myProducts
    .map(p => {
      const lines = live.flatMap(o => o.items.filter(i => i.product_name === p.name));
      return { p, revenue: lines.reduce((s, i) => s + i.price * i.quantity, 0), units: lines.reduce((s, i) => s + i.quantity, 0) };
    })
    .filter(r => r.units > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const stockUnits = myProducts.reduce((s, p) => s + p.stock_quantity, 0);
  const stockValue = myProducts.reduce((s, p) => s + p.stock_quantity * (p.price ?? 0), 0);

  // The same three downloads as the desktop Reports page; orders follow the period picked here.
  const subtitle = (n: number, what: string) => `${seller.business} · GSTIN ${seller.gstin} · ${n} ${what} · exported ${shortDate(TODAY)}`;
  const settled = myOrders.filter(o => o.payout === 'Paid out' || o.payout === 'Due');
  const sold = (p: CatalogProduct) => myOrders.filter(counts).reduce((s, o) => s + o.items.filter(i => i.product_name === p.name).reduce((n, i) => n + i.quantity, 0), 0);
  const reports: { id: string; name: string; desc: string; count: number; build: () => Omit<ExportTable, 'filename'> }[] = [
    {
      id: 'orders', name: `Orders · ${PERIOD_LABEL[period].toLowerCase()}`, desc: 'Customer, items, amount, payment and status for each order.', count: inP.length,
      build: () => ({
        title: `Orders · ${PERIOD_LABEL[period].toLowerCase()}`,
        subtitle: subtitle(inP.length, 'orders'),
        columns: [
          { header: 'Order', width: 13 }, { header: 'Placed', width: 15 }, { header: 'Customer', width: 20 }, { header: 'City', width: 13 },
          { header: 'Items', width: 34 }, { header: 'Amount', width: 11, money: true }, { header: 'Payment', width: 11 }, { header: 'Status', width: 11 },
        ],
        rows: inP.map(o => [
          o.order.order_number, shortDateTime(o.order.created_at), o.order.customer_name, o.order.city,
          o.items.map(i => `${i.product_name} x ${i.quantity}`).join(', '), o.gross, `${o.order.payment_method} (${o.order.payment_status})`, ORDER_STATUS_LABEL[o.order.status],
        ]),
      }),
    },
    {
      id: 'payouts', name: 'Payout statement', desc: 'Delivered orders: sale, Manikstu commission and what you receive.', count: settled.length,
      build: () => ({
        title: 'Payout statement',
        subtitle: subtitle(settled.length, 'delivered orders') + ` · commission ${seller.commissionPct}%`,
        columns: [
          { header: 'Order', width: 13 }, { header: 'Delivered', width: 11 }, { header: 'Customer', width: 20 },
          { header: 'Sale', width: 11, money: true }, { header: 'Commission', width: 12, money: true }, { header: 'You get', width: 11, money: true }, { header: 'Payout', width: 10 },
        ],
        rows: settled.map(o => [o.order.order_number, o.deliveredAt ? shortDate(o.deliveredAt) : '', o.order.customer_name, o.gross, o.commission, o.net, o.payout]),
      }),
    },
    {
      id: 'stock', name: 'Products & stock', desc: 'Price, stock, listing status and units sold for each product.', count: myProducts.length,
      build: () => ({
        title: 'Products & stock',
        subtitle: subtitle(myProducts.length, 'products'),
        columns: [
          { header: 'Product', width: 26 }, { header: 'Size', width: 10 }, { header: 'Category', width: 11 }, { header: 'Price', width: 10, money: true },
          { header: 'Stock', width: 8 }, { header: 'Listing', width: 9 }, { header: 'Units sold', width: 11 },
        ],
        rows: myProducts.map(p => [p.name, p.size, p.category, p.price, p.stock_quantity, p.is_active ? 'Active' : 'Hidden', sold(p)]),
      }),
    },
  ];
  const run = async (r: typeof reports[number], format: ExportFormat) => {
    if (r.count === 0) { showToast(`Nothing to download in ${r.name}`, 'info'); return; }
    setBusy(`${r.id}-${format}`);
    try {
      await exportTable(format, { filename: `${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${TODAY}`, ...r.build() });
      showToast(`${r.name} downloaded (${format === 'excel' ? 'Excel' : 'PDF'})`);
    } catch {
      showToast('Download failed. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sx-stack">
      <PageIntro>How your sales are going, and files to download.</PageIntro>
      <Segmented<Period> label="Period" value={period} onChange={setPeriod} className="date-chips" options={(Object.keys(PERIOD_LABEL) as Period[]).map(k => ({ key: k, label: PERIOD_LABEL[k] }))} />
      {/* Phones: the same periods in one dropdown */}
      <DateRangeSelect<Period> phoneOnly label="Period" value={period} onChange={setPeriod}
        options={(Object.keys(PERIOD_LABEL) as Period[]).map(k => ({ value: k, label: PERIOD_LABEL[k] }))} />

      <div className="sx-metrics sx-metrics-3">
        <Metric icon={IndianRupee} value={rupeesShort(sales)} label="Sales" sub="before commission" />
        <Metric icon={Wallet} value={rupeesShort(net)} label="You get" sub={`after ${seller.commissionPct}%`} />
        <Metric icon={ShoppingCart} value={live.length} label="Orders" />
        <Metric icon={PackageCheck} value={units} label="Units sold" />
        <Metric icon={Receipt} value={live.length ? rupees(Math.round(sales / live.length)) : '—'} label="Avg order" />
        <Metric icon={Ban} value={closed} label="Rejected / cancelled" tone={closed ? 'warn' : undefined} />
      </div>

      <Card aria-labelledby="sx-r-trend">
        <SectionHead id="sx-r-trend" title={metric === 'sales' ? 'Sales trend' : 'Order trend'} meta={daily ? 'By day' : 'By week'}
          action={<Segmented<'sales' | 'orders'> label="Chart shows" value={metric} onChange={setMetric} options={[{ key: 'sales', label: '₹' }, { key: 'orders', label: 'Orders' }]} />} />
        <BarChart
          ariaLabel={`${metric === 'sales' ? 'Sales' : 'Orders'} ${daily ? 'per day' : 'per week'}, ${PERIOD_LABEL[period].toLowerCase()}`}
          highlightKey={daily ? TODAY : undefined}
          labelEvery={daily ? 5 : 3}
          formatMax={metric === 'sales' ? rupeesShort : n => String(n)}
          points={trend}
        />
      </Card>

      <Card aria-labelledby="sx-r-status">
        <SectionHead id="sx-r-status" title="Orders by status" meta={`${inP.length} order${inP.length === 1 ? '' : 's'}`} />
        <StackBar ariaLabel="Orders by status" parts={[
          { key: 'new', label: 'New', value: status(['pending']), tone: 'coral' },
          { key: 'conf', label: 'Confirmed / packed', value: status(['confirmed', 'ready_for_dispatch']), tone: 'sage' },
          { key: 'ship', label: 'On the way', value: status(['shipped']), tone: 'amber' },
          { key: 'del', label: 'Delivered', value: status(['delivered']), tone: 'forest' },
          { key: 'closed', label: 'Rejected / cancelled', value: closed, tone: 'muted' },
        ]} />
      </Card>

      <Card aria-labelledby="sx-r-top">
        <SectionHead id="sx-r-top" title="Top products" meta={PERIOD_LABEL[period]} />
        {top.length === 0 ? <EmptyState icon={ShoppingCart} title="No sales in this period" /> : (
          <HBars ariaLabel="Top products by sales" rows={top.map(r => ({ key: String(r.p.id), label: r.p.name, value: r.revenue, display: rupees(r.revenue), sub: `${r.units} unit${r.units === 1 ? '' : 's'}`, lead: <ProductThumb product={r.p} name={r.p.name} size={36} /> }))} />
        )}
      </Card>

      <Card aria-labelledby="sx-r-stock">
        <SectionHead id="sx-r-stock" title="Stock summary" meta="Right now" action={<AppLink href="/seller/stock" className="sx-link">Stock</AppLink>} />
        <StackBar ariaLabel="Active products by stock level" parts={[
          { key: 'in', label: 'In stock', value: stock.filter(s => s.status === 'in').length, tone: 'forest' },
          { key: 'low', label: 'Low', value: stock.filter(s => s.status === 'low').length, tone: 'amber' },
          { key: 'out', label: 'Out of stock', value: stock.filter(s => s.status === 'out').length, tone: 'coral' },
        ]} />
        <dl className="sx-kvs">
          <div className="sx-kv"><dt>Units on the shelf</dt><dd>{stockUnits.toLocaleString('en-IN')}</dd></div>
          <div className="sx-kv"><dt>Stock value at your prices</dt><dd>{rupees(stockValue)}</dd></div>
        </dl>
      </Card>

      <section aria-labelledby="sx-r-dl">
        <h2 id="sx-r-dl" className="sx-h2">Downloads</h2>
        <div className="sx-cards">
          {reports.map(r => (
            <Card key={r.id} className="sx-report">
              <div className="sx-report-head">
                <span className="sx-report-icon" aria-hidden>{r.id === 'stock' ? <Boxes size={20} /> : r.id === 'payouts' ? <Wallet size={20} /> : <ShoppingCart size={20} />}</span>
                <div><h3>{r.name}</h3><p>{r.desc}</p><span className="sx-muted">{r.count} row{r.count === 1 ? '' : 's'}</span></div>
              </div>
              <div className="sx-order-actions">
                <Btn variant="secondary" icon={FileSpreadsheet} busy={busy === `${r.id}-excel`} disabled={!!busy && busy !== `${r.id}-excel`} onClick={() => void run(r, 'excel')}>Excel</Btn>
                <Btn variant="secondary" icon={FileText} busy={busy === `${r.id}-pdf`} disabled={!!busy && busy !== `${r.id}-pdf`} onClick={() => void run(r, 'pdf')}>PDF</Btn>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
