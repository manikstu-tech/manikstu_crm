import React, { useState } from 'react';
import { Download, PackageX } from 'lucide-react';
import { CATALOG_PRODUCTS } from '../../data/catalogProducts';
import {
  ODISHA_REGIONS, OdishaRegion, STOCK_POINTS, StockPointKind, StockRow, StockStatus, pointById, productById, stockStatus,
} from '../../data/centralInventory';

type Kind = StockPointKind | 'all';
type StatusFilter = 'all' | 'low' | 'out';

const STATUS_CHIP: Record<StockStatus, string> = { OK: 'delivered', 'Low stock': 'transit', 'Out of stock': 'pending' };
const KIND_LABEL: Record<StockPointKind, string> = { warehouse: 'Warehouse', franchise: 'Franchise hub' };
// Status colours for the stock-health donut, checked for colour-blind separation (always shown with labels).
const HEALTH: { status: StockStatus; label: string; color: string; filter: StatusFilter }[] = [
  { status: 'Out of stock', label: 'Out of stock', color: '#E86A5A', filter: 'out' },
  { status: 'Low stock', label: 'Low stock', color: '#D9A21F', filter: 'low' },
  { status: 'OK', label: 'In stock', color: '#174B32', filter: 'all' },
];
const DONUT_R = 62;
const DONUT_C = 2 * Math.PI * DONUT_R;

interface InventoryViewProps {
  stock: StockRow[];
  /** Restock these rows (one per product at a stock point). */
  onTriggerReorder: (rowIds: string[]) => void;
}

/** Stock of every product across warehouses and franchise hubs, filterable by region and location. */
export default function InventoryView({ stock, onTriggerReorder }: InventoryViewProps) {
  const [region, setRegion] = useState<OdishaRegion | 'all'>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [pointId, setPointId] = useState('all');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const points = STOCK_POINTS.filter(p => (region === 'all' || p.region === region) && (kind === 'all' || p.kind === kind));
  const selectedPoints = pointId === 'all' ? points : points.filter(p => p.id === pointId);
  const pointIds = new Set(selectedPoints.map(p => p.id));
  const rows = stock.filter(r => pointIds.has(r.pointId));

  // One card per product, with its stock at each selected point
  const cards = CATALOG_PRODUCTS
    .filter(p => p.is_active && (category === 'all' || p.category === category))
    .map(p => {
      const at = rows.filter(r => r.productId === p.id)
        .sort((a, b) => a.stock / a.reorderLevel - b.stock / b.reorderLevel);
      return {
        p,
        at,
        total: at.reduce((a, r) => a + r.stock, 0),
        low: at.filter(r => stockStatus(r) === 'Low stock'),
        out: at.filter(r => stockStatus(r) === 'Out of stock'),
      };
    })
    .filter(c => c.at.length > 0)
    .filter(c => statusFilter === 'all' || (statusFilter === 'low' ? c.low.length > 0 : c.out.length > 0));

  // Chart figures: the selected locations and category
  const catRows = rows.filter(r => category === 'all' || productById(r.productId).category === category);
  const lowCount = catRows.filter(r => stockStatus(r) === 'Low stock').length;
  const outCount = catRows.filter(r => stockStatus(r) === 'Out of stock').length;
  const totalUnits = catRows.reduce((a, r) => a + r.stock, 0);
  const health = HEALTH.map(h => ({ ...h, n: catRows.filter(r => stockStatus(r) === h.status).length }));
  const byPoint = selectedPoints.map(pt => {
    const at = catRows.filter(r => r.pointId === pt.id);
    return { pt, units: at.reduce((a, r) => a + r.stock, 0), needs: at.filter(r => stockStatus(r) !== 'OK').length };
  });
  const maxUnits = Math.max(1, ...byPoint.map(b => b.units));

  const scope = pointId !== 'all'
    ? pointById(pointId).name
    : [region === 'all' ? 'All Odisha' : `${region} Odisha`, kind === 'all' ? null : kind === 'warehouse' ? 'warehouses' : 'franchise hubs'].filter(Boolean).join(' · ');

  const exportCsv = () => {
    const header = ['Product', 'Category', 'Size', 'Stock point', 'Type', 'District', 'Region', 'Stock', 'Reorder level', 'Lead time (days)', 'Last restocked (days ago)', 'Status'];
    const lines = cards.flatMap(c => c.at.map(r => {
      const pt = pointById(r.pointId);
      return [c.p.name, c.p.category, c.p.size, pt.name, KIND_LABEL[pt.kind], pt.district, pt.region, r.stock, r.reorderLevel, r.leadTimeDays, r.restockedDaysAgo, stockStatus(r)];
    }));
    const csv = [header, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `manikstu-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  let offset = 0;
  const segments = health.filter(h => h.n > 0).map(h => {
    const len = (h.n / Math.max(1, catRows.length)) * DONUT_C;
    const seg = { ...h, dash: `${Math.max(0, len - 2)} ${DONUT_C}`, offset: -offset };
    offset += len;
    return seg;
  });

  return (
    <>
      <div className="grid equal-2 inv-charts">
        <div className="panel">
          <div className="panel-head"><h2>Stock health</h2><span className="panel-meta">{cards.length} products · each product at each location</span></div>
          <div className="inv-donut-wrap">
            <div className="inv-donut">
              <svg viewBox="0 0 160 160" role="img" aria-label={health.map(h => `${h.label}: ${h.n}`).join(', ')}>
                <circle cx="80" cy="80" r={DONUT_R} fill="none" stroke="var(--line)" strokeWidth="20" />
                {segments.map(g => (
                  <circle key={g.status} cx="80" cy="80" r={DONUT_R} fill="none" stroke={g.color} strokeWidth="20"
                    strokeDasharray={g.dash} strokeDashoffset={g.offset} transform="rotate(-90 80 80)">
                    <title>{`${g.label}: ${g.n}`}</title>
                  </circle>
                ))}
              </svg>
              <div className="inv-donut-center">
                <div className="inv-donut-num">{totalUnits.toLocaleString('en-IN')}</div>
                <div className="loc">units on hand</div>
              </div>
            </div>
            <ul className="inv-legend">
              {health.map(h => (
                <li key={h.status}>
                  <button className={statusFilter === h.filter && h.filter !== 'all' ? 'active' : ''} onClick={() => setStatusFilter(statusFilter === h.filter ? 'all' : h.filter)}>
                    <span className="inv-swatch" style={{ background: h.color }} />
                    <span className="inv-legend-label">{h.label}</span>
                    <span className="inv-legend-n">{h.n}</span>
                    <span className="inv-legend-pct">{catRows.length ? Math.round((h.n / catRows.length) * 100) : 0}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Units by location</h2><span className="panel-meta">click a location to open it</span></div>
          {(['warehouse', 'franchise'] as StockPointKind[]).map(k => {
            const group = byPoint.filter(b => b.pt.kind === k).sort((a, b) => b.units - a.units);
            return group.length > 0 && (
              <div key={k} className="inv-bar-group">
                <div className="od-label">{k === 'warehouse' ? 'Warehouses' : 'Franchise hubs'}</div>
                <ul className="hbar-list region-bars">
                  {group.map(({ pt, units, needs }) => (
                    <li key={pt.id} className={`hbar-row ${pointId === pt.id ? 'selected' : ''}`} data-tip={`${pt.name} (${pt.district}): ${units.toLocaleString('en-IN')} units${needs ? ` · ${needs} products low or out` : ''}`}>
                      <button className="hbar-label link-btn" onClick={() => setPointId(pointId === pt.id ? 'all' : pt.id)}>{pt.name}</button>
                      <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(units / maxUnits) * 100}%` }} /></span>
                      <span className="hbar-value">{units.toLocaleString('en-IN')}{needs > 0 && <span className="inv-needs"> · {needs} to reorder</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel inv-filters">
        <label className="form-group">
          <span>Region</span>
          <select className="filter-select" value={region} onChange={e => { setRegion(e.target.value as OdishaRegion | 'all'); setPointId('all'); }}>
            <option value="all">All Odisha</option>
            {ODISHA_REGIONS.map(r => <option key={r} value={r}>{r} Odisha</option>)}
          </select>
        </label>
        <label className="form-group">
          <span>Warehouse / franchise</span>
          <select className="filter-select" value={kind} onChange={e => { setKind(e.target.value as Kind); setPointId('all'); }}>
            <option value="all">Warehouses + franchise hubs</option>
            <option value="warehouse">Warehouses only</option>
            <option value="franchise">Franchise hubs only</option>
          </select>
        </label>
        <label className="form-group">
          <span>Location</span>
          <select className="filter-select" value={pointId} onChange={e => setPointId(e.target.value)}>
            <option value="all">All locations ({points.length})</option>
            {(['warehouse', 'franchise'] as StockPointKind[]).map(k => {
              const opts = points.filter(p => p.kind === k);
              return opts.length > 0 && (
                <optgroup key={k} label={k === 'warehouse' ? 'Warehouses' : 'Franchise hubs'}>
                  {opts.map(p => <option key={p.id} value={p.id}>{p.name} · {p.district}</option>)}
                </optgroup>
              );
            })}
          </select>
        </label>
        <label className="form-group">
          <span>Category</span>
          <select className="filter-select" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            <option value="Health">Health</option>
            <option value="Nutrition">Nutrition</option>
          </select>
        </label>
      </div>

      <div className="page-toolbar inv-toolbar">
        <div className="filters date-chips">
          {([['all', 'All products'], ['low', `Low stock (${lowCount})`], ['out', `Out of stock (${outCount})`]] as [StatusFilter, string][]).map(([k, label]) => (
            <button key={k} className={`filter-chip ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>{label}</button>
          ))}
        </div>
        {/* Phones: the stock status filters become one dropdown. */}
        <select className="filter-select phone-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} aria-label="Stock status">
          {([['all', 'All products'], ['low', `Low stock (${lowCount})`], ['out', `Out of stock (${outCount})`]] as [StatusFilter, string][]).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <div className="toolbar-actions">
          <span className="panel-meta">{scope}</span>
          <button className="btn-secondary inv-export" onClick={exportCsv}><Download size={15} /> Export CSV</button>
        </div>
      </div>

      {cards.length === 0 && <div className="panel loc inv-empty">No products match these filters.</div>}

      <div className="inv-grid">
        {cards.map(({ p, at, total, low, out }) => {
          const needs = [...out, ...low];
          const worst: StockStatus = out.length ? 'Out of stock' : low.length ? 'Low stock' : 'OK';
          return (
            <div key={p.id} className="inv-card">
              <div className="inv-img">
                <img src={p.image} alt={p.name} loading="lazy" />
                <span className={`chip ${STATUS_CHIP[worst]}`}>
                  {worst === 'OK' ? 'In stock' : `${worst} · ${needs.length} of ${at.length}`}
                </span>
              </div>
              <div className="inv-body">
                <div className="inv-name">{p.name}</div>
                <div className="loc">{p.category} · {p.size}</div>
                <div className="inv-total"><strong>{total.toLocaleString('en-IN')}</strong> units at {at.length} location{at.length === 1 ? '' : 's'}</div>
                <ul className="inv-points">
                  {at.slice(0, 4).map(r => {
                    const pt = pointById(r.pointId);
                    const st = stockStatus(r);
                    return (
                      <li key={r.id} data-tip={`${pt.name}: ${r.stock} units · reorder at ${r.reorderLevel} · restocked ${r.restockedDaysAgo}d ago`}>
                        <span className={`inv-dot ${STATUS_CHIP[st]}`} />
                        <span className="inv-pt">{pt.name}</span>
                        <span className={st === 'OK' ? 'inv-qty' : 'inv-qty warn'}>{r.stock}</span>
                      </li>
                    );
                  })}
                  {at.length > 4 && <li className="inv-more loc">+{at.length - 4} more</li>}
                </ul>
                {needs.length > 0 ? (
                  <button className="btn-primary btn-small inv-reorder" onClick={() => onTriggerReorder(needs.map(r => r.id))}>
                    {out.length > 0 && <PackageX size={14} />} Reorder for {needs.length} location{needs.length === 1 ? '' : 's'}
                  </button>
                ) : <div className="inv-ok loc">All locations above reorder level</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
