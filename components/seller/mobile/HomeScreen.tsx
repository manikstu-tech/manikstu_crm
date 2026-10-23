'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Boxes, ChevronRight, Download, MapPin, PackageCheck, PackagePlus, Plus, ShoppingCart, Truck, Wallet, X } from 'lucide-react';
import { LOW_STOCK_LEVEL } from '../../../data/stockLevels';
import { TODAY } from '../../../data/today';
import { MONTH, rupees, rupeesShort, shortDate } from '../../../lib/format';
import { promptInstall, useInstall } from '../../../lib/pwa/client';
import { AppLink, useNav } from '../app/nav';
import { useSeller } from '../app/SellerProvider';
import { ORDER_STATUS_LABEL, counts, nextPayoutDate } from '../sellerData';
import { BarChart, HBars, Spark } from './charts';
import { STEP_SHORT, useStageRunner } from './dialogs';
import { Btn, Card, Chip, EmptyState, Metric, ORDER_TONE, ProductThumb, SectionHead } from './ui';

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const INSTALL_DISMISS_KEY = 'mk-seller-install-dismissed';

function InstallCard() {
  const install = useInstall();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(INSTALL_DISMISS_KEY) === '1'); } catch { setDismissed(false); }
  }, []);
  if (dismissed || install.standalone || install.installed) return null;
  if (!install.canPrompt && install.platform !== 'ios') return null;
  const hide = () => { setDismissed(true); try { window.localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch { /* ignore */ } };
  return (
    <div className="sx-install" role="region" aria-label="Install the app">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div className="sx-install-text">
        <strong>Install Manikstu Seller</strong>
        {install.platform === 'ios'
          ? <span>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</span>
          : <span>Open it from your home screen, like any app.</span>}
      </div>
      {install.canPrompt && <Btn size="sm" icon={Download} onClick={() => void promptInstall()}>Install</Btn>}
      <button type="button" className="sx-icon-btn sx-install-close" onClick={hide} aria-label="Not now"><X size={18} aria-hidden /></button>
    </div>
  );
}

export default function HomeScreen() {
  const { user, seller, myOrders, myProducts, stock, shipmentDetails, nextManualStep, openConfirmCard, busyOrderIds, counts: c } = useSeller();
  const { navigate } = useNav();
  const stage = useStageRunner();

  const month = useMemo(() => myOrders.filter(o => o.order.created_at.startsWith(MONTH) && counts(o)), [myOrders]);
  const monthGross = month.reduce((s, o) => s + o.gross, 0);
  const monthUnits = month.reduce((s, o) => s + o.units, 0);
  const due = myOrders.filter(o => o.payout === 'Due').reduce((s, o) => s + o.net, 0);

  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = new Date(`${TODAY}T00:00:00`);
    d.setDate(d.getDate() - (29 - i));
    const key = dateKey(d);
    const rows = myOrders.filter(o => o.order.created_at.startsWith(key) && counts(o));
    return { key, gross: rows.reduce((s, o) => s + o.gross, 0), count: rows.length };
  }), [myOrders]);
  const total30 = days.reduce((s, d) => s + d.gross, 0);
  const avg30 = Math.round(total30 / 30);
  const today = days[days.length - 1];

  const needsAction = myOrders.filter(o => ['pending', 'confirmed', 'ready_for_dispatch'].includes(o.order.status))
    .sort((a, b) => Number(b.order.status === 'pending') - Number(a.order.status === 'pending') || b.order.created_at.localeCompare(a.order.created_at));

  const lowStock = stock.filter(s => s.status !== 'in').sort((a, b) => a.available - b.available);
  const top = myProducts
    .map(p => {
      const lines = month.flatMap(o => o.items.filter(i => i.product_name === p.name));
      return { p, revenue: lines.reduce((s, i) => s + i.price * i.quantity, 0), units: lines.reduce((s, i) => s + i.quantity, 0) };
    })
    .filter(r => r.units > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const firstName = user.name.split(' ')[0];

  return (
    <div className="sx-stack-lg">
      <div className="sx-greet">
        <div>
          <h1 className="sx-greet-title">Namaskar, {firstName}</h1>
          <p className="sx-greet-sub">{seller.business}</p>
        </div>
      </div>

      <section className="sx-hero" aria-labelledby="sx-hero-label">
        <div className="sx-hero-top">
          <div>
            <span id="sx-hero-label" className="sx-hero-label">Sales · this month</span>
            <span className="sx-hero-value">{rupees(monthGross)}</span>
            <span className="sx-hero-sub">Last 30 days {rupees(total30)}{today.gross > 0 ? ` · +${rupeesShort(today.gross)} today` : ''}</span>
          </div>
          <Spark values={days.slice(-14).map(d => d.gross)} />
        </div>
        <AppLink href="/seller/payouts" className="sx-hero-foot">
          <Wallet size={17} aria-hidden />
          <span>Payout due <strong>{rupees(due)}</strong> · {shortDate(nextPayoutDate())}</span>
          <ChevronRight size={17} aria-hidden />
        </AppLink>
      </section>

      <div className="sx-metrics sx-metrics-3">
        <Metric icon={ShoppingCart} value={month.length} label="Orders" sub="this month" href="/seller/orders?tab=all" />
        <Metric icon={PackageCheck} value={monthUnits} label="Units sold" sub="this month" href="/seller/reports" />
        <Metric icon={AlertTriangle} value={c.toConfirm + c.toShip} label="Need action" sub={c.toConfirm ? `${c.toConfirm} to confirm` : c.toShip ? `${c.toShip} to ship` : 'all clear'} tone={c.toConfirm + c.toShip ? 'danger' : 'good'}
          href={c.toConfirm ? '/seller/orders?tab=new' : '/seller/tracking?tab=confirmed'} />
      </div>

      <InstallCard />

      <Card aria-labelledby="sx-h-action">
        <SectionHead id="sx-h-action" title="Needs your action" meta={needsAction.length ? `${needsAction.length} order${needsAction.length === 1 ? '' : 's'}` : undefined}
          action={<AppLink href="/seller/orders?tab=new" className="sx-link">View all</AppLink>} />
        {needsAction.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing waiting">New orders to confirm and orders to ship show up here.</EmptyState>
        ) : (
          <ul className="sx-mini-orders">
            {needsAction.slice(0, 4).map(o => {
              const step = nextManualStep(o.order, shipmentDetails[o.order.id]);
              const first = o.items[0];
              return (
                <li key={o.order.id}>
                  <AppLink href={`/seller/orders/${o.order.id}`} className="sx-mini-order">
                    <ProductThumb product={myProducts.find(p => p.name === first?.product_name)} name={first?.product_name ?? '?'} size={44} />
                    <span className="sx-mini-main">
                      <span className="sx-mini-top"><strong>{o.order.order_number}</strong><Chip tone={ORDER_TONE[o.order.status]}>{ORDER_STATUS_LABEL[o.order.status]}</Chip></span>
                      <span className="sx-mini-sub">{o.order.customer_name} · {o.order.city}</span>
                      <span className="sx-mini-sub">{first?.product_name} × {first?.quantity}{o.items.length > 1 ? ` +${o.items.length - 1} more` : ''} · <b>{rupees(o.gross)}</b></span>
                    </span>
                  </AppLink>
                  <div className="sx-mini-act">
                    {o.order.status === 'pending' ? (
                      <Btn size="sm" onClick={() => openConfirmCard(o.order.id)} disabled={busyOrderIds.includes(o.order.id)}>Confirm</Btn>
                    ) : step ? (
                      <Btn size="sm" variant="soft" busy={stage.runningId === o.order.id || busyOrderIds.includes(o.order.id)} onClick={() => void stage.run(o.order.id, step.action)}>{STEP_SHORT[step.action]}</Btn>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card aria-labelledby="sx-h-sales">
        <SectionHead id="sx-h-sales" title="Sales overview" meta={`Last 30 days · ${rupees(total30)} before commission`} />
        <div className="sx-facts">
          <div><span>Daily average</span><strong>{rupees(avg30)}</strong></div>
          <div><span>Today</span><strong>{rupees(today.gross)}</strong><small>{today.count} order{today.count === 1 ? '' : 's'}</small></div>
        </div>
        <BarChart
          ariaLabel="Daily sales for the last 30 days"
          highlightKey={TODAY}
          formatMax={rupeesShort}
          points={days.map(d => ({ key: d.key, label: shortDate(d.key), value: d.gross, detail: `${shortDate(d.key)}: ${rupees(d.gross)} · ${d.count} order${d.count === 1 ? '' : 's'}` }))}
        />
      </Card>

      <Card aria-labelledby="sx-h-low">
        <SectionHead id="sx-h-low" title="Low stock" meta={lowStock.length ? `${lowStock.filter(s => s.status === 'out').length} out · ${lowStock.filter(s => s.status === 'low').length} low` : undefined}
          action={<AppLink href="/seller/stock?filter=low" className="sx-link">View all</AppLink>} />
        {lowStock.length === 0 ? (
          <EmptyState icon={Boxes} title="Stock looks healthy">Every active product has at least {LOW_STOCK_LEVEL} units available.</EmptyState>
        ) : (
          <ul className="sx-plist">
            {lowStock.slice(0, 4).map(({ p, available, status }) => (
              <li key={p.id}>
                <AppLink href={`/seller/stock?filter=${status === 'out' ? 'out' : 'low'}`} className="sx-prow">
                  <ProductThumb product={p} name={p.name} size={40} />
                  <span className="sx-prow-main"><strong>{p.name}</strong><span>{p.size} · {p.category}</span></span>
                  <Chip tone={status === 'out' ? 'danger' : 'warn'}>{status === 'out' ? 'Out of stock' : `${available} left`}</Chip>
                </AppLink>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card aria-labelledby="sx-h-top">
        <SectionHead id="sx-h-top" title="Top products" meta="This month" action={<AppLink href="/seller/reports" className="sx-link">Reports</AppLink>} />
        {top.length === 0 ? (
          <EmptyState icon={BarChart3} title="No sales yet this month">Your best sellers will show here.</EmptyState>
        ) : (
          <HBars
            ariaLabel="Top products by sales this month"
            rows={top.map(r => ({ key: String(r.p.id), label: r.p.name, value: r.revenue, display: rupees(r.revenue), sub: `${r.units} unit${r.units === 1 ? '' : 's'}`, lead: <ProductThumb product={r.p} name={r.p.name} size={36} /> }))}
          />
        )}
      </Card>

      <section aria-labelledby="sx-h-quick">
        <h2 id="sx-h-quick" className="sx-h2">Quick actions</h2>
        <div className="sx-quick-grid">
          <button type="button" className="sx-quick-tile" onClick={() => navigate('/seller/stock?add=1')}><Plus size={22} aria-hidden /><span>Add product</span></button>
          <AppLink href="/seller/stock?filter=restock" className="sx-quick-tile"><PackagePlus size={22} aria-hidden /><span>Restock</span></AppLink>
          <AppLink href="/seller/tracking" className="sx-quick-tile"><Truck size={22} aria-hidden /><span>Track orders</span></AppLink>
          <AppLink href="/seller/regional" className="sx-quick-tile"><MapPin size={22} aria-hidden /><span>Regional report</span></AppLink>
        </div>
      </section>

      {stage.sheet}
    </div>
  );
}
