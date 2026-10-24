import React, { useEffect, useState } from 'react';
import { TELECALLERS, TODAY, VERTICALS, type TrackerSale } from '../../data/managerDashboard';
import { registerSaleProducts } from '../../lib/liveMode';
import { MONTH, rupees, rupeesShort, shortDate } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import HBarList from '../HBarList';
import ExportMenu from '../ExportMenu';
import { EmptyRow } from './shared';
import SaleDetails from './SaleDetails';
import { TeamData, callerName, productName, productOf, salesByMonth } from './tcData';

type Range = 'today' | 'week' | 'month' | 'year';
const RANGES: Range[] = ['today', 'week', 'month', 'year'];
const RANGE_LABEL: Record<Range, string> = { today: 'Today', week: 'This week', month: 'This month', year: 'This year' };
const PAGE_SIZE = 20;

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The Monday of the week TODAY falls in (weeks run Monday to Sunday). */
const WEEK_START = (() => {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
})();
const YEAR = TODAY.slice(0, 4);

/** Whether a sale's date (YYYY-MM-DD) falls in the chosen period, counted up to today. */
export const inSalesRange = (day: string, range: Range) =>
  day <= TODAY && (range === 'today' ? day === TODAY : range === 'week' ? day >= WEEK_START : range === 'month' ? day.startsWith(MONTH) : day.startsWith(YEAR));

const SALES_REFRESH_MS = 20000;

export default function TeamSales({ data, onToast }: { data: TeamData; onToast: (m: string) => void }) {
  const [range, setRange] = useState<Range>('month');
  const [caller, setCaller] = useState<number | 'all'>('all');
  const [verticalId, setVerticalId] = useState<number | 'all'>('all');
  const [page, setPage] = useState(0);
  const [details, setDetails] = useState<TrackerSale | null>(null);

  // With the CRM backend the sales are re-read from it, so a sale recorded while this page is open appears without a
  // reload. Without a backend (offline demo) this stays null and the page uses the sample sales it was given.
  const [fetched, setFetched] = useState<TrackerSale[] | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const res = await fetch('/api/tracker/sales', { cache: 'no-store' });
        if (res.status === 400) { if (timer) clearInterval(timer); return; } // no backend
        if (!res.ok) return;
        const body = await res.json();
        if (!stop && Array.isArray(body.data)) {
          registerSaleProducts(body.data as TrackerSale[]); // before rendering, so a just-added product reads by name
          setFetched(body.data as TrackerSale[]);
        }
      } catch { /* try again next tick */ }
    };
    load();
    timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, SALES_REFRESH_MS);
    return () => { stop = true; if (timer) clearInterval(timer); };
  }, []);
  const allSales = fetched ?? data.sales;

  const inRange = (d: string) => inSalesRange(d, range);
  const scoped = allSales.filter(s =>
    (caller === 'all' || s.caller_id === caller) && (verticalId === 'all' || productOf(s.product_id)?.vertical_id === verticalId));
  const rows = scoped.filter(s => inRange(s.sold_at)).sort((a, b) => b.sold_at.localeCompare(a.sold_at) || b.id - a.id);
  const revenue = rows.reduce((a, s) => a + s.amount, 0);

  const group = <K,>(key: (s: typeof rows[number]) => K) =>
    Array.from(rows.reduce((m, s) => m.set(key(s), (m.get(key(s)) ?? 0) + s.amount), new Map<K, number>())).sort((a, b) => b[1] - a[1]);
  const byCaller = group(s => s.caller_id);
  const byProduct = group(s => s.product_id).slice(0, 6);
  const months = salesByMonth(scoped);
  const maxMonth = Math.max(1, ...months.map(m => m.amount));

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const runExport = async (format: ExportFormat) => {
    if (rows.length === 0) { onToast('No sales to export'); return; }
    try {
      await exportTable(format, {
        filename: `team-sales-${TODAY}`,
        title: 'Telecalling sales',
        subtitle: `${rows.length} sales · Rs. ${Math.round(revenue).toLocaleString('en-IN')} · ${RANGE_LABEL[range]}${caller === 'all' ? '' : ` · ${callerName(caller)}`} · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Date', width: 10 }, { header: 'Telecaller', width: 16 }, { header: 'Customer', width: 18 },
          { header: 'Product', width: 24 }, { header: 'Qty', width: 6 }, { header: 'Amount', width: 11, money: true },
        ],
        rows: rows.map(s => [shortDate(s.sold_at), callerName(s.caller_id), s.customer_name, productName(s.product_id), s.quantity, s.amount]),
      });
      onToast(`Sales exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  return (
    <>
      <div className="page-toolbar">
        <div className="filters" />
        <div className="toolbar-actions">
          <select className="filter-select" value={caller} onChange={e => { setCaller(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(0); }} aria-label="Telecaller">
            <option value="all">All telecallers</option>
            {TELECALLERS.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? '' : ' (inactive)'}</option>)}
          </select>
          <select className="filter-select" value={verticalId} onChange={e => { setVerticalId(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(0); }} aria-label="Product">
            <option value="all">All products</option>
            {VERTICALS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <ExportMenu onExport={runExport} />
        </div>
      </div>

      <div className="scoreboard">
        <div className="score"><div className="num">{rupeesShort(revenue)}</div><div className="label">Revenue · {RANGE_LABEL[range].toLowerCase()}</div></div>
        <div className="score"><div className="num">{rows.length}</div><div className="label">Sales</div></div>
        <div className="score"><div className="num">{rows.length ? rupees(revenue / rows.length) : '—'}</div><div className="label">Average sale</div></div>
        <div className="score"><div className="num best-seller">{byCaller[0] ? callerName(byCaller[0][0]) : '—'}</div><div className="label">Top telecaller</div></div>
        <div className="score"><div className="num best-seller">{byProduct[0] ? productName(byProduct[0][0]) : '—'}</div><div className="label">Top product</div></div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head"><h2>Sales by month</h2><span className="panel-meta">Last 6 months</span></div>
          <div className="bar-chart">
            {months.map((m, i) => (
              <div key={m.key} className="bc-col" data-tip={`${m.label}: ${rupees(m.amount)} · ${m.count} sales${i === 5 ? ' (month to date)' : ''}`}>
                <div className={`bc-bar ${i === 5 ? 'now' : ''}`} style={{ height: `${(m.amount / maxMonth) * 100}%` }} />
                <div className="bc-label">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>By telecaller</h2><span className="panel-meta">{RANGE_LABEL[range]}</span></div>
          {byCaller.length === 0 ? <div className="loc">No sales in this range.</div> : (
            <HBarList rows={byCaller.map(([id, amt]) => ({ key: String(id), label: callerName(id), value: amt, display: rupeesShort(amt), tip: `${callerName(id)}: ${rupees(amt)}` }))} />
          )}
        </div>
      </div>

      {/* A single full-width panel: it spans the page, so it grows and shrinks with the screen. The .grid wrapper keeps the
          same 20px gap below it that the other rows have. */}
      <div className="grid">
        <div className="panel">
          <div className="panel-head"><h2>By product</h2><span className="panel-meta">{RANGE_LABEL[range]}</span></div>
          {byProduct.length === 0 ? <div className="loc">No sales in this range.</div> : (
            <HBarList wide rows={byProduct.map(([id, amt]) => ({ key: String(id), label: productName(id), value: amt, display: rupeesShort(amt), tip: `${productName(id)}: ${rupees(amt)}` }))} />
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h2>Sales</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginLeft: 'auto' }}>
            <span className="panel-meta">{rows.length} {rows.length === 1 ? 'sale' : 'sales'} · {rupees(revenue)}</span>
            {/* One period for the whole page: the figures, the charts and this table all follow it */}
            <div className="filters" role="group" aria-label="Sales period">
              {RANGES.map(r => (
                <button key={r} className={`filter-chip ${range === r ? 'active' : ''}`} onClick={() => { setRange(r); setPage(0); }}>{RANGE_LABEL[r]}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Telecaller</th><th>Customer</th><th>Product</th><th className="num-col">Amount</th><th aria-label="Details" /></tr></thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={6} text="No sales in this range." />}
              {rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map(s => (
                <tr key={s.id}>
                  <td>{shortDate(s.sold_at)}</td>
                  <td>{callerName(s.caller_id)}</td>
                  <td className="cust">{s.customer_name}</td>
                  <td>{productName(s.product_id)} × {s.quantity}</td>
                  <td className="num-col strong">{rupees(s.amount)}</td>
                  <td className="sd-action">
                    <button type="button" className="btn-secondary btn-small" onClick={() => setDetails(s)}
                      aria-label={`View details of the sale to ${s.customer_name}`}>View details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{rows.length === 0 ? '0 sales' : `${safePage * PAGE_SIZE + 1}–${Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of ${rows.length}`}</span>
          <div className="pager-btns">
            <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button className="btn-secondary btn-small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </div>
      </div>

      <SaleDetails sale={details} onClose={() => setDetails(null)} />
    </>
  );
}
