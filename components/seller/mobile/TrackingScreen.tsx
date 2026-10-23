'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, MapPin, PackageCheck, Pencil, Truck, Warehouse } from 'lucide-react';
import { daysBefore, rupees, shortDate, shortDateTime } from '../../../lib/format';
import { STAGE_FLOW, STAGE_LABEL, Tracking, stageIndex } from '../../telecaller/orderTracking';
import { AppLink, useNav } from '../app/nav';
import { useSeller } from '../app/SellerProvider';
import { TRACK_TABS, TrackTab, courierMissing, inTrackTab } from '../SellerTracking';
import { DELIVERY_ESTIMATE_DAYS, SellerOrder, sellerTrackingFor } from '../sellerData';
import { STEP_SHORT, useStageRunner } from './dialogs';
import { Btn, Chip, EmptyState, KeyVal, Notice, PageIntro, SearchField, Segmented, Sheet, Tone, useShowMore } from './ui';

const SHORT: Record<string, string> = { placed: 'Placed', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out', delivered: 'Delivered' };
const STAGE_TONE: Record<string, Tone> = { placed: 'new', confirmed: 'confirmed', packed: 'packed', shipped: 'transit', out_for_delivery: 'transit', delivered: 'delivered', cancelled: 'muted' };

const lastAt = (t: Tracking, stage: string) => t.events.find(e => e.stage === stage)?.at ?? null;

/** The order's progress as six steps, with the dates reached. */
export function TrackSteps({ t }: { t: Tracking }) {
  const at = stageIndex(t.stage);
  if (t.stage === 'cancelled') return null;
  return (
    <ol className={`sx-steps ${t.delayed ? 'sx-steps-late' : ''}`} aria-label={`Progress: ${STAGE_LABEL[t.stage]}, step ${at + 1} of ${STAGE_FLOW.length}${t.delayed ? ', late' : ''}`}>
      {STAGE_FLOW.map((s, i) => {
        const when = lastAt(t, s);
        return (
          <li key={s} className={i < at ? 'sx-step-done' : i === at ? 'sx-step-now' : ''}>
            <span className="sx-step-dot" aria-hidden />
            <span className="sx-step-name">{SHORT[s]}</span>
            <span className="sx-step-date">{when ? shortDate(when) : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

function TrackingDetails({ x, onClose, stage }: { x: { o: SellerOrder; t: Tracking }; onClose: () => void; stage: ReturnType<typeof useStageRunner> }) {
  const { shipmentDetails, nextManualStep, openConfirmCard, busyOrderIds } = useSeller();
  const { o, t } = x;
  const details = shipmentDetails[o.order.id];
  const step = nextManualStep(o.order, details);
  const busy = busyOrderIds.includes(o.order.id) || stage.runningId === o.order.id;
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Tracking · ${o.order.order_number}`}
      footer={
        <div className="sx-actions">
          <AppLink href={`/seller/orders/${o.order.id}`} className="sx-btn sx-btn-secondary sx-btn-md">Order details</AppLink>
          {step && <Btn busy={busy} onClick={() => void stage.run(o.order.id, step.action)}>{STEP_SHORT[step.action]}</Btn>}
        </div>
      }
    >
      <div className="sx-stack">
        <div className="sx-contact">
          <MapPin size={20} aria-hidden />
          <div><strong>{o.order.customer_name}</strong><span>{[o.order.address, o.order.city, o.order.state, o.order.pincode].filter(Boolean).join(', ')}</span></div>
        </div>
        <p className="sx-hint">{o.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ')} · {rupees(o.gross)}</p>
        {t.stage !== 'cancelled' && <TrackSteps t={t} />}
        <dl className="sx-kvs">
          <KeyVal k="Status" v={<Chip tone={t.delayed ? 'late' : STAGE_TONE[t.stage]}>{STAGE_LABEL[t.stage]}{t.delayed ? ' · late' : ''}</Chip>} />
          <KeyVal k="Courier" v={t.courier ?? <span className="sx-muted">{o.order.status === 'pending' ? 'Added when you confirm' : courierMissing(o)}</span>} />
          {t.awb && <KeyVal k="Tracking / AWB" v={<span className="sx-mono">{t.awb}</span>} />}
          {t.stage === 'delivered'
            ? <KeyVal k="Delivered" v={shortDateTime(lastAt(t, 'delivered') ?? '')} />
            : t.expected_at && <KeyVal k="Est. delivery" v={<span className={t.delayed ? 'sx-tone-danger' : undefined}>{shortDate(t.expected_at)}{t.delayed ? ' · late' : ''}</span>} />}
        </dl>
        {o.order.status !== 'pending' && t.stage !== 'cancelled' && (
          <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => openConfirmCard(o.order.id)}>{details?.courier ? 'Edit courier details' : 'Add courier details'}</Btn>
        )}
        {t.delayed && (
          <Notice tone="danger" icon={AlertTriangle}>Past the estimated delivery date. Check with the courier and update the customer.</Notice>
        )}
        <section aria-labelledby="sx-t-hist">
          <h3 id="sx-t-hist" className="sx-h3">Tracking history</h3>
          <ol className="sx-timeline">
            {[...t.events].reverse().map((e, i) => (
              <li key={i}>
                <span className="sx-tl-title">{e.text}</span>
                <span className="sx-tl-sub">{shortDateTime(e.at)} · {e.place}</span>
              </li>
            ))}
          </ol>
        </section>
        <p className="sx-hint">Delivery steps are the ones you mark here. Courier scans aren&apos;t connected, so delivery is estimated at {DELIVERY_ESTIMATE_DAYS} days from shipping.</p>
      </div>
    </Sheet>
  );
}

export default function TrackingScreen() {
  const { myOrders, shipmentDetails, nextManualStep, busyOrderIds } = useSeller();
  const { query, setQuery } = useNav();
  const tabParam = query.get('tab') as TrackTab | null;
  const tab: TrackTab = TRACK_TABS.some(t => t.key === tabParam) ? (tabParam as TrackTab) : 'all';
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const stage = useStageRunner();

  const tracked = useMemo(() => myOrders.map(o => ({ o, t: sellerTrackingFor(o.order, shipmentDetails[o.order.id]) })), [myOrders, shipmentDetails]);

  // Arriving for one order (Track buttons, links): open its tracking over the full list.
  const focus = query.get('order');
  useEffect(() => {
    if (!focus) return;
    const hit = tracked.find(x => x.o.order.order_number === focus);
    if (!hit) return; // not loaded yet: try again when the list updates
    setOpenId(hit.o.order.id);
    setQuery({ order: null });
  }, [focus, tracked, setQuery]);

  const needle = q.trim().toLowerCase();
  const matches = (x: typeof tracked[number]) =>
    !needle || [x.o.order.order_number, x.o.order.customer_name, x.o.order.city, x.t.awb ?? '', x.t.courier ?? ''].some(v => v.toLowerCase().includes(needle));
  const count = (k: TrackTab) => tracked.filter(x => inTrackTab(x.o, x.t, k) && matches(x)).length;
  const rows = tracked
    .filter(x => inTrackTab(x.o, x.t, tab))
    .filter(matches)
    .sort((a, b) => Number(b.t.delayed) - Number(a.t.delayed) || (a.t.expected_at ?? '9').localeCompare(b.t.expected_at ?? '9') || b.o.order.created_at.localeCompare(a.o.order.created_at));
  const { shown, more } = useShowMore(rows, 15, `${tab}|${needle}`);

  const pickup = tracked.filter(x => x.o.order.status === 'confirmed' || x.o.order.status === 'ready_for_dispatch').length;
  const transit = tracked.filter(x => x.t.stage === 'shipped').length;
  const out = tracked.filter(x => x.t.stage === 'out_for_delivery').length;
  const late = tracked.filter(x => x.t.delayed).length;
  const delivered7 = tracked.filter(x => x.t.stage === 'delivered' && daysBefore(lastAt(x.t, 'delivered') ?? '2000-01-01') < 7).length;
  const open = tracked.find(x => x.o.order.id === openId);
  const setTab = (k: TrackTab) => setQuery({ tab: k === 'all' ? null : k });

  const counters: { key: TrackTab; icon: typeof Truck; n: number; label: string; sub?: string; danger?: boolean }[] = [
    { key: 'confirmed', icon: Warehouse, n: pickup, label: 'Pickup' },
    { key: 'active', icon: Truck, n: transit, label: 'In transit' },
    { key: 'active', icon: MapPin, n: out, label: 'Out for delivery' },
    { key: 'late', icon: AlertTriangle, n: late, label: 'Late', danger: true },
    { key: 'delivered', icon: CheckCircle2, n: delivered7, label: 'Delivered', sub: '7 days' },
  ];

  return (
    <div className="sx-stack">
      <PageIntro>Where each order is: courier, tracking number and expected delivery.</PageIntro>
      <div className="sx-counters" role="group" aria-label="Shipments by status">
        {counters.map(c => {
          const Icon = c.icon;
          return (
            <button key={c.label} type="button" className={`sx-counter ${c.danger && c.n ? 'sx-counter-danger' : ''}`} aria-pressed={tab === c.key} onClick={() => setTab(c.key)}>
              <Icon size={18} aria-hidden />
              <strong>{c.n}</strong>
              <span>{c.label}{c.sub && <><br />{c.sub}</>}</span>
            </button>
          );
        })}
      </div>
      <Segmented<TrackTab>
        label="Show shipments"
        value={tab}
        onChange={setTab}
        options={[...TRACK_TABS.filter(t => t.key === 'all'), ...TRACK_TABS.filter(t => t.key !== 'all')]
          .map(t => ({ key: t.key, label: t.key === 'new' ? 'New' : t.label, count: count(t.key), tone: t.key === 'late' ? 'warn' : undefined }))}
      />
      <SearchField value={q} onChange={setQ} placeholder="Search order, customer, city, AWB…" label="Search shipments" />

      {rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title={needle ? 'No shipments match' : 'No shipments here'}>
          {needle ? 'Try a different search.' : tab === 'late' ? 'Nothing is past its estimated delivery date.' : 'Orders show here once they are placed.'}
        </EmptyState>
      ) : (
        <div className="sx-cards">
          {shown.map(({ o, t }) => {
            const step = nextManualStep(o.order, shipmentDetails[o.order.id]);
            const busy = busyOrderIds.includes(o.order.id) || stage.runningId === o.order.id;
            return (
              <article key={o.order.id} className={`sx-ship ${t.delayed ? 'sx-ship-late' : ''}`} aria-labelledby={`sx-s-${o.order.id}`}>
                <div className="sx-order-top">
                  <button type="button" className="sx-order-num sx-stretch sx-linklike" id={`sx-s-${o.order.id}`} onClick={() => setOpenId(o.order.id)}>{o.order.order_number}</button>
                  <Chip tone={t.delayed ? 'late' : STAGE_TONE[t.stage]}>{STAGE_LABEL[t.stage]}{t.delayed ? ' · late' : ''}</Chip>
                </div>
                <div className="sx-order-meta">{o.order.customer_name} · {o.order.city}{o.order.pincode ? `, ${o.order.pincode}` : ''}</div>
                <div className="sx-ship-line">
                  {o.items[0]?.product_name} × {o.items[0]?.quantity}{o.items.length > 1 ? ` +${o.items.length - 1} more` : ''}
                  <span className="sx-ship-eta">
                    {t.stage === 'delivered' ? `Delivered ${shortDate(lastAt(t, 'delivered') ?? o.order.created_at)}` : t.expected_at ? `Est. ${shortDate(t.expected_at)}` : ''}
                  </span>
                </div>
                <div className="sx-ship-courier">
                  <Truck size={15} aria-hidden />
                  {t.courier ? <span>{t.courier}{t.awb ? <> · <span className="sx-mono">{t.awb}</span></> : null}</span>
                    : <span className="sx-muted">{o.order.status === 'pending' ? 'Courier added when you confirm' : courierMissing(o)}</span>}
                </div>
                {t.stage !== 'cancelled' && <TrackSteps t={t} />}
                <div className="sx-order-actions sx-above">
                  <Btn variant="secondary" icon={Eye} onClick={() => setOpenId(o.order.id)}>Details</Btn>
                  {o.order.status === 'pending'
                    ? <AppLink href={`/seller/orders/${o.order.id}`} className="sx-btn sx-btn-soft sx-btn-md">Review order</AppLink>
                    : step && <Btn variant="soft" busy={busy} onClick={() => void stage.run(o.order.id, step.action)}>{STEP_SHORT[step.action]}</Btn>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {more}
      {open && <TrackingDetails x={open} onClose={() => setOpenId(null)} stage={stage} />}
      {stage.sheet}
    </div>
  );
}
