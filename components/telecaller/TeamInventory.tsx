import React, { useMemo, useState } from 'react';
import { BookOpen, Copy, FileText, X } from 'lucide-react';
import { SalesOrder, TELECALLERS, TODAY } from '../../data/managerDashboard';
import { Complaint } from '../../data/complaints';
import { nowStamp, rupees, rupeesShort, shortDate } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import CatalogueModal from '../views/CatalogueModal';
import { CATALOG_PRODUCTS } from '../../data/catalogProducts';
import { downloadProductSheet } from '../../lib/catalogPdf';
import HBarList from '../HBarList';
import { EmptyRow } from './shared';
import { STATUS_LABEL } from './complaintsUtil';
import { STAGE_LABEL, trackingFor } from './orderTracking';
import { STOCK_CHIP, STOCK_LABEL, StockRow, StockStatus, isSlow, runsOutSoon, stockRows } from './inventoryUtil';
import CardTable from '../CardTable';

type Sort = 'urgent' | 'name' | 'available' | 'sold' | 'value';

/** "Needs action" shortcuts. */
const ATTENTION: { key: string; label: string; test: (r: StockRow) => boolean }[] = [
  { key: 'waiting', label: 'Customers waiting for stock', test: r => r.waiting.length > 0 },
  { key: 'out', label: 'Out of stock', test: r => r.status === 'out' && r.p.is_active },
  { key: 'soon', label: 'Runs out within 7 days', test: runsOutSoon },
  { key: 'slow', label: 'Plenty of stock, selling slowly', test: isSlow },
  { key: 'complaints', label: '3+ complaints', test: r => r.complaints.length >= 3 },
];

const daysText = (r: StockRow) => (r.available === 0 ? '—' : r.daysLeft === null ? 'not selling' : r.daysLeft > 90 ? '90+ days' : `${r.daysLeft} days`);

interface Props {
  orders: SalesOrder[];
  complaints: Complaint[];
  searchQuery: string;
  onToast: (message: string) => void;
}

/** Stock: what the team can sell today, what's running out and who's waiting. Read-only for the head. */
export default function TeamInventory({ orders, complaints, searchQuery, onToast }: Props) {
  const hour = nowStamp().slice(0, 13);
  const rows = useMemo(() => {
    const now = nowStamp();
    return stockRows(orders.map(o => ({ o, t: trackingFor(o, now) })), complaints);
  }, [orders, complaints, hour]);

  const [status, setStatus] = useState<StockStatus | 'all'>('all');
  const [category, setCategory] = useState<string>('all');
  const [attention, setAttention] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('urgent');
  const [openId, setOpenId] = useState<number | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const q = searchQuery.trim().toLowerCase();
  const attn = ATTENTION.find(a => a.key === attention);
  const shown = rows
    .filter(r =>
      (attn ? attn.test(r) : status === 'all' || r.status === status) &&
      (category === 'all' || r.p.category === category) &&
      (!q || [r.p.name, r.p.sku ?? '', r.p.size].some(v => v.toLowerCase().includes(q))),
    )
    .sort((a, b) => {
      switch (sort) {
        case 'name': return a.p.name.localeCompare(b.p.name);
        case 'available': return a.available - b.available;
        case 'sold': return b.sold30 - a.sold30;
        case 'value': return b.value - a.value;
        default: {
          const rank = { out: 0, low: 1, in: 2 };
          return b.waiting.length - a.waiting.length || rank[a.status] - rank[b.status] || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
        }
      }
    });

  // Tiles
  const count = (s: StockStatus) => rows.filter(r => r.status === s).length;
  const units = rows.reduce((a, r) => a + r.stock, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  const reserved = rows.reduce((a, r) => a + r.reserved, 0);
  const available = rows.reduce((a, r) => a + r.available, 0);
  const waitingOrders = new Set(rows.flatMap(r => r.waiting.map(o => o.id))).size;

  const push = rows.filter(isSlow).sort((a, b) => b.available - a.available);
  const careful = rows.filter(r => r.p.is_active && r.p.price !== null && (r.status === 'out' || runsOutSoon(r)));

  const copyList = async (title: string, list: StockRow[], line: (r: StockRow) => string) => {
    try {
      await navigator.clipboard.writeText(`${title} (${shortDate(TODAY)})\n${list.map(r => `• ${line(r)}`).join('\n')}`);
      onToast('List copied: paste it into the team WhatsApp group');
    } catch {
      onToast('Could not copy. Please try again.');
    }
  };

  const runExport = async (format: ExportFormat) => {
    if (shown.length === 0) { onToast('No products to export'); return; }
    try {
      await exportTable(format, {
        filename: `stock-${TODAY}`,
        title: `Stock · ${attn ? attn.label : status === 'all' ? 'All products' : STOCK_LABEL[status]}`,
        subtitle: `${shown.length} products · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Product', width: 24 }, { header: 'Size', width: 9 }, { header: 'Category', width: 11 }, { header: 'Price', width: 9, money: true },
          { header: 'In stock', width: 9 }, { header: 'Reserved', width: 9 }, { header: 'Available', width: 10 }, { header: 'Sold 7d', width: 8 },
          { header: 'Sold 30d', width: 9 }, { header: 'Days left', width: 10 }, { header: 'Status', width: 12 }, { header: 'Orders waiting', width: 10 },
          { header: 'Stock value', width: 12, money: true },
        ],
        rows: shown.map(r => [
          r.p.name, r.p.size, r.p.category, r.p.price, r.stock, r.reserved, r.available, r.sold7, r.sold30, daysText(r),
          STOCK_LABEL[r.status], r.waiting.length, r.value,
        ]),
      });
      onToast(`Stock exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  const opened = rows.find(r => r.p.id === openId);

  return (
    <>
      <div className="scoreboard">
        <div className="score"><div className="num">{rows.length}</div><div className="label">Products · {count('in')} in stock</div></div>
        <button className="score score-btn" onClick={() => { setStatus('low'); setAttention(null); }}><div className="num">{count('low')}</div><div className="label">Low stock</div></button>
        <button className="score score-btn" onClick={() => { setStatus('out'); setAttention(null); }}><div className={`num ${count('out') ? 'text-warn' : ''}`}>{count('out')}</div><div className="label">Out of stock</div></button>
        <div className="score"><div className="num">{units.toLocaleString('en-IN')}</div><div className="label">Units · worth {rupeesShort(value)}</div></div>
        <div className="score"><div className="num">{reserved}</div><div className="label">Reserved for orders</div></div>
        <div className="score"><div className="num">{available.toLocaleString('en-IN')}</div><div className="label">Available to sell</div></div>
        <button className="score score-btn" onClick={() => setAttention('waiting')}><div className={`num ${waitingOrders ? 'text-warn' : ''}`}>{waitingOrders}</div><div className="label">Orders waiting for stock</div></button>
      </div>

      <div className="alert-strip">
        <span className="alert-strip-label">Needs action</span>
        {ATTENTION.map(a => {
          const n = rows.filter(a.test).length;
          return (
            <button key={a.key} className={`alert-pill ${attention === a.key ? 'active' : ''} ${n === 0 ? 'zero' : ''}`} onClick={() => setAttention(attention === a.key ? null : a.key)}>
              {a.label} · {n}
            </button>
          );
        })}
      </div>

      <div className="page-toolbar stock-toolbar">
        <div className="filters date-chips">
          {(['all', 'in', 'low', 'out'] as const).map(s => (
            <button key={s} className={`filter-chip ${!attn && status === s ? 'active' : ''}`} onClick={() => { setStatus(s); setAttention(null); }}>
              {s === 'all' ? 'All' : STOCK_LABEL[s]} ({s === 'all' ? rows.length : count(s)})
            </button>
          ))}
        </div>
        {/* Phones: the stock status filters become one dropdown. */}
        <select className="filter-select phone-select" value={status} onChange={e => { setStatus(e.target.value as StockStatus | 'all'); setAttention(null); }} aria-label="Stock status">
          {(['all', 'in', 'low', 'out'] as const).map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All' : STOCK_LABEL[s]} ({s === 'all' ? rows.length : count(s)})</option>
          ))}
        </select>
        <div className="toolbar-actions">
          <select className="filter-select" value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            <option>Health</option>
            <option>Nutrition</option>
          </select>
          <select className="filter-select" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="urgent">Most urgent first</option>
            <option value="available">Least available</option>
            <option value="sold">Best selling</option>
            <option value="value">Stock value</option>
            <option value="name">Name</option>
          </select>
          <ExportMenu onExport={runExport} />
          <button className="btn-secondary catalogue-btn" onClick={() => setCatalogueOpen(true)} title="Product catalogue with photos, as a PDF">
            <BookOpen size={15} /> Catalogue PDF
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <CardTable>
          <table className="orders-table stock-table">
            <thead>
              <tr>
                <th>Product</th><th className="num-col">In stock</th><th className="num-col">Reserved</th><th className="num-col">Available</th>
                <th className="num-col">Sold 7d / 30d</th><th>Days left</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <EmptyRow cols={7} text="No products here." />}
              {shown.map(r => (
                <tr key={r.p.id} className="clickable" onClick={() => setOpenId(r.p.id)}>
                  <td className="cust">
                    <div className="stock-product">
                      <img src={r.p.image} alt="" loading="lazy" />
                      <div>
                        {r.p.name}
                        <div className="loc">{r.p.size} · {r.p.category} · {r.p.price === null ? 'not sold online' : rupees(r.p.price)}{!r.p.is_active && ' · hidden'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num-col">{r.stock}</td>
                  <td className="num-col">{r.reserved || '—'}</td>
                  <td className={`num-col strong ${r.available === 0 ? 'text-warn' : ''}`}>
                    {r.available}
                    {r.short > 0 && <div className="loc text-warn">{r.short} short</div>}
                  </td>
                  <td className="num-col">{r.sold7} / {r.sold30}</td>
                  <td>
                    <span className={runsOutSoon(r) ? 'text-warn' : undefined}>{daysText(r)}</span>
                    <div className="stock-meter" aria-hidden><span className={r.status} style={{ width: `${Math.min(100, ((r.daysLeft ?? 90) / 60) * 100)}%` }} /></div>
                  </td>
                  <td>
                    <span className={`chip ${STOCK_CHIP[r.status]}`}>{STOCK_LABEL[r.status]}</span>
                    {r.waiting.length > 0 && <div className="loc text-warn">{r.waiting.length} order{r.waiting.length > 1 ? 's' : ''} waiting</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
        <div className="panel-note">
          Available = in stock minus units in orders not yet shipped. Days left = available ÷ average daily sales over 30 days.
          Stock figures are sample data until the backend&apos;s stock_quantity is connected.
        </div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Push this week</h2>
            {push.length > 0 && (
              <button className="link-btn" onClick={() => copyList('Push these on calls this week', push, r => `${r.p.name} (${r.p.size}) · ${rupees(r.p.price!)} · ${r.available} in stock`)}>
                <Copy size={13} /> Copy for team
              </button>
            )}
          </div>
          <ul className="attn-list">
            {push.length === 0 && <li><div className="action">Nothing overstocked right now.</div></li>}
            {push.map(r => (
              <li key={r.p.id}>
                <div><div className="name">{r.p.name}</div><div className="action">{r.available} available · only {r.sold30} sold in 30 days</div></div>
                <div className="attn-side"><span className="loc">{rupees(r.p.price!)}</span></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Don&apos;t promise dates</h2>
            {careful.length > 0 && (
              <button className="link-btn" onClick={() => copyList("Don't promise delivery dates on these", careful, r => `${r.p.name}: ${r.available === 0 ? 'out of stock' : `only ${r.available} left`}`)}>
                <Copy size={13} /> Copy for team
              </button>
            )}
          </div>
          <ul className="attn-list">
            {careful.length === 0 && <li><div className="action">Everything is well stocked.</div></li>}
            {careful.map(r => (
              <li key={r.p.id}>
                <div><div className="name">{r.p.name}</div><div className="action">{r.available === 0 ? 'Out of stock' : `Only ${r.available} left · about ${r.daysLeft} days`}{r.waiting.length > 0 && ` · ${r.waiting.length} order${r.waiting.length > 1 ? 's' : ''} waiting`}</div></div>
                <div className="attn-side"><span className={`chip ${STOCK_CHIP[r.status]}`}>{STOCK_LABEL[r.status]}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {opened && <StockDrawer r={opened} orders={orders} onClose={() => setOpenId(null)} onToast={onToast} />}
      {catalogueOpen && (
        <CatalogueModal
          products={CATALOG_PRODUCTS}
          initialIds={shown.map(r => r.p.id)}
          startLabel={shown.length === rows.length ? 'All in this list' : 'Filtered list'}
          onToast={onToast}
          onClose={() => setCatalogueOpen(false)}
        />
      )}
    </>
  );
}

function StockDrawer({ r, orders, onClose, onToast }: { r: StockRow; orders: SalesOrder[]; onClose: () => void; onToast: (m: string) => void }) {
  const [sheetBusy, setSheetBusy] = useState(false);
  const sheet = async () => {
    setSheetBusy(true);
    try {
      await downloadProductSheet(r.p, TODAY);
      onToast(`Product sheet downloaded: ${r.p.name}`);
    } catch {
      onToast('Could not create the product sheet. Please try again.');
    } finally {
      setSheetBusy(false);
    }
  };
  const now = nowStamp();
  const open = orders
    .map(o => ({ o, t: trackingFor(o, now), qty: o.items.find(i => i.product_name === r.p.name)?.quantity ?? 0 }))
    .filter(x => x.qty > 0 && ['placed', 'confirmed', 'packed'].includes(x.t.stage))
    .sort((a, b) => a.o.created_at.localeCompare(b.o.created_at));
  const waitingIds = new Set(r.waiting.map(o => o.id));
  const max = Math.max(1, ...r.trend);
  const sellers = Array.from(r.byCaller.entries()).sort((a, b) => b[1] - a[1]);
  const pctOf = (n: number) => `${r.stock ? Math.min(100, (n / r.stock) * 100) : 0}%`;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="order-drawer" role="dialog" aria-label={r.p.name}>
        <div className="drawer-head">
          <div className="stock-product">
            <img src={r.p.image} alt="" />
            <div>
              <h3>{r.p.name}</h3>
              <div className="loc">
                {r.p.size} · {r.p.category}{r.p.sku && <> · {r.p.sku}</>} · {r.p.price === null ? 'not sold online' : rupees(r.p.price)}{' '}
                <span className={`chip ${STOCK_CHIP[r.status]}`}>{STOCK_LABEL[r.status]}</span>
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="drawer-body">
          <section className="od-section">
            <div className="mini-stats">
              <div className="mini-stat"><div className="mini-num">{r.stock}</div><div className="mini-label">in stock</div></div>
              <div className="mini-stat"><div className="mini-num">{r.reserved}</div><div className="mini-label">reserved</div></div>
              <div className="mini-stat"><div className="mini-num">{r.available}</div><div className="mini-label">available</div></div>
              <div className="mini-stat"><div className="mini-num">{daysText(r)}</div><div className="mini-label">left at this pace</div></div>
            </div>
            <div className="stock-split" aria-label={`${r.reserved} reserved, ${r.available} available of ${r.stock}`}>
              <span className="reserved" style={{ width: pctOf(Math.min(r.reserved, r.stock)) }} />
              <span className="available" style={{ width: pctOf(r.available) }} />
            </div>
            <div className="loc" style={{ marginTop: 6 }}>
              <span className="legend-dot reserved" /> reserved for orders not yet shipped · <span className="legend-dot available" /> free to sell
              {r.short > 0 && <span className="text-warn"> · {r.short} units short</span>}
            </div>
          </section>

          <section className="od-section">
            <div className="od-label">Units sold · last 30 days ({r.sold30}: team {r.team30}, website {r.web30})</div>
            <div className="bar-chart dense mini-trend">
              {r.trend.map((n, i) => (
                <div key={i} className="bc-col" data-tip={`${i === 29 ? 'Today' : `${29 - i} days ago`}: ${n} units`}>
                  <div className={`bc-bar ${i === 29 ? 'now' : ''}`} style={{ height: `${(n / max) * 100}%` }} />
                </div>
              ))}
            </div>
          </section>

          <section className="od-section">
            <div className="od-label">Orders not yet shipped · {open.length}</div>
            <ul className="attn-list">
              {open.length === 0 && <li><div className="action">None.</div></li>}
              {open.map(({ o, t, qty }) => (
                <li key={o.id}>
                  <div>
                    <div className="name">{o.customer_name} · {o.order_number}</div>
                    <div className="action">{qty} units · {o.city} · {o.phone} · placed {shortDate(o.created_at)}</div>
                  </div>
                  <div className="attn-side">
                    <span className={`chip ${waitingIds.has(o.id) ? 'pending' : 'confirmed'}`}>{waitingIds.has(o.id) ? 'Waiting for stock' : STAGE_LABEL[t.stage]}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="od-section">
            <div className="od-label">Who sells it · last 30 days</div>
            {sellers.length === 0 ? <div className="loc">No team sales; website only.</div> : (
              <HBarList rows={sellers.map(([id, n]) => {
                const name = TELECALLERS.find(t => t.id === id)?.name ?? '—';
                return { key: String(id), label: name, value: n, display: `${n}`, tip: `${name}: ${n} units` };
              })} />
            )}
          </section>

          <section className="od-section">
            <div className="od-label">Complaints · {r.complaints.length}</div>
            <ul className="attn-list">
              {r.complaints.length === 0 && <li><div className="action">None.</div></li>}
              {r.complaints.slice(0, 6).map(c => (
                <li key={c.id}>
                  <div><div className="name">{c.ticket} · {c.category}</div><div className="action">{c.customer_name} · {c.description}</div></div>
                  <div className="attn-side"><span className="loc">{STATUS_LABEL[c.status]}</span></div>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="drawer-actions">
          <button className="btn-secondary catalogue-btn" disabled={sheetBusy} onClick={sheet}>
            <FileText size={14} /> {sheetBusy ? 'Preparing…' : 'Product sheet (PDF)'}
          </button>
        </div>
      </aside>
    </>
  );
}
