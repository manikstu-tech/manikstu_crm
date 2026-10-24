'use client';

// More, Notifications, Seller profile, Settings and Help & support.

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, BarChart3, Bell, BellOff, CheckCircle2, Download, HardDrive, HelpCircle, Info, LogOut, Mail, MapPin, MessageCircle,
  Phone, RefreshCw, Settings, ShieldCheck, Smartphone, Store, UserRound, Wallet, X,
} from 'lucide-react';
import pkg from '../../../package.json';
import { LOW_STOCK_LEVEL } from '../../../data/stockLevels';
import { MONTH, rupees, shortDate } from '../../../lib/format';
import { clearOfflineCache, promptInstall, storageUsed, useInstall, useOnline } from '../../../lib/pwa/client';
import { AppLink, useNav } from '../app/nav';
import { ORDER_REFRESH_MS, useSeller } from '../app/SellerProvider';
import { DELIVERY_ESTIMATE_DAYS, counts, nextPayoutDate } from '../sellerData';
import { Btn, Card, ConfirmSheet, EmptyState, KeyVal, ListRow, Notice, PageIntro, SectionHead, agoText, useNow } from './ui';

/* ---------- Sign out ---------- */

function useLogout() {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const form = <form ref={formRef} action="/api/auth/logout" method="post" hidden aria-hidden />;
  const sheet = (
    <ConfirmSheet
      open={ask}
      onClose={() => setAsk(false)}
      title="Log out?"
      message="You'll need your email or Staff ID and password to sign in again."
      confirmLabel="Log out"
      danger
      busy={busy}
      onConfirm={() => { setBusy(true); formRef.current?.submit(); }}
    />
  );
  return { open: () => setAsk(true), form, sheet };
}

/* ---------- More ---------- */

export function MoreScreen() {
  const { user, seller, myOrders, counts: c, unreadCount } = useSeller();
  const install = useInstall();
  const logout = useLogout();
  const due = myOrders.filter(o => o.payout === 'Due').reduce((s, o) => s + o.net, 0);
  const month = myOrders.filter(o => o.order.created_at.startsWith(MONTH) && counts(o)).reduce((s, o) => s + o.gross, 0);

  return (
    <div className="sx-stack">
      <PageIntro>Your account, money and reports.</PageIntro>
      <AppLink href="/seller/profile" className="sx-profile-card">
        <span className="sx-avatar sx-avatar-lg" aria-hidden>{user.initials}</span>
        <span className="sx-profile-text">
          <strong>{user.name}</strong>
          <span>{seller.business}</span>
          <span className="sx-muted">Seller ID {user.staffId} · {seller.city}</span>
        </span>
      </AppLink>

      <div className="sx-metrics sx-metrics-2">
        <AppLink href="/seller/payouts" className="sx-metric sx-metric-link">
          <Wallet size={18} aria-hidden className="sx-metric-icon" />
          <span className="sx-metric-value">{rupees(due)}</span>
          <span className="sx-metric-label">Payout due</span>
          <span className="sx-metric-sub">next payout day {shortDate(nextPayoutDate())}</span>
        </AppLink>
        <AppLink href="/seller/reports" className="sx-metric sx-metric-link">
          <BarChart3 size={18} aria-hidden className="sx-metric-icon" />
          <span className="sx-metric-value">{rupees(month)}</span>
          <span className="sx-metric-label">This month</span>
          <span className="sx-metric-sub">sales before commission</span>
        </AppLink>
      </div>

      <Card className="sx-card-flush" aria-label="Business">
        <ListRow icon={MapPin} label="Regional report" sub="Sales by district and town" href="/seller/regional" />
        <ListRow icon={Wallet} label="Payouts" sub="What you earn and when" href="/seller/payouts" badge={c.payoutsDue} />
        <ListRow icon={BarChart3} label="Reports" sub="Trends and downloads" href="/seller/reports" />
      </Card>
      <Card className="sx-card-flush" aria-label="Account">
        <ListRow icon={Bell} label="Notifications" href="/seller/notifications" badge={unreadCount} />
        <ListRow icon={UserRound} label="Seller profile" href="/seller/profile" />
        <ListRow icon={Settings} label="Settings" sub="App, data and sign-in" href="/seller/settings" />
        <ListRow icon={HelpCircle} label="Help & support" href="/seller/help" />
        {!install.standalone && (install.canPrompt || install.platform === 'ios') && (
          <ListRow icon={Download} label="Install the app" sub={install.platform === 'ios' ? 'Share → Add to Home Screen' : 'Add Manikstu Seller to your home screen'}
            onClick={install.canPrompt ? () => void promptInstall() : undefined} href={install.canPrompt ? undefined : '/seller/settings'} />
        )}
      </Card>
      <Card className="sx-card-flush">
        <ListRow icon={LogOut} label="Log out" danger onClick={logout.open} />
      </Card>
      <p className="sx-foot-note">Manikstu Seller · version {pkg.version}</p>
      {logout.form}
      {logout.sheet}
    </div>
  );
}

/* ---------- Notifications ---------- */

export function NotificationsScreen() {
  const { notifications, seenNotifs, markNotificationsSeen, dismissNotification, clearNotifications } = useSeller();
  const { navigate } = useNav();
  // Unread dots stay while the list is open; leaving it marks everything shown as read.
  const markRef = useRef(markNotificationsSeen);
  markRef.current = markNotificationsSeen;
  useEffect(() => () => markRef.current(), []);

  const icon = (t: string) => (t === 'warning' ? AlertTriangle : t === 'success' ? CheckCircle2 : Info);
  return (
    <div className="sx-stack">
      <div className="sx-row-between">
        <PageIntro>Things that need you, worked out from your orders and stock.</PageIntro>
      </div>
      {notifications.length === 0 ? (
        <EmptyState icon={BellOff} title="You're all caught up">New orders, low stock and payouts show up here.</EmptyState>
      ) : (
        <>
          <ul className="sx-notifs">
            {notifications.map(n => {
              const Icon = icon(n.type);
              const unread = !seenNotifs.includes(n.id);
              return (
                <li key={n.id} className={`sx-notif sx-notif-${n.type} ${unread ? 'sx-notif-unread' : ''}`}>
                  <button type="button" className="sx-notif-main" onClick={() => { markNotificationsSeen(); navigate(n.href); }}>
                    <span className="sx-notif-icon" aria-hidden><Icon size={19} /></span>
                    <span className="sx-notif-text">
                      <strong>{unread && <span className="sx-visually-hidden">Unread: </span>}{n.title}</strong>
                      <span>{n.message}</span>
                      <span className="sx-muted">{n.time}</span>
                    </span>
                    {unread && <span className="sx-unread-dot" aria-hidden />}
                  </button>
                  <button type="button" className="sx-icon-btn sx-notif-x" onClick={() => dismissNotification(n.id)} aria-label={`Dismiss: ${n.title}`}><X size={17} aria-hidden /></button>
                </li>
              );
            })}
          </ul>
          <div className="sx-actions">
            <Btn variant="secondary" onClick={markNotificationsSeen}>Mark all read</Btn>
            <Btn variant="secondary" onClick={clearNotifications}>Clear all</Btn>
          </div>
          <p className="sx-hint">A dismissed alert comes back if something new happens, such as another order to confirm.</p>
        </>
      )}
    </div>
  );
}

/* ---------- Profile ---------- */

export function ProfileScreen() {
  const { user, seller, myProducts } = useSeller();
  const active = myProducts.filter(p => p.is_active).length;
  return (
    <div className="sx-stack">
      <Card className="sx-profile-head">
        <span className="sx-avatar sx-avatar-xl" aria-hidden>{user.initials}</span>
        <h2>{user.name}</h2>
        <p>{seller.business}</p>
      </Card>
      <Card aria-labelledby="sx-pf-biz">
        <SectionHead id="sx-pf-biz" title="Business" />
        <dl className="sx-kvs">
          <KeyVal k="Business name" v={seller.business} />
          <KeyVal k="Owner" v={seller.owner} />
          <KeyVal k="City" v={seller.city} />
          <KeyVal k="GSTIN" v={<span className="sx-mono">{seller.gstin || '—'}</span>} />
        </dl>
      </Card>
      <Card aria-labelledby="sx-pf-acc">
        <SectionHead id="sx-pf-acc" title="Selling on Manikstu" />
        <dl className="sx-kvs">
          <KeyVal k="Seller ID" v={<span className="sx-mono">{user.staffId}</span>} />
          <KeyVal k="Commission" v={`${seller.commissionPct}% of each sale`} />
          <KeyVal k="Payouts" v={`Mondays, ${seller.payoutAfterDays} days after delivery`} />
          <KeyVal k="Products" v={`${active} live on the website · ${myProducts.length} in total`} />
        </dl>
      </Card>
      <Notice tone="info" icon={Info}>To change these details, contact your Manikstu account manager.</Notice>
    </div>
  );
}

/* ---------- Settings ---------- */

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function SettingsScreen() {
  const { user, live, lastSync, syncing, refresh, showToast } = useSeller();
  const install = useInstall();
  const online = useOnline();
  const now = useNow(15000);
  const logout = useLogout();
  const [used, setUsed] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [swActive, setSwActive] = useState<boolean | null>(null);

  useEffect(() => {
    void storageUsed().then(setUsed);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistration().then(r => setSwActive(!!r?.active));
    else setSwActive(false);
  }, []);

  const clear = async () => {
    setClearing(true);
    const n = await clearOfflineCache();
    setUsed(await storageUsed());
    setClearing(false);
    showToast(n ? 'Offline files cleared. They download again as you use the app.' : 'There were no offline files to clear.', 'info');
  };

  return (
    <div className="sx-stack">
      <Card aria-labelledby="sx-set-app">
        <SectionHead id="sx-set-app" title="App" />
        {install.standalone ? (
          <Notice tone="success" icon={CheckCircle2}>Installed. You&apos;re using Manikstu Seller from your home screen.</Notice>
        ) : install.canPrompt ? (
          <div className="sx-setting">
            <Smartphone size={20} aria-hidden />
            <div><strong>Install Manikstu Seller</strong><span>Opens full screen from your home screen, like any app.</span></div>
            <Btn size="sm" icon={Download} onClick={() => void promptInstall()}>Install</Btn>
          </div>
        ) : install.platform === 'ios' ? (
          <div className="sx-setting">
            <Smartphone size={20} aria-hidden />
            <div><strong>Add to your home screen</strong><span>In Safari, tap <b>Share</b> and then <b>Add to Home Screen</b>.</span></div>
          </div>
        ) : (
          <div className="sx-setting">
            <Smartphone size={20} aria-hidden />
            <div><strong>Install from your browser</strong><span>Use your browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>. If you don&apos;t see it, the app may already be installed.</span></div>
          </div>
        )}
      </Card>

      <Card aria-labelledby="sx-set-data">
        <SectionHead id="sx-set-data" title="Data & sync" />
        <dl className="sx-kvs">
          <KeyVal k="Data source" v={live ? 'Manikstu CRM (live)' : 'Offline demo: no CRM connected'} />
          <KeyVal k="Connection" v={online ? 'Online' : 'Offline'} />
          <KeyVal k="Last updated" v={agoText(lastSync, now)} />
        </dl>
        <p className="sx-hint">{live ? `Orders refresh every ${ORDER_REFRESH_MS / 1000} seconds while the app is open, and when you come back to it.` : 'Connect the CRM backend (CRM_API_BASE) to see real orders.'}</p>
        <Btn variant="secondary" icon={RefreshCw} busy={syncing} disabled={!online} onClick={() => void refresh()}>Refresh now</Btn>
      </Card>

      <Card aria-labelledby="sx-set-off">
        <SectionHead id="sx-set-off" title="Offline files" />
        <div className="sx-setting">
          <HardDrive size={20} aria-hidden />
          <div>
            <strong>{swActive ? 'Offline support is on' : swActive === false ? 'Offline support is off' : 'Checking…'}</strong>
            <span>{swActive ? 'App files (not your orders) are kept so the app opens quickly and shows an offline page with no connection.' : 'It turns on in the installed production app.'}{used !== null && used >= 50 * 1024 ? ` Using ${mb(used)} on this device.` : ''}</span>
          </div>
        </div>
        <Btn variant="secondary" busy={clearing} onClick={() => void clear()}>Clear offline files</Btn>
      </Card>

      <Card aria-labelledby="sx-set-acc">
        <SectionHead id="sx-set-acc" title="Sign-in" />
        <dl className="sx-kvs">
          <KeyVal k="Signed in as" v={user.name} />
          <KeyVal k="Seller ID" v={<span className="sx-mono">{user.staffId}</span>} />
          <KeyVal k="Session" v="Ends after 8 hours; sign in again then" />
        </dl>
        <div className="sx-setting">
          <ShieldCheck size={20} aria-hidden />
          <div><strong>Password</strong><span>Sellers can&apos;t change their password in the app yet. Ask your Manikstu account manager to reset it.</span></div>
        </div>
        <Btn variant="danger" icon={LogOut} onClick={logout.open}>Log out</Btn>
      </Card>

      <p className="sx-foot-note">Manikstu Seller · version {pkg.version} · motion follows your device&apos;s reduce-motion setting</p>
      {logout.form}
      {logout.sheet}
    </div>
  );
}

/* ---------- Help ---------- */

const SUPPORT = {
  phone: process.env.NEXT_PUBLIC_SELLER_SUPPORT_PHONE ?? '',
  email: process.env.NEXT_PUBLIC_SELLER_SUPPORT_EMAIL ?? '',
  whatsapp: process.env.NEXT_PUBLIC_SELLER_SUPPORT_WHATSAPP ?? '',
};

export function HelpScreen() {
  const { seller } = useSeller();
  const digits = (s: string) => s.replace(/[^\d+]/g, '');
  const hasContact = !!(SUPPORT.phone || SUPPORT.email || SUPPORT.whatsapp);
  const faq: [string, React.ReactNode][] = [
    ['How do I confirm a new order?', <>Open <b>Orders → New</b>, tap <b>Confirm order</b>, and enter the courier name and its tracking number. The order then moves to Confirmed, and the telecalling team calls the customer.</>],
    ['What happens after I confirm?', <>Mark the order <b>packed</b>, then <b>shipped</b> when the courier collects it (this takes the units off your stock), and <b>delivered</b> when it arrives. Follow every order in <b>Tracking</b>.</>],
    ['When should I reject an order?', <>Only when you can&apos;t fulfil it, for example if the product isn&apos;t available. The customer is told it can&apos;t be fulfilled.</>],
    ['What do low and out of stock mean?', <>Available stock is what is on the shelf minus units in orders that haven&apos;t shipped. Under {LOW_STOCK_LEVEL} available (or selling out within a week) is low; 0 is out of stock, and customers can&apos;t order it on the website.</>],
    ['When am I paid?', <>Delivered orders are paid on Mondays, {seller.payoutAfterDays} days after delivery, minus {seller.commissionPct}% Manikstu commission. Orders not delivered yet are on hold.</>],
    ['Why is the delivery date an estimate?', <>Courier tracking isn&apos;t connected yet, so the app estimates {DELIVERY_ESTIMATE_DAYS} days from shipping. An order past that date shows as Late.</>],
    ['Why did my courier details disappear?', <>The CRM doesn&apos;t store courier names and tracking numbers yet, so they stay on your phone only until the app is closed. Add them again from the order if needed.</>],
    ['Does the app work without internet?', <>It opens and shows an offline page, and screens you already opened keep what they showed. Confirming, restocking and editing need a connection.</>],
  ];
  return (
    <div className="sx-stack">
      <Card aria-labelledby="sx-help-contact">
        <SectionHead id="sx-help-contact" title="Contact Manikstu" />
        {hasContact ? (
          <div className="sx-card-flush">
            {SUPPORT.phone && <ListRow icon={Phone} label="Call support" sub={SUPPORT.phone} trailing={<a className="sx-btn sx-btn-soft sx-btn-sm" href={`tel:${digits(SUPPORT.phone)}`}>Call</a>} />}
            {SUPPORT.whatsapp && <ListRow icon={MessageCircle} label="WhatsApp" sub={SUPPORT.whatsapp} trailing={<a className="sx-btn sx-btn-soft sx-btn-sm" href={`https://wa.me/${digits(SUPPORT.whatsapp).replace('+', '')}`} target="_blank" rel="noopener noreferrer">Chat</a>} />}
            {SUPPORT.email && <ListRow icon={Mail} label="Email" sub={SUPPORT.email} trailing={<a className="sx-btn sx-btn-soft sx-btn-sm" href={`mailto:${SUPPORT.email}?subject=${encodeURIComponent(`Seller help · ${seller.business}`)}`}>Email</a>} />}
          </div>
        ) : (
          <Notice tone="info" icon={Store}>Contact your Manikstu account manager for help with orders, payouts or your account.</Notice>
        )}
      </Card>
      <Card aria-labelledby="sx-help-faq">
        <SectionHead id="sx-help-faq" title="Common questions" />
        <div className="sx-faq">
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
