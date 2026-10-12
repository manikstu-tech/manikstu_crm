import React, { useMemo, useState } from 'react';
import { ChevronRight, Eye, IndianRupee, MapPin, PackageCheck, Receipt, Upload, Users } from 'lucide-react';
import { TODAY, OrderSource, SalesOrder } from '../../data/managerDashboard';
import { Customer } from '../../data/initialData';
import { MONTH, daysBefore, pct, rupees, rupeesShort, shortDate } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import { fetchFarmerProfile, fetchFarmerProfiles, saveFarmerProfile } from '../../lib/farmerProfile';
import { INDIA_STATES, INDIA_UTS, districtFor, stateFor } from '../../lib/regions';
import ExportMenu from '../ExportMenu';
import FarmerDetailsView from './FarmerDetailsView';
import FarmerProfileImport from './FarmerProfileImport';
import PieChart, { PieSlice } from '../PieChart';

const EMPTY_LIVESTOCK: Customer['livestock'] = { cows: 0, buffaloes: 0, goats: 0, sheep: 0, poultry: 0 };

type Period = 'month' | '30d' | '90d' | 'all';
const PERIOD_LABEL: Record<Period, string> = { month: 'This month', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' };
const inPeriod = (ts: string, p: Period) => p === 'all' || (p === 'month' ? ts.startsWith(MONTH) : daysBefore(ts) < (p === '30d' ? 30 : 90));
const PAGE_SIZE = 15;

const village = (o: SalesOrder) => { const a = o.address ?? ''; return a.split(',').slice(1).join(',').trim() || a; };

interface Props {
  orders: SalesOrder[];
  onToast: (message: string) => void;
}

/** Orders by location: state → district → town / pincode, with farmer summary and downloads. */
export default function RegionalReportView({ orders, onToast }: Props) {
  const located = useMemo(
    () => orders.map(o => ({ o, state: stateFor(o.state, o.pincode), district: districtFor(o.state, o.pincode, o.city) })),
    [orders],
  );
  // Orders per state / UT (all periods), for the State list
  const stateCounts = located.reduce((m, x) => m.set(x.state, (m.get(x.state) ?? 0) + 1), new Map<string, number>());
  const unknownCount = stateCounts.get('Unknown') ?? 0;

  // 'all' lists every farmer who ordered, from any state; pick a state (then a district) to narrow it down
  const [state, setState] = useState('all');
  const stateLabel = state === 'all' ? 'All states' : state;
  const [district, setDistrict] = useState('all');
  const [period, setPeriod] = useState<Period>('all');
  const [source, setSource] = useState<OrderSource | 'all'>('all');
  const [page, setPage] = useState(0);
  const reset = () => setPage(0);

  // Farmer details drawer: open the existing FarmerDetailsView inline for one farmer,
  // pulling their saved profile (land, crops, livestock) by phone.
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Download scope: every farmer in the current view, or one farmer (by phone).
  const [downloadScope, setDownloadScope] = useState<'all' | string>('all');
  // Load the saved profile first, so the details view mounts once with the real
  // land/crops/livestock (its edit fields initialise from the data on mount).
  const openFarmer = async (f: { name: string; phone: string; place: string; orders: number; spent: number; last: string }) => {
    const orderFigures = { name: f.name, location: f.place, ordersCount: f.orders, lifetimeValue: f.spent, lastOrder: shortDate(f.last) };
    const profile = await fetchFarmerProfile(f.phone);
    setViewing(profile
      ? { ...profile, ...orderFigures }
      : { id: `F-${f.phone}`, phone: f.phone, status: 'Active', landHolding: '—', crops: [], livestock: { ...EMPTY_LIVESTOCK }, ...orderFigures });
  };
  const saveFarmer = async (patch: {
    livestock?: Customer['livestock'];
    landHolding?: string;
    crops?: string[];
    farmingModel?: string;
    waterResource?: string;
    preferredLanguage?: string;
  }) => {
    if (!viewing) return;
    const saved = await saveFarmerProfile({ phone: viewing.phone, name: viewing.name, ...patch });
    // Update the profile fields; keep this view's order figures (orders / spent / last order).
    setViewing(v => (v ? { ...v, livestock: saved.livestock, landHolding: saved.landHolding, crops: saved.crops, details: saved.details } : v));
    onToast('Farmer profile saved');
  };

  // Everything except the location filters
  const base = located.filter(({ o, state: st }) =>
    (state === 'all' || st === state) && inPeriod(o.created_at, period) && (source === 'all' || o.source === source));
  const districtCounts = Array.from(base.reduce((m, x) => m.set(x.district, (m.get(x.district) ?? 0) + 1), new Map<string, number>()))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const rows = base
    .filter(x => district === 'all' || x.district === district)
    .map(x => x.o)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Tiles
  const live = rows.filter(o => o.status !== 'cancelled');
  const revenue = live.reduce((a, o) => a + o.total, 0);
  const farmers = new Set(rows.map(o => o.phone)).size;
  const delivered = live.filter(o => o.status === 'delivered').length;
  const cashDue = live.filter(o => o.payment_method === 'COD' && o.payment_status === 'unpaid').reduce((a, o) => a + o.total, 0);

  // Farmer summary: one row per customer (by phone)
  const farmerRows = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; place: string; orders: number; spent: number; last: string; products: Map<string, number> }>();
    rows.forEach(o => {
      const f = m.get(o.phone) ?? { name: o.customer_name, phone: o.phone, place: `${village(o)}, ${o.city} ${o.pincode}`, orders: 0, spent: 0, last: o.created_at, products: new Map() };
      f.orders++;
      if (o.status !== 'cancelled') f.spent += o.total;
      if (o.created_at > f.last) f.last = o.created_at;
      o.items.forEach(i => f.products.set(i.product_name, (f.products.get(i.product_name) ?? 0) + i.quantity));
      m.set(o.phone, f);
    });
    return Array.from(m.values())
      .map(f => ({ ...f, top: Array.from(f.products).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—' }))
      .sort((a, b) => b.spent - a.spent);
  }, [rows]);

  // Breakdown charts
  const byDistrict = Array.from(base.filter(x => x.o.status !== 'cancelled').reduce((m, x) => m.set(x.district, (m.get(x.district) ?? 0) + x.o.total), new Map<string, number>()))
    .sort((a, b) => b[1] - a[1]);
  const productTotals = Array.from(live.reduce((m, o) => {
    o.items.forEach(i => m.set(i.product_name, (m.get(i.product_name) ?? 0) + i.price * i.quantity));
    return m;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);
  // Pie: top 5 products, the rest folded into "Other" (max 6 slices)
  const byProduct: PieSlice[] = productTotals.length <= 6
    ? productTotals.map(([p, amt]) => ({ key: p, label: p, value: amt, display: rupeesShort(amt) }))
    : [
        ...productTotals.slice(0, 5).map(([p, amt]) => ({ key: p, label: p, value: amt, display: rupeesShort(amt) })),
        (amt => ({ key: 'other', label: `Other (${productTotals.length - 5})`, value: amt, display: rupeesShort(amt), other: true }))(
          productTotals.slice(5).reduce((a, [, amt]) => a + amt, 0)),
      ];

  const areaLabel = `${stateLabel} › ${district === 'all' ? 'all districts' : district}`;
  const summary = `${rows.length} orders · revenue ${rupees(revenue)} · ${farmers} farmers · ${pct(delivered, live.length)}% delivered · cash to collect ${rupees(cashDue)}`;

  const exportFarmers = async (format: ExportFormat) => {
    if (farmerRows.length === 0) { onToast('No farmers in this area to export'); return; }
    try {
      await exportTable(format, {
        filename: `regional-farmers-${(district === 'all' ? stateLabel : district).toLowerCase().replace(/ /g, '-')}-${TODAY}`,
        title: `Farmers · ${areaLabel}`,
        subtitle: `${PERIOD_LABEL[period]} · ${summary} · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Farmer / customer', width: 20 }, { header: 'Phone', width: 12 }, { header: 'Village, town, PIN', width: 30 },
          { header: 'Orders', width: 8 }, { header: 'Total spent', width: 12, money: true }, { header: 'Last order', width: 11 }, { header: 'Top product', width: 24 },
        ],
        rows: farmerRows.map(f => [f.name, f.phone, f.place, f.orders, f.spent, shortDate(f.last), f.top]),
      });
      onToast(`Farmer summary exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  // Download full farmer details (incl. land, crops and livestock pulled from the saved
  // profiles) for all farmers in this view, or one chosen farmer. Excel / CSV / PDF.
  const downloadFarmerDetails = async (format: ExportFormat) => {
    const target = downloadScope === 'all' ? farmerRows : farmerRows.filter(f => f.phone === downloadScope);
    if (target.length === 0) { onToast('No farmers to download'); return; }
    try {
      const profiles = await fetchFarmerProfiles(target.map(f => f.phone));
      const scopeName = downloadScope === 'all' ? (district === 'all' ? stateLabel : district) : target[0].name;
      await exportTable(format, {
        filename: `farmer-details-${scopeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${TODAY}`,
        title: `Farmer details · ${areaLabel}`,
        subtitle: `${PERIOD_LABEL[period]} · ${downloadScope === 'all' ? `${target.length} farmers` : target[0].name} · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Farmer / customer', width: 20 }, { header: 'Phone', width: 12 }, { header: 'Village, town, PIN', width: 26 },
          { header: 'Orders', width: 8 }, { header: 'Total spent', width: 12, money: true }, { header: 'Last order', width: 11 }, { header: 'Top product', width: 20 },
          { header: 'Land holding', width: 13 }, { header: 'Crops', width: 20 },
          { header: 'Farming model', width: 18 }, { header: 'Water resource', width: 18 }, { header: 'Preferred language', width: 18 },
          { header: 'Cows', width: 7 }, { header: 'Buffaloes', width: 10 }, { header: 'Goats', width: 7 }, { header: 'Sheep', width: 7 }, { header: 'Poultry', width: 8 },
        ],
        rows: target.map(f => {
          const p = profiles[f.phone];
          const lv = p?.livestock ?? { ...EMPTY_LIVESTOCK };
          const land = p?.landHolding;
          return [
            f.name, f.phone, f.place, f.orders, f.spent, shortDate(f.last), f.top,
            land && land !== '—' ? land : '', (p?.crops ?? []).join(', '),
            p?.details?.farmingModel ?? '', p?.details?.waterResource ?? '', p?.details?.preferredLanguage ?? '',
            lv.cows, lv.buffaloes, lv.goats, lv.sheep, lv.poultry,
          ];
        }),
      });
      onToast(`Farmer details downloaded (${format === 'excel' ? 'Excel' : format === 'csv' ? 'CSV' : 'PDF'})`);
    } catch {
      onToast('Download failed. Please try again.');
    }
  };

  const pages = Math.max(1, Math.ceil(farmerRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageRows = farmerRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  if (viewing) {
    return (
      <FarmerDetailsView
        customer={viewing}
        orders={orders}
        editable
        onSave={saveFarmer}
        backLabel="Back to regional report"
        onBack={() => setViewing(null)}
      />
    );
  }

  return (
    <>
      <div className="region-toolbar">
        <div className="region-crumb">
          <MapPin size={16} className="region-pin" aria-hidden />
          <div className="pill-select">
            <select value={state} onChange={e => { setState(e.target.value); setDistrict('all'); reset(); }} aria-label="State">
              <option value="all">All states ({orders.length})</option>
              <optgroup label="States">
                {INDIA_STATES.map(s => <option key={s} value={s}>{s}{stateCounts.get(s) ? ` (${stateCounts.get(s)})` : ''}</option>)}
              </optgroup>
              <optgroup label="Union territories">
                {INDIA_UTS.map(s => <option key={s} value={s}>{s}{stateCounts.get(s) ? ` (${stateCounts.get(s)})` : ''}</option>)}
              </optgroup>
              {unknownCount > 0 && <option value="Unknown">Unknown state ({unknownCount})</option>}
            </select>
          </div>
          <ChevronRight size={15} className="region-sep" aria-hidden />
          <div className="pill-select">
            <select value={district} onChange={e => { setDistrict(e.target.value); reset(); }} aria-label={state === 'Odisha' ? 'District' : 'District / town'}>
              <option value="all">All districts ({base.length})</option>
              {districtCounts.map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
            </select>
          </div>
        </div>
        <div className="region-toolbar-right">
          <div className="pill-select">
            <select value={period} onChange={e => { setPeriod(e.target.value as Period); reset(); }} aria-label="Period">
              {(Object.keys(PERIOD_LABEL) as Period[]).map(p => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
            </select>
          </div>
          <div className="pill-select">
            <select value={source} onChange={e => { setSource(e.target.value as OrderSource | 'all'); reset(); }} aria-label="Source">
              <option value="all">Website + telecalling</option>
              <option value="website">Website</option>
              <option value="telecaller">Telecalling</option>
            </select>
          </div>
        </div>
      </div>

      <div className="region-kpis four">
        <div className="stat-tile accent">
          <IndianRupee className="stat-icon" size={20} />
          <div className="num">{rupeesShort(revenue)}</div>
          <div className="label">Revenue</div>
        </div>
        <div className="stat-tile">
          <Users className="stat-icon" size={20} />
          <div className="num">{farmers}</div>
          <div className="label">Farmers / customers</div>
        </div>
        <div className="stat-tile">
          <Receipt className="stat-icon" size={20} />
          <div className="num">{live.length ? rupees(Math.round(revenue / live.length)) : '—'}</div>
          <div className="label">Average order</div>
        </div>
        <div className="stat-tile">
          <PackageCheck className="stat-icon" size={20} />
          <div className="num">{live.length ? `${pct(delivered, live.length)}%` : '—'}</div>
          <div className="label">Delivered</div>
        </div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head"><h2>Revenue by district</h2><span className="panel-meta">{stateLabel} · click a bar to filter</span></div>
          {byDistrict.length === 0 ? <div className="loc">No orders from {state === 'all' ? 'any state' : state}{period === 'all' ? '' : ` in ${PERIOD_LABEL[period].toLowerCase()}`}.</div> : (
            <div className="col-chart">
              {byDistrict.map(([d, amt], i) => (
                <button
                  key={d}
                  className={`col ${district === d ? 'selected' : ''}`}
                  data-tip={`${d}: ${rupees(amt)}`}
                  aria-label={`${d}: ${rupees(amt)}`}
                  onClick={() => { setDistrict(district === d ? 'all' : d); reset(); }}
                >
                  <span className="col-plot">
                    <span className="col-bar" style={{ height: `${Math.max(1, (amt / byDistrict[0][1]) * 100)}%` }}>
                      {(i === 0 || district === d) && <span className="col-value">{rupeesShort(amt)}</span>}
                    </span>
                  </span>
                  <span className="col-label">{d}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Product share</h2><span className="panel-meta">{district === 'all' ? stateLabel : district}</span></div>
          {byProduct.length === 0 ? <div className="loc">No sales in this area.</div> : (
            <PieChart slices={byProduct} label={`Share of sales by product in ${district === 'all' ? stateLabel : district}`} />
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>{areaLabel}</h2>
          <span className="panel-meta">{PERIOD_LABEL[period]}</span>
        </div>
        <div className="page-toolbar" style={{ marginBottom: 12 }}>
          <div className="panel-meta">Farmer-wise · {farmerRows.length} farmers, {rows.length} orders</div>
          <div className="toolbar-actions">
            <button className="btn-secondary btn-small" onClick={() => setImportOpen(true)}><Upload size={15} /> Import</button>
            <ExportMenu onExport={exportFarmers} />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Farmer / customer</th><th>Village · town · PIN</th><th className="num-col">Orders</th><th className="num-col">Total spent</th><th>Last order</th><th>Top product</th><th className="num-col">View</th></tr>
            </thead>
            <tbody>
              {farmerRows.length === 0 && <tr><td colSpan={7} className="loc" style={{ textAlign: 'center', padding: 24 }}>{(state === 'all' ? orders.length : stateCounts.get(state)) ? 'No farmers in this area for these filters.' : `No orders from ${stateLabel} yet.`}</td></tr>}
              {pageRows.map(f => (
                <tr key={f.phone}>
                  <td className="cust">{f.name}<div className="loc">{f.phone}</div></td>
                  <td>{f.place}</td>
                  <td className="num-col">{f.orders}</td>
                  <td className="num-col strong">{rupees(f.spent)}</td>
                  <td>{shortDate(f.last)}</td>
                  <td>{f.top}</td>
                  <td className="num-col">
                    <button className="icon-btn" title={`View ${f.name}'s details`} aria-label={`View ${f.name}'s details`} onClick={() => openFarmer(f)}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{farmerRows.length} farmers</span>
          {pages > 1 && (
            <div className="pager-btns">
              <button className="btn-secondary btn-small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
              <button className="btn-secondary btn-small" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
            </div>
          )}
        </div>

        <div className="page-toolbar" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <div className="pill-select">
            <select value={downloadScope} onChange={e => setDownloadScope(e.target.value)} aria-label="Farmers to download">
              <option value="all">All farmers ({farmerRows.length})</option>
              {farmerRows.map(f => <option key={f.phone} value={f.phone}>{f.name} · {f.phone}</option>)}
            </select>
          </div>
          <ExportMenu label="Download farmer details" formats={['excel', 'csv', 'pdf']} onExport={downloadFarmerDetails} />
        </div>
      </div>

      <div className="panel-note">
        Orders don&apos;t store a district yet: for Odisha it&apos;s worked out from the PIN code (or town name); for other states the town is shown. If an order has no state, it&apos;s taken from the PIN code. Cancelled orders are listed but not counted in revenue.
      </div>

      <FarmerProfileImport isOpen={importOpen} onClose={() => setImportOpen(false)} onToast={onToast} />
    </>
  );
}
