'use client';

// The phone / tablet frame of the seller app: compact header, the current screen, and the
// thumb-reach bottom navigation. Sheets and toasts sit on top.

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bell, Boxes, CheckCircle2, Home, Info, LayoutGrid, RefreshCw, ShoppingCart, Truck, WifiOff, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useOnline } from '../../../lib/pwa/client';
import { AppLink, useNav } from '../app/nav';
import { SCREEN_TAB, SCREEN_TITLE, SUB_SCREENS } from '../app/routes';
import { useSeller } from '../app/SellerProvider';
import { ConfirmOrderSheet, ProductFormSheet, RestockSheet } from './dialogs';
import TopNav from './TopNav';
import HomeScreen from './HomeScreen';
import OrdersScreen from './OrdersScreen';
import OrderDetailScreen from './OrderDetailScreen';
import StockScreen from './StockScreen';
import TrackingScreen from './TrackingScreen';
import RegionalScreen from './RegionalScreen';
import PayoutsScreen from './PayoutsScreen';
import ReportsScreen from './ReportsScreen';
import { HelpScreen, MoreScreen, NotificationsScreen, ProfileScreen, SettingsScreen } from './AccountScreens';

const TABS: { key: 'home' | 'orders' | 'stock' | 'tracking' | 'more'; label: string; href: string; icon: LucideIcon }[] = [
  { key: 'home', label: 'Home', href: '/seller', icon: Home },
  { key: 'orders', label: 'Orders', href: '/seller/orders', icon: ShoppingCart },
  { key: 'stock', label: 'Stock', href: '/seller/stock', icon: Boxes },
  { key: 'tracking', label: 'Tracking', href: '/seller/tracking', icon: Truck },
  { key: 'more', label: 'More', href: '/seller/more', icon: LayoutGrid },
];

/** The current screen, for both layouts. */
export function ScreenView() {
  const { route } = useNav();
  switch (route.screen) {
    case 'home': return <HomeScreen />;
    case 'orders': return <OrdersScreen />;
    case 'order': return <OrderDetailScreen id={route.id ?? 0} />;
    case 'stock': return <StockScreen />;
    case 'tracking': return <TrackingScreen />;
    case 'regional': return <RegionalScreen />;
    case 'payouts': return <PayoutsScreen />;
    case 'reports': return <ReportsScreen />;
    case 'more': return <MoreScreen />;
    case 'notifications': return <NotificationsScreen />;
    case 'profile': return <ProfileScreen />;
    case 'settings': return <SettingsScreen />;
    case 'help': return <HelpScreen />;
    default: return <HomeScreen />;
  }
}

/** Hide the bottom bar while the on-screen keyboard is up, so it never sits over the field being typed in. */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes((el as HTMLInputElement).type)));
    const coarse = window.matchMedia('(pointer: coarse)');
    const onIn = (e: FocusEvent) => { if (coarse.matches && isField(e.target)) setTyping(true); };
    const onOut = () => setTimeout(() => setTyping(isField(document.activeElement) && coarse.matches), 50);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, []);
  return typing;
}

export default function MobileShell() {
  const { route, back } = useNav();
  const { counts, stockAlerts, unreadCount, toast, dismissToast, syncing, refresh } = useSeller();
  const online = useOnline();
  const typing = useTyping();
  const [scrolled, setScrolled] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const tab = SCREEN_TAB[route.screen];
  const sub = SUB_SCREENS.has(route.screen);
  const hideNav = route.screen === 'order' || typing;
  const inlineHeading = route.screen === 'home' || route.screen === 'more';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    window.addEventListener('sx-sheet-open', dismissToast);
    return () => window.removeEventListener('sx-sheet-open', dismissToast);
  }, [dismissToast]);

  // A short "back online" note after a drop.
  useEffect(() => {
    if (!online) { setWasOffline(true); return; }
    if (!wasOffline) return;
    const t = setTimeout(() => setWasOffline(false), 4000);
    return () => clearTimeout(t);
  }, [online, wasOffline]);

  const badges: Record<string, number> = {
    orders: counts.toConfirm,
    stock: stockAlerts,
    tracking: counts.lateShipments + counts.toShip,
  };

  return (
    <div className={`sx sx-app ${hideNav ? 'sx-no-nav' : ''}`}>
      <a href="#sx-main" className="sx-skip">Skip to content</a>
      <TopNav />
      <header className={`sx-header ${scrolled && !inlineHeading ? 'sx-header-scrolled' : ''}`}>
        {/* Home and More show their heading and the bell in their own first row; other screens show them here. */}
        {!inlineHeading && (
          <div className="sx-header-inner">
            {sub && (
              <button type="button" className="sx-icon-btn sx-back" onClick={back} aria-label="Back"><ArrowLeft size={22} aria-hidden /></button>
            )}
            <h1 className="sx-header-title">{SCREEN_TITLE[route.screen]}</h1>
            <div className="sx-header-actions">
              <AppLink href="/seller/notifications" className="sx-icon-btn sx-bell" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
                <Bell size={21} aria-hidden />
                {unreadCount > 0 && <span className="sx-bell-badge" aria-hidden>{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </AppLink>
            </div>
          </div>
        )}
        {syncing && <div className="sx-progress" role="progressbar" aria-label="Refreshing" />}
        {!online ? (
          <div className="sx-net sx-net-off" role="status">
            <WifiOff size={16} aria-hidden />
            <span>You&apos;re offline. Showing what was loaded before; changes can&apos;t be saved until you reconnect.</span>
          </div>
        ) : wasOffline ? (
          <div className="sx-net sx-net-on" role="status">
            <CheckCircle2 size={16} aria-hidden />
            <span>Back online.</span>
            <button type="button" className="sx-net-btn" onClick={() => { setWasOffline(false); void refresh(); }}><RefreshCw size={14} aria-hidden /> Refresh</button>
          </div>
        ) : null}
      </header>

      <main id="sx-main" className="sx-main" tabIndex={-1}>
        <ScreenView />
      </main>

      {!hideNav && (
        <nav className="sx-nav" aria-label="Main">
          <div className="sx-nav-inner">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              const n = badges[t.key] ?? 0;
              return (
                <AppLink key={t.key} href={t.href} className={`sx-nav-item ${active ? 'sx-nav-active' : ''}`} aria-current={active ? 'page' : undefined}
                  aria-label={n > 0 ? `${t.label}, ${n} need attention` : t.label}>
                  <span className="sx-nav-icon"><Icon size={22} aria-hidden strokeWidth={active ? 2.4 : 2} />{n > 0 && <span className="sx-nav-badge" aria-hidden>{n > 99 ? '99+' : n}</span>}</span>
                  <span className="sx-nav-label">{t.label}</span>
                </AppLink>
              );
            })}
          </div>
        </nav>
      )}

      {toast && (
        <div className={`sx-toast sx-toast-${toast.tone}`} role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'} key={toast.id}>
          {toast.tone === 'success' ? <CheckCircle2 size={18} aria-hidden /> : toast.tone === 'info' ? <Info size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
          <span className="sx-toast-msg">{toast.message}</span>
          {toast.action && <AppLink href={toast.action.href} className="sx-toast-action" onClick={dismissToast}>{toast.action.label}</AppLink>}
          <button type="button" className="sx-toast-close" onClick={dismissToast} aria-label="Dismiss"><X size={16} aria-hidden /></button>
        </div>
      )}

      <ConfirmOrderSheet />
      <RestockSheet />
      <ProductFormSheet />
    </div>
  );
}
