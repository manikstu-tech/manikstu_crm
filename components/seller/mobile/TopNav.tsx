'use client';

// The seller app's top navigation bar on phones and tablets, matching the telecalling head and calling executive
// dashboards: ☰ page menu on the left, the Manikstu logo in the middle, Log out on the right.

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Menu, X } from 'lucide-react';
import LogoutButton from '../../LogoutButton';
import { AppLink, useNav, useSheetHistory } from '../app/nav';
import { SellerMenuGroup, sellerMenuGroups } from '../app/menu';
import { useSeller } from '../app/SellerProvider';

/** The desktop sidebar's pages, plus Notifications: phones have no bell in the top bar. */
function useMenuGroups(): SellerMenuGroup[] {
  const { counts, stockAlerts, unreadCount } = useSeller();
  const [overview, ...rest] = sellerMenuGroups({
    toConfirm: counts.toConfirm, stockAlerts, shipments: counts.lateShipments + counts.toShip, payoutsDue: counts.payoutsDue,
  });
  const notifications = { screen: 'notifications', label: 'Notifications', href: '/seller/notifications', icon: Bell, count: unreadCount } as const;
  return [{ ...overview, items: [...overview.items, notifications] }, ...rest];
}

/** The ☰ page menu: slides in from the left; Escape, the backdrop, the close button or the back button close it. */
function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { route } = useNav();
  const groups = useMenuGroups();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useSheetHistory(open, () => onCloseRef.current());

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('.sx-drawer-close')?.focus();
    document.documentElement.classList.add('sx-locked');
    window.dispatchEvent(new Event('sx-sheet-open'));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button'));
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('sx-locked');
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  const current = route.screen === 'order' ? 'orders' : route.screen;
  return createPortal(
    <div className="sx sx-drawer-layer">
      <div className="sx-drawer-backdrop" onClick={onClose} aria-hidden />
      <div ref={panelRef} className="sx-drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="sx-drawer-head">
          <span>Menu</span>
          <button type="button" className="sx-topnav-btn sx-drawer-close" onClick={onClose} aria-label="Close menu"><X size={20} aria-hidden /></button>
        </div>
        <nav aria-label="Seller pages">
          {groups.map(g => (
            <div key={g.label} className="sx-drawer-group">
              <div className="sx-drawer-label">{g.label}</div>
              {g.items.map(item => {
                const Icon = item.icon;
                const active = current === item.screen;
                return (
                  <AppLink key={item.screen} href={item.href} className="sx-drawer-item" aria-current={active ? 'page' : undefined} onClick={onClose}>
                    <Icon size={18} aria-hidden />
                    <span>{item.label}</span>
                    {item.count !== undefined && item.count > 0 && <span className="sx-drawer-count">{item.count}</span>}
                  </AppLink>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </div>,
    document.body,
  );
}

export default function TopNav() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div className="sx-topnav">
        <div className="sx-topnav-inner">
          <button type="button" className="sx-topnav-btn" aria-label="Open menu" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <Menu size={20} aria-hidden />
          </button>
          <AppLink href="/seller" className="sx-topnav-logo" aria-label="Manikstu Seller, home">
            <img src="/brand/manikstu-logo-glossy.png" alt="Manikstu" />
          </AppLink>
          <div className="sx-topnav-logout"><LogoutButton /></div>
        </div>
      </div>
      <MenuDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
