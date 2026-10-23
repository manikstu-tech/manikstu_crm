'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, IndianRupee, PackageOpen, PackagePlus, PackageX, Pencil, Plus } from 'lucide-react';
import { LOW_STOCK_LEVEL } from '../../../data/stockLevels';
import { daysBefore, rupees, rupeesShort, shortDate, shortDateTime } from '../../../lib/format';
import { useNav } from '../app/nav';
import { useSeller } from '../app/SellerProvider';
import { COVER_DAYS, STOCK_LABEL, StockTab, inStockTab, stockRows } from '../SellerStock';
import { Btn, Card, Chip, EmptyState, Metric, PageIntro, ProductThumb, SearchField, SectionHead, Segmented, Tone, useShowMore } from './ui';

const STOCK_TONE: Record<string, Tone> = { in: 'success', low: 'warn', out: 'danger' };

export default function StockScreen() {
  const { myProducts, myOrders, movements, openRestock, openEditProduct, openAddProduct } = useSeller();
  const { query, setQuery } = useNav();
  const f = query.get('filter');
  const tab: StockTab = f === 'low' || f === 'out' || f === 'restock' ? f : 'all';
  const [q, setQ] = useState('');

  // ?add=1 (Home → Add product) opens the form once.
  useEffect(() => {
    if (query.get('add') === '1') { openAddProduct(); setQuery({ add: null }); }
  }, [query, openAddProduct, setQuery]);

  const rows = useMemo(() => stockRows(myProducts, myOrders), [myProducts, myOrders]);
  const count = (t: StockTab) => rows.filter(r => inStockTab(r, t)).length;
  const needle = q.trim().toLowerCase();
  const shownRows = rows
    .filter(r => inStockTab(r, tab))
    .filter(r => !needle || [r.p.name, r.p.category, r.p.size, r.p.sku ?? ''].some(v => v.toLowerCase().includes(needle)))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.available - b.available);
  const { shown, more } = useShowMore(shownRows, 20, `${tab}|${needle}`);

  const units = rows.reduce((a, r) => a + r.stock, 0);
  const value = rows.reduce((a, r) => a + r.stock * (r.p.price ?? 0), 0);
  const reserved = rows.reduce((a, r) => a + r.reserved, 0);
  const waiting = rows.flatMap(r => r.waiting.map(o => ({ r, o })));

  // Movements: restocks recorded in this session, and units that left with shipped orders in the last 14 days.
  const nameToId = new Map(myProducts.map(p => [p.name, p.id]));
  const moves = [
    ...movements.map(m => ({ key: `r-${m.id}`, productId: m.productId, units: m.units, note: m.note ? `Restocked · ${m.note}` : 'Restocked', at: m.at })),
    ...myOrders.flatMap(o => {
      const at = o.order.status_history.find(h => h.status === 'shipped')?.at;
      if (!at || daysBefore(at) >= 14 || o.order.status === 'cancelled') return [];
      return o.items.map(i => ({ key: `s-${o.order.id}-${i.product_name}`, productId: nameToId.get(i.product_name) ?? 0, units: -i.quantity, note: `Shipped · ${o.order.order_number}`, at }));
    }),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  const productOf = (id: number) => myProducts.find(p => p.id === id);
  const setTab = (t: StockTab) => setQuery({ filter: t === 'all' ? null : t });

  return (
    <div className="sx-stack">
      <PageIntro>What you have, what is promised to customers, and what to restock.</PageIntro>
      <div className="sx-metrics sx-metrics-2">
        <Metric icon={Boxes} value={units.toLocaleString('en-IN')} label="Units in stock" sub={`${reserved} reserved for orders`} />
        <Metric icon={IndianRupee} value={rupeesShort(value)} label="Stock value" sub="at your prices" />
        <Metric icon={AlertTriangle} value={count('low')} label="Low stock" sub={`under ${LOW_STOCK_LEVEL} or < 7 days`} tone={count('low') ? 'warn' : undefined} onClick={() => setTab('low')} pressed={tab === 'low'} />
        <Metric icon={PackageX} value={count('out')} label="Out of stock" sub={count('out') ? 'not orderable' : 'none'} tone={count('out') ? 'danger' : undefined} onClick={() => setTab('out')} pressed={tab === 'out'} />
      </div>

      <div className="sx-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Search products…" label="Search products" />
        <Btn icon={Plus} onClick={openAddProduct} className="sx-toolbar-btn">Add</Btn>
      </div>
      <Segmented<StockTab>
        label="Show products"
        value={tab}
        onChange={setTab}
        options={[
          { key: 'all', label: 'All', count: count('all') },
          { key: 'low', label: 'Low', count: count('low'), tone: 'warn' },
          { key: 'out', label: 'Out of stock', count: count('out'), tone: 'warn' },
          { key: 'restock', label: 'Needs restock', count: count('restock') },
        ]}
      />

      {shownRows.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState icon={PackageOpen} title="No products yet" action={<Btn icon={Plus} onClick={openAddProduct}>Add your first product</Btn>}>
            Products you list here appear on the Manikstu website.
          </EmptyState>
        ) : (
          <EmptyState icon={Boxes} title={needle ? 'No products match' : tab === 'out' ? 'Nothing is out of stock' : tab === 'low' ? 'Nothing is running low' : 'Nothing to restock'}>
            {needle ? 'Try a different search.' : 'Good news.'}
          </EmptyState>
        )
      ) : (
        <div className="sx-cards">
          {shown.map(r => (
            <article key={r.p.id} className="sx-prod" aria-labelledby={`sx-p-${r.p.id}`}>
              <div className="sx-prod-top">
                <ProductThumb product={r.p} name={r.p.name} size={60} />
                <div className="sx-prod-main">
                  <h3 id={`sx-p-${r.p.id}`}>{r.p.name}</h3>
                  <span>{[r.p.size, r.p.category].filter(Boolean).join(' · ')}{r.p.is_active ? '' : ' · hidden on website'}</span>
                  <span className="sx-prod-price">{r.p.price !== null && r.p.price > 0 ? rupees(r.p.price) : <span className="sx-tone-warn">No price · can&apos;t be ordered</span>}</span>
                </div>
                <Chip tone={STOCK_TONE[r.status]}>{STOCK_LABEL[r.status]}</Chip>
              </div>
              <dl className="sx-prod-nums">
                <div><dt>In stock</dt><dd>{r.stock}</dd></div>
                <div><dt>Reserved</dt><dd>{r.reserved}</dd></div>
                <div><dt>Available</dt><dd className={r.status !== 'in' ? `sx-tone-${r.status === 'out' ? 'danger' : 'warn'}` : undefined}>{r.available}</dd></div>
              </dl>
              <p className="sx-prod-cover">
                {r.daysLeft === null ? 'Not selling in the last 30 days' : r.daysLeft === 0 ? 'Out now' : `Lasts about ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} (${r.perDay.toFixed(1)}/day)`}
                {r.short > 0 && <span className="sx-tone-danger"> · {r.short} short for orders</span>}
                {r.suggested > 0 && <> · restock <strong>{r.suggested}</strong> for {COVER_DAYS} days</>}
              </p>
              <div className="sx-order-actions">
                <Btn variant="soft" icon={PackagePlus} onClick={() => openRestock(r.p, r.suggested)}>Restock</Btn>
                <Btn variant="secondary" icon={Pencil} onClick={() => openEditProduct(r.p)} aria-label={`Edit ${r.p.name}`}>Edit</Btn>
              </div>
            </article>
          ))}
        </div>
      )}
      {more}

      {waiting.length > 0 && (
        <Card aria-labelledby="sx-st-wait">
          <SectionHead id="sx-st-wait" title="Waiting for stock" meta={`${waiting.length} order${waiting.length === 1 ? '' : 's'} can't be filled yet`} />
          <ul className="sx-plain-list">
            {waiting.map(({ r, o }) => (
              <li key={`${r.p.id}-${o.order.id}`}>
                <strong>{o.order.order_number}</strong> · {o.order.customer_name}
                <span>{r.p.name} × {o.items.find(i => i.product_name === r.p.name)?.quantity} · placed {shortDate(o.order.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-labelledby="sx-st-moves">
        <SectionHead id="sx-st-moves" title="Stock movements" meta="Restocks this session · shipments in the last 14 days" />
        {moves.length === 0 ? (
          <EmptyState icon={Boxes} title="No stock movements yet" />
        ) : (
          <ul className="sx-moves">
            {moves.map(m => (
              <li key={m.key}>
                <ProductThumb product={productOf(m.productId)} name={productOf(m.productId)?.name ?? '?'} size={36} />
                <span className="sx-moves-main"><strong>{productOf(m.productId)?.name ?? '—'}</strong><span>{m.note} · {shortDateTime(m.at)}</span></span>
                <span className={`sx-delta ${m.units > 0 ? 'sx-delta-in' : 'sx-delta-out'}`}>
                  {m.units > 0 ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}{m.units > 0 ? `+${m.units}` : m.units}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="sx-hint">The CRM doesn&apos;t keep a stock history yet, so restocks from earlier sessions aren&apos;t listed.</p>
      </Card>
    </div>
  );
}
