import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Bike, CheckCircle2, ChevronDown, Clock, Copy, Eye, MessageCircle, Package, PackageCheck, ShoppingBag, SlidersHorizontal, Truck, Wallet, X, XCircle,
} from 'lucide-react';
import { SalesOrder, TELECALLERS, TODAY } from '../../data/managerDashboard';
import { Complaint } from '../../data/complaints';
import { daysBefore, nowStamp, rupees, shortDate, shortDateTime } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import ExportMenu from '../ExportMenu';
import { EmptyRow } from './shared';
import { STATUS_LABEL } from './complaintsUtil';
import {
  STAGE_CHIP, STAGE_FLOW, STAGE_LABEL, TrackStage, Tracking, customerUpdate, stageIndex, trackingFor,
} from './orderTracking';
import CardTable from '../CardTable';

type Source = 'all' | 'telecaller' | 'website';
const PAGE_SIZE = 20;

const soldBy = (o: SalesOrder) => (o.caller_id === null ? 'Website' : TELECALLERS.find(t => t.id === o.caller_id)?.name ?? '—');
const lastAt = (t: Tracking, stage: TrackStage) => t.events.find(e => e.stage === stage)?.at ?? null;
/** WhatsApp chat with the customer, the tracking update already typed in. */
const whatsappLink = (o: SalesOrder, t: Tracking) =>
  `https://wa.me/91${o.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(customerUpdate(o, t))}`;

/** "Needs action" shortcuts. */
const ATTENTION: { key: string; label: string; test: (o: SalesOrder, t: Tracking) => boolean }[] = [
  { key: 'late', label: 'Late with courier', test: (_, t) => t.delayed },
  { key: 'unconfirmed', label: 'Not confirmed 2+ days', test: (o, t) => t.stage === 'placed' && daysBefore(o.created_at) >= 2 },
  { key: 'unshipped', label: 'Confirmed, not shipped 2+ days', test: (_, t) => (t.stage === 'confirmed' || t.stage === 'packed') && daysBefore(lastAt(t, 'confirmed') ?? TODAY) >= 2 },
  { key: 'cash', label: 'Delivered, cash not collected', test: (o, t) => t.stage === 'delivered' && o.payment_method === 'COD' && o.payment_status === 'unpaid' },
];

/** Six dots showing how far the order has got. */
function TrackBar({ t }: { t: Tracking }) {
  const at = stageIndex(t.stage);
  if (t.stage === 'cancelled') return <div className="track-bar cancelled" aria-label="Cancelled"><span /></div>;
  return (
    <div className={`track-bar ${t.delayed ? 'late' : ''}`} aria-label={`${STAGE_LABEL[t.stage]}, step ${at + 1} of ${STAGE_FLOW.length}`}>
      {STAGE_FLOW.map((s, i) => <span key={s} className={i < at ? 'done' : i === at ? 'now' : ''} title={STAGE_LABEL[s]} />)}
    </div>
  );
}

interface Props {
  orders: SalesOrder[];
  complaints: Complaint[];
  searchQuery: string;
  onToast: (message: string) => void;
}

/** Orders & tracking: what each customer bought and where the parcel is. Read-only for the head. */
export default function TeamOrders({ orders, complaints, searchQuery, onToast }: Props) {
  const hour = nowStamp().slice(0, 13); // recompute at most once an hour
  const tracked = useMemo(() => {
    const now = nowStamp();
    return orders.map(o => ({ o, t: trackingFor(o, now) }));
  }, [orders, hour]);

  const [stage, setStage] = useState<TrackStage | 'all'>('all');
  const [attention, setAttention] = useState<string | null>(null);
  const [source, setSource] = useState<Source>('all');
  const [caller, setCaller] = useState<string>('all');
  const [product, setProduct] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  /** Opened with the eye button: scroll straight to the delivery tracking. */
  const [focusTracking, setFocusTracking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const copyUpdate = async (o: SalesOrder, t: Tracking) => {
    try {
      await navigator.clipboard.writeText(customerUpdate(o, t));
      onToast(`Update for ${o.customer_name} copied: paste it into SMS`);
    } catch {
      onToast('Could not copy. Please try again.');
    }
  };

  const products = useMemo(() => Array.from(new Set(orders.flatMap(o => o.items.map(i => i.product_name)))).sort(), [orders]);

  const q = searchQuery.trim().toLowerCase();
  const scoped = tracked.filter(({ o, t }) =>
    (source === 'all' || o.source === source) &&
    (caller === 'all' || o.caller_id === Number(caller)) &&
    (product === 'all' || o.items.some(i => i.product_name === product)) &&
    (!q || [o.order_number, o.customer_name, o.phone, o.city, t.awb ?? ''].some(v => v.toLowerCase().includes(q))),
  );
  const attn = ATTENTION.find(a => a.key === attention);
  const rows = scoped.filter(({ o, t }) => (attn ? attn.test(o, t) : stage === 'all' || t.stage === stage));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const stageCount = (s: TrackStage) => scoped.filter(x => x.t.stage === s).length;

  const pickStage = (s: TrackStage | 'all') => { setStage(stage === s ? 'all' : s); setAttention(null); setPage(0); };

  // Tiles
  const deliveredWeek = tracked.filter(({ t }) => t.stage === 'delivered' && daysBefore(lastAt(t, 'delivered') ?? '2000-01-01') < 7).length;
  const toPack = tracked.filter(({ t }) => t.stage === 'confirmed').length;
  const inTransit = tracked.filter(({ t }) => t.stage === 'shipped').length;
  const ofd = tracked.filter(({ t }) => t.stage === 'out_for_delivery').length;
  const late = tracked.filter(({ t }) => t.delayed).length;
  const placedToday = tracked.filter(({ o }) => o.created_at.startsWith(TODAY)).length;

  const runExport = async (format: ExportFormat) => {
    if (rows.length === 0) { onToast('No orders to export'); return; }
    try {
      await exportTable(format, {
        filename: `order-tracking-${TODAY}`,
        title: `Order tracking · ${attn ? attn.label : stage === 'all' ? 'All orders' : STAGE_LABEL[stage]}`,
        subtitle: `${rows.length} orders · exported ${shortDate(TODAY)}`,
        columns: [
          { header: 'Order', width: 12 }, { header: 'Date', width: 10 }, { header: 'Customer', width: 18 }, { header: 'Phone', width: 12 },
          { header: 'City', width: 12 }, { header: 'Products', width: 28 }, { header: 'Sold by', width: 14 }, { header: 'Amount', width: 10, money: true },
          { header: 'Payment', width: 12 }, { header: 'Tracking', width: 14 }, { header: 'Courier', width: 11 }, { header: 'AWB', width: 15 },
          { header: 'Expected', width: 10 },
        ],
        rows: rows.map(({ o, t }) => [
          o.order_number, shortDate(o.created_at), o.customer_name, o.phone, o.city,
          o.items.map(i => `${i.product_name} × ${i.quantity}`).join(', '), soldBy(o), o.total,
          `${o.payment_method} · ${o.payment_status}`, `${STAGE_LABEL[t.stage]}${t.delayed ? ' (late)' : ''}`,
          t.courier ?? '', t.awb ?? '', t.expected_at ? shortDate(t.expected_at) : '',
        ]),
      });
      onToast(`Orders exported to ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Export failed. Please try again.');
    }
  };

  const opened = tracked.find(x => x.o.id === openId);

  // Active filters, shown as removable tags
  const tags = [
    attn && { key: 'attn', k: 'Needs action', v: attn.label, clear: () => { setAttention(null); setPage(0); } },
    !attn && stage !== 'all' && { key: 'stage', k: 'Stage', v: stage === 'cancelled' ? 'Cancelled' : STAGE_LABEL[stage], clear: () => { setStage('all'); setPage(0); } },
    source !== 'all' && { key: 'source', k: 'Type', v: source === 'telecaller' ? 'Team sales' : 'Website', clear: () => { setSource('all'); setPage(0); } },
    caller !== 'all' && { key: 'caller', k: 'Sold by', v: TELECALLERS.find(t => t.id === Number(caller))?.name ?? '', clear: () => { setCaller('all'); setPage(0); } },
    product !== 'all' && { key: 'product', k: 'Product', v: product, clear: () => { setProduct('all'); setPage(0); } },
  ].filter(Boolean) as { key: string; k: string; v: string; clear: () => void }[];
  const clearFilters = () => { setStage('all'); setAttention(null); setSource('all'); setCaller('all'); setProduct('all'); setPage(0); };

  const lateInTransit = scoped.filter(x => x.t.stage === 'shipped' && x.t.delayed).length;
  const JOURNEY: { s: TrackStage; icon: typeof Truck; note?: string }[] = [
    { s: 'placed', icon: ShoppingBag, note: placedToday ? `${placedToday} today` : undefined },
    { s: 'confirmed', icon: CheckCircle2, note: toPack ? 'to pack' : undefined },
    { s: 'packed', icon: Package },
    { s: 'shipped', icon: Truck, note: lateInTransit ? `${lateInTransit} late` : undefined },
    { s: 'out_for_delivery', icon: Bike, note: ofd ? 'tell them today' : undefined },
    { s: 'delivered', icon: PackageCheck, note: `${deliveredWeek} this week` },
  ];
  const ACTION_CARDS: { key: string; icon: typeof Truck; label: string }[] = [
    { key: 'late', icon: AlertTriangle, label: 'Late with courier · call first' },
    { key: 'unconfirmed', icon: Clock, label: 'Not confirmed 2+ days' },
    { key: 'unshipped', icon: Package, label: 'Confirmed, not shipped 2+ days' },
    { key: 'cash', icon: Wallet, label: 'Delivered, cash not collected' },
  ];

  return (
    <>
      {/* Order journey: every stage on one route, then what needs a call */}
      <div className="panel oj">
        <div className="panel-head">
          <h2>Order journey</h2>
          <div className="oj-head-side">
            <span className="panel-meta">{scoped.length} orders · click a stage to see them</span>
            <button className={`oj-cancelled ${!attn && stage === 'cancelled' ? 'on' : ''}`} onClick={() => pickStage('cancelled')}>
              <XCircle size={13} /> {stageCount('cancelled')} cancelled
            </button>
          </div>
        </div>

        <ol className="oj-route">
          {JOURNEY.map(({ s, icon: Icon, note }) => {
            const n = stageCount(s);
            const on = !attn && stage === s;
            return (
              <li key={s} className={`oj-stop ${n > 0 ? 'has' : ''} ${on ? 'on' : ''} ${s === 'delivered' ? 'last' : ''}`}>
                <button onClick={() => pickStage(s)} aria-pressed={on}>
                  <span className="oj-icon"><Icon size={19} /></span>
                  <span className="oj-n">{n}</span>
                  <span className="oj-label">{STAGE_LABEL[s]}</span>
                  {note && <span className="oj-note">{note}</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="oj-actions">
          <span className="oj-actions-title">Needs action</span>
          {ACTION_CARDS.map(({ key, icon: Icon, label }) => {
            const a = ATTENTION.find(x => x.key === key)!;
            const n = scoped.filter(x => a.test(x.o, x.t)).length;
            return (
              <button key={key} className={`oj-action ${n > 0 ? 'hot' : ''} ${attention === key ? 'on' : ''}`} onClick={() => { setAttention(attention === key ? null : key); setPage(0); }}>
                <Icon size={16} />
                <span className="oj-action-n">{n}</span>
                <span className="oj-action-label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* One filter menu, active filters as tags, export */}
      <div className="lf-bar ord-bar">
        <div className="lf-wrap" ref={menuRef}>
          <button className={`lf-trigger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="dialog">
            <SlidersHorizontal size={15} /> Filters
            {tags.length > 0 && <span className="lf-count">{tags.length}</span>}
            <ChevronDown size={15} className="lf-caret" />
          </button>
          {menuOpen && (
            <div className="lf-menu ord-menu" role="dialog" aria-label="Filter orders">
              <div className="lf-section">
                <div className="lf-title">Stage</div>
                <button className={`lf-option ${!attn && stage === 'all' ? 'on' : ''}`} onClick={() => { setStage('all'); setAttention(null); setPage(0); }}>
                  <span className="lf-radio" />All stages<span className="lf-n">{scoped.length}</span>
                </button>
                {[...STAGE_FLOW, 'cancelled' as TrackStage].map(s => (
                  <button key={s} className={`lf-option ${!attn && stage === s ? 'on' : ''}`} onClick={() => { setStage(s); setAttention(null); setPage(0); }}>
                    <span className="lf-radio" />{s === 'cancelled' ? 'Cancelled' : STAGE_LABEL[s]}<span className="lf-n">{stageCount(s)}</span>
                  </button>
                ))}
              </div>

              <div className="lf-section">
                <div className="lf-title">Needs action</div>
                {ATTENTION.map(a => (
                  <button key={a.key} className={`lf-option ${attention === a.key ? 'on' : ''}`} onClick={() => { setAttention(attention === a.key ? null : a.key); setPage(0); }}>
                    <span className="lf-radio" />{a.label}<span className="lf-n">{scoped.filter(x => a.test(x.o, x.t)).length}</span>
                  </button>
                ))}
                <div className="lf-title lf-sub">Order type</div>
                <div className="lf-pills">
                  {(['all', 'telecaller', 'website'] as Source[]).map(s => (
                    <button key={s} className={`lf-pill ${source === s ? 'on' : ''}`} onClick={() => { setSource(s); setPage(0); }}>
                      {s === 'all' ? 'All' : s === 'telecaller' ? 'Team sales' : 'Website'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lf-section">
                <div className="lf-title">Sold by</div>
                <div className="lf-pills">
                  <button className={`lf-pill ${caller === 'all' ? 'on' : ''}`} onClick={() => { setCaller('all'); setPage(0); }}>Anyone</button>
                  {TELECALLERS.map(t => (
                    <button key={t.id} className={`lf-pill ${caller === String(t.id) ? 'on' : ''}`} onClick={() => { setCaller(String(t.id)); setPage(0); }}>{t.name.split(' ')[0]}</button>
                  ))}
                </div>
                <div className="lf-title lf-sub">Product</div>
                <div className="lf-pills lf-scroll">
                  <button className={`lf-pill ${product === 'all' ? 'on' : ''}`} onClick={() => { setProduct('all'); setPage(0); }}>All</button>
                  {products.map(p => (
                    <button key={p} className={`lf-pill ${product === p ? 'on' : ''}`} onClick={() => { setProduct(p); setPage(0); }}>{p}</button>
                  ))}
                </div>
              </div>

              <div className="lf-foot">
                <button className="link-btn lf-reset" onClick={clearFilters}>Reset all</button>
                <button className="btn-primary btn-small" onClick={() => setMenuOpen(false)}>Show {rows.length} orders</button>
              </div>
            </div>
          )}
        </div>

        <div className="lf-tags">
          {tags.map(tag => (
            <span key={tag.key} className="lf-tag">
              <span className="lf-tag-k">{tag.k}</span> {tag.v}
              <button onClick={tag.clear} aria-label={`Remove ${tag.k} filter`}><X size={12} /></button>
            </span>
          ))}
          {tags.length > 0 && <button className="link-btn lf-clear" onClick={clearFilters}>Clear all</button>}
        </div>

        <span className="lf-total">{rows.length} orders</span>
        <ExportMenu onExport={runExport} />
      </div>

      <div className="panel">
        <CardTable wideCols={[4]}>
          <table className="orders-table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Products</th><th className="num-col">Amount</th><th>Tracking</th><th>Courier</th><th>Inform customer</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={7} text="No orders here." />}
              {rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map(({ o, t }) => (
                <tr key={o.id} className={`clickable ${t.delayed ? 'fu-row-overdue' : ''}`} onClick={() => { setOpenId(o.id); setFocusTracking(false); }}>
                  <td className="order-cell">
                    <div className="order-no">{o.order_number}</div>
                    <div className="loc">{shortDate(o.created_at)} · {soldBy(o)}</div>
                  </td>
                  <td className="cust">{o.customer_name}<div className="loc">{o.city} · {o.phone}</div></td>
                  <td>
                    {o.items[0].product_name} × {o.items[0].quantity}
                    {o.items.length > 1 && <div className="loc">+ {o.items.length - 1} more</div>}
                  </td>
                  <td className="num-col">{rupees(o.total)}<div className="loc">{o.payment_method} · {o.payment_status}</div></td>
                  <td>
                    <TrackBar t={t} />
                    <div className="track-caption">
                      <span className={`chip ${t.delayed ? 'pending' : STAGE_CHIP[t.stage]}`}>{STAGE_LABEL[t.stage]}{t.delayed ? ' · late' : ''}</span>
                      {t.expected_at && <span className={`loc ${t.delayed ? 'text-warn' : ''}`}>{t.expectedIsEstimate ? 'est. ' : 'by '}{shortDate(t.expected_at)}</span>}
                    </div>
                  </td>
                  <td>{t.courier ? <>{t.courier}<div className="loc">{t.awb}</div></> : <span className="loc">—</span>}</td>
                  <td className="ord-inform" onClick={e => e.stopPropagation()}>
                    <a className="ord-wa" href={whatsappLink(o, t)} target="_blank" rel="noreferrer" title="Send the tracking update on WhatsApp">
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                    <button className="icon-btn eye-btn" title="Copy the update for SMS" aria-label={`Copy update for ${o.customer_name}`} onClick={() => copyUpdate(o, t)}>
                      <Copy size={15} />
                    </button>
                    <button className="icon-btn eye-btn" title="Track delivery status" aria-label={`Track delivery of ${o.order_number}`} onClick={() => { setOpenId(o.id); setFocusTracking(true); }}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
        {pages > 1 && (
          <div className="pager">
            <button className="kanban-btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <span className="loc">Page {safePage + 1} of {pages} · {rows.length} orders</span>
            <button className="kanban-btn" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        )}
        <div className="panel-note">Tracking shows the status changes the seller has recorded. Courier and AWB are not recorded yet, and delivery dates are estimates.</div>
      </div>

      {opened && (
        <OrderTrackDrawer
          order={opened.o}
          tracking={opened.t}
          complaints={complaints.filter(c => c.order_number === opened.o.order_number)}
          focusTracking={focusTracking}
          onClose={() => setOpenId(null)}
          onToast={onToast}
        />
      )}
    </>
  );
}

function OrderTrackDrawer({ order: o, tracking: t, complaints, focusTracking, onClose, onToast }: {
  order: SalesOrder;
  tracking: Tracking;
  complaints: Complaint[];
  focusTracking: boolean;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const reached = stageIndex(t.stage);
  const trackRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusTracking) trackRef.current?.scrollIntoView({ block: 'start' });
  }, [focusTracking, o.id]);
  const copyUpdate = async () => {
    try {
      await navigator.clipboard.writeText(customerUpdate(o, t));
      onToast('Update copied: paste it into WhatsApp or SMS');
    } catch {
      onToast('Could not copy. Please try again.');
    }
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="order-drawer" role="dialog" aria-label={`Order ${o.order_number}`}>
        <div className="drawer-head">
          <div>
            <h3>{o.order_number}</h3>
            <div className="loc">
              Placed {shortDateTime(o.created_at)} · {soldBy(o)} ·{' '}
              <span className={`chip ${t.delayed ? 'pending' : STAGE_CHIP[t.stage]}`}>{STAGE_LABEL[t.stage]}{t.delayed ? ' · late' : ''}</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="drawer-body">
          <section className="od-section">
            <div className="od-label">Customer</div>
            <div className="od-customer">
              <div>
                <strong>{o.customer_name}</strong>
                <div className="loc">{o.address}, {o.city}, {o.state} {o.pincode}</div>
              </div>
              <a className="call-btn" href={`tel:${o.phone}`}>{o.phone}</a>
            </div>
          </section>

          <section className="od-section">
            <div className="od-label">Products</div>
            <ul className="attn-list">
              {o.items.map(i => (
                <li key={i.product_name}>
                  <div><div className="name">{i.product_name}</div><div className="action">{i.quantity} × {rupees(i.price)}</div></div>
                  <div className="attn-side"><span className="strong">{rupees(i.price * i.quantity)}</span></div>
                </li>
              ))}
            </ul>
            <div className="od-customer" style={{ marginTop: 6 }}>
              <span className="loc">{o.payment_method} · {o.payment_status}</span>
              <strong>{rupees(o.total)}</strong>
            </div>
          </section>

          {t.stage !== 'cancelled' && (
            <section className="od-section" ref={trackRef}>
              <div className="od-label">Delivery tracking</div>
              <div className="od-row">
                <div><div className="loc">Courier</div>{t.courier ?? (t.stage === 'shipped' || t.stage === 'delivered' ? 'Courier not recorded' : 'Not shipped yet')}{t.awb && <div className="loc">AWB {t.awb}</div>}</div>
                <div>
                  <div className="loc">{t.stage === 'delivered' ? 'Delivered' : t.expectedIsEstimate ? 'Estimated delivery' : 'Expected delivery'}</div>
                  <span className={t.delayed ? 'text-warn' : undefined}>
                    {t.stage === 'delivered' ? shortDateTime(lastAt(t, 'delivered')!) : t.expected_at ? shortDate(t.expected_at) : '—'}
                    {t.delayed && ' · late'}
                  </span>
                </div>
              </div>
              <div className="step-track">
                {STAGE_FLOW.map((s, i) => (
                  <div key={s} className={`step ${i < reached ? 'done' : i === reached ? 'now' : ''}`}>
                    <span className="step-dot" />
                    <span className="step-name">{STAGE_LABEL[s]}</span>
                    <span className="step-time">{lastAt(t, s) ? shortDate(lastAt(t, s)!) : ''}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="od-section" ref={t.stage === 'cancelled' ? trackRef : undefined}>
            <div className="od-label">Tracking history</div>
            <ul className="track-timeline">
              {[...t.events].reverse().map((e, i) => (
                <li key={i}>
                  <div className="tt-title">{e.text}</div>
                  <div className="tt-time">{shortDateTime(e.at)} · {e.place}</div>
                </li>
              ))}
            </ul>
          </section>

          {complaints.length > 0 && (
            <section className="od-section">
              <div className="od-label">Complaints on this order</div>
              <ul className="attn-list">
                {complaints.map(c => (
                  <li key={c.id}>
                    <div><div className="name">{c.ticket} · {c.category}</div><div className="action">{c.description}</div></div>
                    <div className="attn-side"><span className="loc">{STATUS_LABEL[c.status]}</span></div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {o.notes && (
            <section className="od-section">
              <div className="od-label">Notes</div>
              <div>{o.notes}</div>
            </section>
          )}
        </div>

        <div className="drawer-actions">
          <a className="btn-primary btn-small" href={whatsappLink(o, t)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Send on WhatsApp</a>
          <button className="btn-secondary btn-small" onClick={copyUpdate}><Copy size={14} /> Copy update</button>
          <a className="btn-secondary btn-small" href={`tel:${o.phone}`}>Call customer</a>
        </div>
      </aside>
    </>
  );
}
