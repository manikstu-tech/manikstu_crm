'use client';

// Desktop layout of the seller app: the cream sidebar, top bar and the original dashboard pages.
// Data and actions come from SellerProvider (shared with the phone layout); each page has its own
// URL under /seller, so links, refresh and the back button work here too.

import React from 'react';
import { BarChart3, Boxes, HelpCircle, LayoutDashboard, MapPin, Settings, ShoppingCart, Truck, UserRound, Wallet } from 'lucide-react';
import Sidebar, { NavGroup } from './Sidebar';
import Topbar from './Topbar';
import Modal from './Modal';
import NotificationsDrawer from './NotificationsDrawer';
import SellerOverview from './seller/SellerOverview';
import SellerOrders from './seller/SellerOrders';
import SellerStock from './seller/SellerStock';
import SellerTracking from './seller/SellerTracking';
import SellerRegional from './seller/SellerRegional';
import SellerPayouts from './seller/SellerPayouts';
import SellerReports from './seller/SellerReports';
import ProductForm from './seller/ProductForm';
import OrderDetailScreen from './seller/mobile/OrderDetailScreen';
import { HelpScreen, MoreScreen, NotificationsScreen, ProfileScreen, SettingsScreen } from './seller/mobile/AccountScreens';
import { useNav } from './seller/app/nav';
import { DESKTOP_HREF, DESKTOP_PAGE } from './seller/app/routes';
import { useSeller } from './seller/app/SellerProvider';

export default function SellerDashboard() {
  const s = useSeller();
  const { route, navigate, query, setQuery } = useNav();
  const { user, seller, myOrders, myProducts, mixedOrderIds, shipmentDetails, movements, notifications, counts, stockAlerts, toast } = s;
  const activePage = DESKTOP_PAGE[route.screen];
  const go = (page: string) => navigate(DESKTOP_HREF[page] ?? '/seller');

  const detailOrder = route.screen === 'order' ? myOrders.find(o => o.order.id === route.id) : null;
  const pageMeta: Record<string, { title: string; sub: string }> = {
    overview: { title: 'Seller Dashboard', sub: `Your sales on Manikstu, ${user.name.split(' ')[0]}: orders to ship, stock and earnings.` },
    orders:   route.screen === 'order'
      ? { title: detailOrder ? `Order ${detailOrder.order.order_number}` : 'Order details', sub: 'Customer, items, payment and history for this order.' }
      : { title: 'Orders', sub: 'New orders to confirm or reject, and the orders you have already confirmed. Follow deliveries in Tracking.' },
    stock:    { title: 'Stock',            sub: 'What you have, what is promised to customers, how long it lasts and what to restock.' },
    tracking: { title: 'Tracking',         sub: 'Where each of your orders is: courier, tracking number, expected delivery and history.' },
    regional: { title: 'Regional Report',  sub: 'Where your products sell: orders and customers by state, district, town and PIN code.' },
    payouts:  { title: 'Payouts',          sub: 'What you earn from each order after Manikstu commission, and when it is paid.' },
    reports:  { title: 'Reports',          sub: 'Your orders, payouts and stock, exportable to Excel or PDF.' },
    notifications: { title: 'Notifications', sub: 'Orders to confirm and ship, stock running out, and payouts due.' },
    more:     { title: 'More',             sub: 'Your account, money and reports.' },
    profile:  { title: 'Seller profile',   sub: 'Your business details on Manikstu.' },
    settings: { title: 'Settings',         sub: 'App, data and sign-in.' },
    help:     { title: 'Help & support',   sub: 'How selling on Manikstu works, and who to contact.' },
  };
  const currentMeta = pageMeta[activePage] ?? pageMeta.overview;

  const navGroups: NavGroup[] = [
    { label: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: LayoutDashboard }] },
    {
      label: 'Sell',
      items: [
        { key: 'orders', label: 'Orders', icon: ShoppingCart, count: counts.toConfirm },
        { key: 'stock', label: 'Stock', icon: Boxes, count: stockAlerts },
        { key: 'tracking', label: 'Tracking', icon: Truck, count: counts.lateShipments + counts.toShip },
        { key: 'regional', label: 'Regional report', icon: MapPin },
      ],
    },
    {
      label: 'Money',
      items: [
        { key: 'payouts', label: 'Payouts', icon: Wallet, count: counts.payoutsDue },
        { key: 'reports', label: 'Reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Account',
      items: [
        { key: 'profile', label: 'Seller profile', icon: UserRound },
        { key: 'settings', label: 'Settings', icon: Settings },
        { key: 'help', label: 'Help & support', icon: HelpCircle },
      ],
    },
  ];

  const confirmOrder = s.confirmOrder;
  const c = s.confirmCard;
  const r = s.restock;
  const editing = s.productForm?.editingId !== null && s.productForm?.editingId !== undefined;

  return (
    <div className="card-layout">
      {toast && (
        <div className={`toast ${toast.tone === 'warning' || toast.tone === 'error' ? 'toast-error' : ''}`} role={toast.tone === 'warning' || toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'warning' || toast.tone === 'error' ? '⚠️' : toast.tone === 'info' ? 'ℹ️' : '✅'} {toast.message}
          {toast.action && (
            <button type="button" className="link-btn" style={{ marginLeft: 10, color: 'inherit', textDecoration: 'underline', fontWeight: 700 }} onClick={() => { s.dismissToast(); navigate(toast.action!.href); }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      <div className="shell">
        <Sidebar groups={navGroups} activePage={activePage} onSelectPage={go} />

        <main className="main">
          <Topbar
            title={currentMeta.title}
            subtitle={currentMeta.sub}
            search={route.screen === 'orders' || route.screen === 'stock' || route.screen === 'tracking'
              ? {
                  query: s.searchQuery,
                  onChange: s.setSearchQuery,
                  placeholder: route.screen === 'stock' ? 'Search products…' : route.screen === 'tracking' ? 'Search order, customer, city, AWB…' : 'Search order, customer, city, product…',
                }
              : undefined}
            notifications={{ count: notifications.length, onToggle: () => s.setNotifsOpen(o => !o), title: 'Seller alerts' }}
            profile={{ name: user.name, role: seller.business, initials: user.initials, detail: `Seller ID ${user.staffId} · ${seller.city}` }}
          />

          {route.screen === 'home' && (
            <SellerOverview
              orders={myOrders}
              products={myProducts}
              onNavigate={go}
              shipmentDetails={shipmentDetails}
              onAdvanceStage={(id, action) => void s.advanceManualStage(id, action)}
              onOpenConfirm={s.openConfirmCard}
            />
          )}
          {route.screen === 'orders' && (
            <SellerOrders
              orders={myOrders}
              mixedOrderIds={mixedOrderIds}
              searchQuery={s.searchQuery}
              onOpenConfirm={s.openConfirmCard}
              onReject={id => void s.rejectOrder(id)}
              onTrack={s.trackOrder}
            />
          )}
          {route.screen === 'stock' && (
            <SellerStock products={myProducts} orders={myOrders} movements={movements} searchQuery={s.searchQuery} onRestock={s.openRestock} onEditProduct={s.openEditProduct} onAddProduct={s.openAddProduct} />
          )}
          {route.screen === 'tracking' && (
            <SellerTracking
              orders={myOrders}
              searchQuery={s.searchQuery}
              shipmentDetails={shipmentDetails}
              onAdvanceStage={(id, action) => void s.advanceManualStage(id, action)}
              focusOrderNumber={query.get('order')}
              onFocusHandled={() => setQuery({ order: null })}
              onOpenConfirm={s.openConfirmCard}
            />
          )}
          {route.screen === 'regional' && <SellerRegional seller={seller} orders={myOrders} onToast={msg => s.showToast(msg)} />}
          {route.screen === 'payouts' && <SellerPayouts orders={myOrders} seller={seller} />}
          {route.screen === 'reports' && <SellerReports seller={seller} orders={myOrders} products={myProducts} onToast={msg => s.showToast(msg)} />}
          {['order', 'notifications', 'more', 'profile', 'settings', 'help'].includes(route.screen) && (
            <div className="sx sx-desk-page">
              {route.screen === 'order' && <OrderDetailScreen id={route.id ?? 0} />}
              {route.screen === 'notifications' && <NotificationsScreen />}
              {route.screen === 'more' && <MoreScreen />}
              {route.screen === 'profile' && <ProfileScreen />}
              {route.screen === 'settings' && <SettingsScreen />}
              {route.screen === 'help' && <HelpScreen />}
            </div>
          )}
          <footer className="site-footer">
            <div>© 2026 Manikstu Agri Network · Seller Hub</div>
          </footer>
        </main>
      </div>

      <NotificationsDrawer
        isOpen={s.notifsOpen}
        onClose={() => s.setNotifsOpen(false)}
        notifications={notifications}
        onClearAll={s.clearNotifications}
        title="Seller alerts"
      />

      <Modal
        isOpen={confirmOrder !== null && c !== null}
        onClose={s.closeConfirmCard}
        title={confirmOrder ? `${confirmOrder.status === 'pending' ? 'Confirm order' : 'Order details'} · ${confirmOrder.order_number}` : ''}
        closeOnBackdrop={false}
      >
        {confirmOrder && c && (
          <form onSubmit={e => { e.preventDefault(); void s.saveConfirmCard(); }}>
            <p className="loc" style={{ marginBottom: 14 }}>
              {confirmOrder.status === 'pending'
                ? 'Add the courier and its tracking number to confirm this order.'
                : 'The courier and tracking number saved for this order.'}
            </p>
            <div className="form-group">
              <label htmlFor="sc-courier">Courier name</label>
              <input id="sc-courier" type="text" required placeholder="e.g. India Post, Delhivery, DTDC" value={c.courier} onChange={e => s.setConfirmField('courier', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="sc-tracking-no">Tracking No.</label>
              <input id="sc-tracking-no" type="text" required placeholder="Courier tracking / AWB number" value={c.trackingNo} onChange={e => s.setConfirmField('trackingNo', e.target.value)} />
            </div>
            {c.error && <p className="loc" role="alert" style={{ color: 'var(--rust)', margin: '-4px 0 10px' }}>{c.error}</p>}
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={s.closeConfirmCard}>Cancel</button>
              {(() => {
                const step = s.nextManualStep(confirmOrder, shipmentDetails[confirmOrder.id]);
                return step && (
                  <button type="button" className="btn-secondary" onClick={() => { void s.advanceManualStage(confirmOrder.id, step.action); s.closeConfirmCard(); }}>
                    {step.label}
                  </button>
                );
              })()}
              <button type="submit" className="btn-primary" disabled={c.busy}>{c.busy ? 'Saving…' : confirmOrder.status === 'pending' ? 'Confirm order' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={r !== null} onClose={s.closeRestock} title={`Restock · ${r?.product.name ?? ''}`} closeOnBackdrop={false}>
        {r && (
          <form onSubmit={e => { e.preventDefault(); void s.saveRestock(); }} noValidate>
            <p className="loc" style={{ marginBottom: 14 }}>
              In stock now: <strong>{r.product.stock_quantity}</strong> units ({r.product.size}). The units you add are counted straight away.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="rs-units">Units received</label>
                <input id="rs-units" type="number" min={1} step={1} required value={r.units} aria-invalid={!!r.error} aria-describedby={r.error ? 'rs-units-err' : undefined} onChange={e => s.setRestockField('units', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="rs-note">Batch / note (optional)</label>
                <input id="rs-note" type="text" placeholder="e.g. Batch 24-09, invoice 1182" value={r.note} onChange={e => s.setRestockField('note', e.target.value)} />
              </div>
            </div>
            {r.error && <p id="rs-units-err" className="loc" role="alert" style={{ color: 'var(--rust)', margin: '-4px 0 10px' }}>{r.error}</p>}
            <div className="form-total">New stock: <strong>{r.product.stock_quantity + Math.max(0, Math.round(Number(r.units)) || 0)}</strong> units</div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={s.closeRestock}>Cancel</button>
              <button type="submit" className="btn-primary">Add to stock</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={s.productForm !== null} onClose={s.closeProductForm} title={editing ? `Edit ${s.productForm?.draft.name ?? ''}` : 'Add a product'} closeOnBackdrop={false} wide>
        <ProductForm variant="desktop" formId="ap-form" />
      </Modal>
    </div>
  );
}
