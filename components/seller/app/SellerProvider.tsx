'use client';

// All of the seller's data and actions, shared by the desktop dashboard and the phone app.
// Moved here from SellerDashboard so both layouts run the same business logic: order status
// changes, courier details, restocks, product listings, alerts and refreshing from the CRM.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogProduct } from '../../../data/catalogProducts';
import type { OrderStatus, SalesOrder } from '../../../data/managerDashboard';
import type { Seller } from '../../../data/sellers';
import { LOW_STOCK_LEVEL } from '../../../data/stockLevels';
import type { SessionUser } from '../../../lib/session';
import { nowStamp, rupees } from '../../../lib/format';
import { isLiveOrder } from '../../telecaller/orderTracking';
import { CourierCode, CourierForm, courierCodeFor, courierPayload, courierProblems } from '../../../lib/couriers';
import {
  ManualStageAction, ORDER_STATUS_LABEL, SellerOrder, ShipmentDetails, nextManualStep, sellerOrders, sellerTrackingFor, stockLevels,
} from '../sellerData';
import { useNav } from './nav';

/** How often the seller's order list is re-read from the CRM, so new website orders and status changes appear without a reload. */
export const ORDER_REFRESH_MS = 15000;

/** A stock change recorded by the seller in this session. */
export interface StockMovement {
  id: number;
  productId: number;
  units: number;
  note: string;
  at: string;
}

export type ToastTone = 'success' | 'warning' | 'error' | 'info';
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; href: string };
}

export interface SellerNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'warning' | 'success' | 'info';
  /** The screen that deals with it. */
  href: string;
}

/** Product listing fields the add / edit form works on (strings, as typed). */
export const EMPTY_PRODUCT = {
  name: '', slug: '', category: 'Health' as 'Health' | 'Nutrition', size: '', sku: '', price: '', stock: '', order: '0',
  active: true, featured: false, description: '', longDescription: '', highlights: '', recommendedFor: '',
  usage: '', storage: '', ingredients: '',
};
export type ProductDraft = typeof EMPTY_PRODUCT;
export type ProductErrors = Partial<Record<'name' | 'price' | 'stock' | 'order', string>>;

export const SPEC_FIELDS: [label: string, placeholder: string][] = [
  ['Form', 'e.g. Pellet / Powder / Liquid'],
  ['Packaging Type', 'e.g. Bag / Bottle / Sachet'],
  ['Grade Standard', 'e.g. Feed Grade / Food Grade'],
  ['Shelf Life', 'e.g. 12 months'],
  ['Type Of Supplement', 'e.g. Nutritional Supplement'],
  ['Packaging', 'e.g. 500 ml / 25 kg'],
  ['Country of Origin', 'e.g. Made in India'],
];
const SPEC_LABELS = SPEC_FIELDS.map(([label]) => label);
export const IMAGE_SLOTS: [slot: string, label: string][] = [['main', 'Main image'], ['angle1', 'Angle view 1'], ['angle2', 'Angle view 2'], ['angle3', 'Angle view 3']];

const MAX_UNITS = 100000;
const MAX_PRICE = 10000000;
const isWhole = (s: string) => /^\d+$/.test(s.trim());

/** Field problems in a product draft, or an empty object when it can be saved. */
export function validateProduct(d: ProductDraft, opts: { editing: boolean; nameTaken: boolean }): ProductErrors {
  const e: ProductErrors = {};
  const name = d.name.replace(/\s+/g, ' ').trim();
  if (!opts.editing) {
    if (name.length < 3) e.name = 'Enter a product name (at least 3 characters).';
    else if (opts.nameTaken) e.name = 'A product with this name already exists.';
  }
  if (d.price.trim() !== '' && (!isWhole(d.price) || Number(d.price) > MAX_PRICE)) e.price = 'Enter the price in whole rupees (0 or more), or leave it blank.';
  if (d.stock.trim() !== '' && (!isWhole(d.stock) || Number(d.stock) > MAX_UNITS)) e.stock = `Enter a whole number of units from 0 to ${MAX_UNITS.toLocaleString('en-IN')}.`;
  if (d.order.trim() !== '' && !/^-?\d+$/.test(d.order.trim())) e.order = 'Enter a whole number.';
  return e;
}

/** Problem with a restock quantity, or null when it is fine. */
export function restockProblem(units: string): string | null {
  if (!isWhole(units)) return 'Enter the number of units received (a whole number).';
  const n = Number(units);
  if (n < 1) return 'Add at least 1 unit.';
  if (n > MAX_UNITS) return `That is more than ${MAX_UNITS.toLocaleString('en-IN')} units. Check the number.`;
  return null;
}

/** The confirm / courier form: the courier picked from the list, the name typed for "Others", the tracking number typed. */
interface ConfirmCard extends CourierForm { orderId: number; busy: boolean; error: string | null; /** Show each field's problem (after a save attempt). */ checked: boolean }
interface RestockState { product: CatalogProduct; suggested: number; units: string; note: string; error: string | null }
interface ProductFormState {
  editingId: number | null;
  draft: ProductDraft;
  specs: Record<string, string>;
  images: Record<string, string>;
  busy: boolean;
  error: string | null;
  fieldErrors: ProductErrors;
}

interface Props {
  user: SessionUser;
  seller: Seller;
  initialOrders: SalesOrder[];
  initialProducts: CatalogProduct[];
  mixedOrderIds: number[];
  /** Connected to the CRM backend (not the offline demo). */
  live: boolean;
  isMobile: boolean;
  children: React.ReactNode;
}

function useSellerState({ user, seller, initialOrders, initialProducts, mixedOrderIds: initialMixed, live, isMobile }: Omit<Props, 'children'>) {
  const { navigate, route } = useNav();

  /* ---------- Toasts ---------- */
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, tone: ToastTone = 'success', action?: Toast['action']) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone, action });
    toastTimer.current = setTimeout(() => setToast(null), tone === 'success' || tone === 'info' ? (action ? 5000 : 3000) : 5500);
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // The 8-hour sign-in ran out while the app was open: say so, then go to the login page.
  const signedOut = useRef(false);
  const checkSession = useCallback((res: Response): boolean => {
    if (res.status !== 401) return true;
    if (!signedOut.current) {
      signedOut.current = true;
      showToast('Your session has ended. Taking you to sign in…', 'warning');
      setTimeout(() => window.location.assign('/login'), 1800);
    }
    return false;
  }, [showToast]);

  const offlineBlock = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showToast("You're offline. Connect to the internet and try again.", 'error');
      return true;
    }
    return false;
  }, [showToast]);

  /* ---------- Orders and products ---------- */
  const [orders, setOrders] = useState<SalesOrder[]>(initialOrders);
  const [mixedOrderIds, setMixedOrderIds] = useState<number[]>(initialMixed);
  const [catalog, setCatalog] = useState<CatalogProduct[]>(initialProducts);
  // Product ids this seller owns; grows when they add a product.
  const [ownedIds, setOwnedIds] = useState<number[]>(seller.productIds);
  // Status changes in flight to the server. While any are, a refresh would read the old status back and undo the click.
  const pendingSaves = useRef(0);
  const [busyOrderIds, setBusyOrderIds] = useState<number[]>([]);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => { setLastSync(Date.now()); }, []);

  const fetchOrders = useCallback(async (): Promise<boolean> => {
    const res = await fetch('/api/seller/orders', { cache: 'no-store' });
    if (!checkSession(res)) return false;
    if (!res.ok) return false; // offline demo or server trouble: keep what is on screen
    const body = await res.json();
    if (pendingSaves.current === 0 && Array.isArray(body.data)) {
      setOrders(body.data as SalesOrder[]);
      if (Array.isArray(body.mixedOrderIds)) setMixedOrderIds(body.mixedOrderIds as number[]);
    }
    return true;
  }, [checkSession]);

  const fetchProducts = useCallback(async (): Promise<boolean> => {
    const res = await fetch('/api/seller/products', { cache: 'no-store' });
    if (!checkSession(res)) return false;
    if (!res.ok) return false;
    const body = await res.json();
    if (Array.isArray(body.products)) {
      const fresh = body.products as CatalogProduct[];
      setCatalog(fresh);
      setOwnedIds(prev => Array.from(new Set([...prev, ...fresh.map(p => p.id)])));
    }
    return true;
  }, []);

  /** Re-read orders and products from the CRM now. */
  const refresh = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!live) { setLastSync(Date.now()); if (!opts.silent) showToast('Offline demo: there is no CRM backend to refresh from.', 'info'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (!opts.silent) showToast("You're offline. Showing what was loaded before.", 'warning');
      return;
    }
    setSyncing(true);
    try {
      const [o, p] = await Promise.all([fetchOrders(), fetchProducts()]);
      if (o) { setLastSync(Date.now()); setSyncError(null); }
      else setSyncError('Could not load the latest orders.');
      if (!opts.silent) showToast(o && p ? 'Up to date' : 'Could not refresh everything. Try again.', o && p ? 'success' : 'error');
    } catch {
      setSyncError('Could not reach the server.');
      if (!opts.silent) showToast('Could not reach the server. Try again.', 'error');
    } finally {
      setSyncing(false);
    }
  }, [live, fetchOrders, fetchProducts, showToast]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      if (pendingSaves.current > 0 || document.hidden || navigator.onLine === false) return;
      try {
        if (await fetchOrders()) { setLastSync(Date.now()); setSyncError(null); }
      } catch {
        /* server briefly unreachable: try again next tick */
      }
    }, ORDER_REFRESH_MS);
    // Coming back to the app (or back online): catch up straight away.
    const catchUp = () => { if (!document.hidden && navigator.onLine) void refresh({ silent: true }); };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('online', catchUp);
    };
  }, [live, fetchOrders, refresh]);

  const myProducts = useMemo(() => catalog.filter(p => ownedIds.includes(p.id)), [catalog, ownedIds]);
  const myOrders = useMemo(() => sellerOrders(orders, seller, catalog), [orders, seller, catalog]);

  // Stock as customers see it: what each active product can still sell (the shelf minus unshipped orders), and
  // whether that is low (under LOW_STOCK_LEVEL) or out. The website uses the same figure.
  const stock = useMemo(() => stockLevels(myProducts.filter(p => p.is_active), myOrders), [myProducts, myOrders]);
  const stockAlerts = stock.filter(s => s.status !== 'in').length;

  /* ---------- Courier details (chosen when confirming, saved on the order) ---------- */
  // This device keeps only what the backend has no status for (packed on sample orders, out for delivery); the courier
  // and tracking number come from the order itself, so every device and the telecalling team see the same.
  const [localShipment, setShipmentDetails] = useState<Record<number, ShipmentDetails>>({});
  const shipmentDetails = useMemo(() => {
    const merged: Record<number, ShipmentDetails> = { ...localShipment };
    for (const o of orders) {
      if (!o.courier_name) continue;
      const local = merged[o.id];
      merged[o.id] = { ...(local ?? { confirmedAt: o.created_at }), courier: o.courier_name, trackingNo: o.tracking_number ?? '' };
    }
    return merged;
  }, [localShipment, orders]);

  /* ---------- Alerts ---------- */
  const storeKey = `mk-seller-alerts:${seller.id}`;
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([]);
  const [seenNotifs, setSeenNotifs] = useState<string[]>([]);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const loadedAlerts = useRef(false);
  // Which alerts were dismissed or read survives closing the app (only alert ids are kept on this device).
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storeKey) ?? 'null');
      if (saved && Array.isArray(saved.dismissed)) setDismissedNotifs(saved.dismissed);
      if (saved && Array.isArray(saved.seen)) setSeenNotifs(saved.seen);
    } catch { /* storage unavailable: start fresh */ }
    loadedAlerts.current = true;
  }, [storeKey]);
  useEffect(() => {
    if (!loadedAlerts.current) return;
    try { window.localStorage.setItem(storeKey, JSON.stringify({ dismissed: dismissedNotifs.slice(-200), seen: seenNotifs.slice(-200) })); } catch { /* ignore */ }
  }, [storeKey, dismissedNotifs, seenNotifs]);

  const allNotifications = useMemo(() => {
    const list: SellerNotification[] = [];
    const toConfirm = myOrders.filter(o => o.order.status === 'pending');
    const toShip = myOrders.filter(o => o.order.status === 'confirmed' || o.order.status === 'ready_for_dispatch');
    const outOfStock = stock.filter(s => s.status === 'out');
    const lowStock = stock.filter(s => s.status === 'low').sort((a, b) => a.available - b.available);
    const dueAmount = myOrders.filter(o => o.payout === 'Due').reduce((s, o) => s + o.net, 0);
    const ids = (xs: SellerOrder[]) => xs.map(o => o.order.id).sort((a, b) => a - b).join(',');

    // Keyed by which orders / products they are about, so a dismissed alert comes back when something new joins it.
    if (toConfirm.length) list.push({ id: `confirm:${ids(toConfirm)}`, type: 'warning', title: `${toConfirm.length} order${toConfirm.length > 1 ? 's' : ''} to confirm`, message: 'New website orders are waiting for you to confirm them.', time: 'Now', href: '/seller/orders?tab=new' });
    if (toShip.length) list.push({ id: `ship:${ids(toShip)}`, type: 'info', title: `${toShip.length} order${toShip.length > 1 ? 's' : ''} to pack & ship`, message: 'Confirmed orders are ready to be packed and dispatched.', time: 'Now', href: '/seller/tracking?tab=confirmed' });
    // One alert per product that has run out, so a newly empty product shows up even after an earlier one was dismissed.
    outOfStock.forEach(({ p }) => list.push({ id: `oos:${p.id}`, type: 'warning', title: `${p.name} is out of stock`, message: 'Customers see it as out of stock on the website and cannot order it. Restock to start selling again.', time: 'Now', href: '/seller/stock?filter=out' }));
    if (lowStock.length) list.push({ id: `low:${lowStock.map(s => s.p.id).join(',')}`, type: 'info', title: `${lowStock.length} product${lowStock.length > 1 ? 's' : ''} low on stock`, message: `Under ${LOW_STOCK_LEVEL} left: ${lowStock.slice(0, 3).map(s => `${s.p.name} (${s.available})`).join(', ')}${lowStock.length > 3 ? '…' : '.'}`, time: 'Today', href: '/seller/stock?filter=low' });
    if (dueAmount > 0) list.push({ id: `payout:${dueAmount}`, type: 'success', title: 'Payout due', message: `${rupees(dueAmount)} from delivered orders is due for payout.`, time: 'This week', href: '/seller/payouts' });
    return list;
  }, [myOrders, stock]);

  const notifications = useMemo(() => allNotifications.filter(n => !dismissedNotifs.includes(n.id)), [allNotifications, dismissedNotifs]);
  const unreadCount = notifications.filter(n => !seenNotifs.includes(n.id)).length;
  const dismissNotification = useCallback((id: string) => setDismissedNotifs(prev => [...prev, id]), []);
  const clearNotifications = useCallback(() => setDismissedNotifs(prev => Array.from(new Set([...prev, ...notifications.map(n => n.id)]))), [notifications]);
  const markNotificationsSeen = useCallback(() => setSeenNotifs(prev => Array.from(new Set([...prev, ...notifications.map(n => n.id)]))), [notifications]);

  // Say so the moment a product runs out or turns low (a new order arrived, an order was packed…), not only in the
  // alerts. The first render only records the starting levels. A product that is back in stock forgets its dismissed
  // out-of-stock alert, so running out again alerts again.
  const lastAvailable = useRef<Map<number, number> | null>(null);
  useEffect(() => {
    const prev = lastAvailable.current;
    lastAvailable.current = new Map(stock.map(s => [s.p.id, s.available]));
    if (!prev) return;
    const ranOut = stock.filter(s => s.status === 'out' && (prev.get(s.p.id) ?? 0) > 0);
    const turnedLow = stock.filter(s => s.status === 'low' && (prev.get(s.p.id) ?? 0) >= LOW_STOCK_LEVEL);
    const restocked = stock.filter(s => s.status !== 'out' && prev.get(s.p.id) === 0);
    if (ranOut.length) showToast(`${ranOut.map(s => s.p.name).join(', ')} ${ranOut.length > 1 ? 'are' : 'is'} now out of stock`, 'warning', { label: 'Stock', href: '/seller/stock?filter=out' });
    else if (turnedLow.length) showToast(`Low stock: ${turnedLow.map(s => `${s.p.name} (${s.available} left)`).join(', ')}`, 'warning', { label: 'Stock', href: '/seller/stock?filter=low' });
    if (restocked.length) {
      const ids = new Set(restocked.map(s => `oos:${s.p.id}`));
      setDismissedNotifs(p => p.filter(id => !ids.has(id)));
      setSeenNotifs(p => p.filter(id => !ids.has(id)));
    }
  }, [stock, showToast]);

  /* ---------- Order status ---------- */

  /** Track one order on the Tracking screen. */
  const trackOrder = useCallback((orderNumber: string) => navigate(`/seller/tracking?order=${encodeURIComponent(orderNumber)}`), [navigate]);

  /**
   * Move an order along (confirm, reject, packed, shipped, delivered). The row moves straight away and goes back
   * if the server disagrees: the backend decides which moves are legal. Resolves true once saved.
   * `navigate` (default: on desktop) opens Tracking after shipping or delivering, as the desktop dashboard always did.
   */
  const advanceOrder = useCallback(async (orderId: number, to: OrderStatus, opts: { navigate?: boolean; onError?: (message: string) => void; extra?: Record<string, unknown> } = {}): Promise<boolean> => {
    if (offlineBlock()) { opts.onError?.("You're offline. Connect to the internet and try again."); return false; }
    if (busyOrderIds.includes(orderId)) return false;
    const at = nowStamp();
    const order = orders.find(o => o.id === orderId);
    const previousStatus = order?.status;
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: to, status_history: [...o.status_history, { status: to, at }] } : o)));
    const goTrack = opts.navigate ?? !isMobile;
    if (order) {
      showToast(`${order.order_number} marked ${ORDER_STATUS_LABEL[to].toLowerCase()}`, 'success',
        !goTrack && (to === 'shipped' || to === 'ready_for_dispatch' || to === 'confirmed') ? { label: 'Track', href: `/seller/tracking?order=${encodeURIComponent(order.order_number)}` } : undefined);
    }
    // Once shipped or delivered, the seller's next job is tracking the delivery, so take them straight there.
    if (goTrack && order && (to === 'shipped' || to === 'delivered')) trackOrder(order.order_number);

    const rollback = () => {
      if (!previousStatus) return;
      setOrders(prev => prev.map(o => (o.id === orderId
        ? { ...o, status: previousStatus, status_history: o.status_history.filter(h => !(h.status === to && h.at === at)) }
        : o)));
    };

    pendingSaves.current += 1;
    setBusyOrderIds(prev => [...prev, orderId]);
    try {
      const res = await fetch(`/api/seller/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to, ...(opts.extra ?? {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.data && 'courier_code' in body.data) {
        setOrders(prev => prev.map(o => (o.id === orderId
          ? { ...o, courier_code: body.data.courier_code, courier_name: body.data.courier_name, tracking_number: body.data.tracking_number, bus_name: body.data.bus_name ?? null, bus_number: body.data.bus_number ?? null }
          : o)));
      }
      if (res.ok && to === 'shipped' && order) {
        // Shipping takes the units off the shelf. Use the backend's new figures; the offline demo works them out here.
        const updates: { id: number; stock_quantity: number }[] | null = Array.isArray(body.data?.stock) ? body.data.stock : null;
        setCatalog(prev => prev.map(p => {
          if (updates) {
            const u = updates.find(x => x.id === p.id);
            return u ? { ...p, stock_quantity: u.stock_quantity } : p;
          }
          if (!body.local) return p;
          const units = order.items.filter(i => i.product_name === p.name).reduce((n, i) => n + i.quantity, 0);
          return units ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - units) } : p;
        }));
      }
      if (!res.ok) {
        rollback();
        if (!checkSession(res)) { opts.onError?.('Your session has ended.'); return false; }
        showToast(body.error ?? 'Could not save that change.', 'error');
        opts.onError?.(body.error ?? 'Could not save that change.');
        return false;
      }
      return true;
    } catch {
      rollback();
      showToast('Could not reach the server.', 'error');
      opts.onError?.('Could not reach the server. Check your connection and try again.');
      return false;
    } finally {
      pendingSaves.current -= 1;
      setBusyOrderIds(prev => prev.filter(id => id !== orderId));
    }
  }, [orders, busyOrderIds, isMobile, offlineBlock, showToast, trackOrder, checkSession]);

  const rejectOrder = useCallback((orderId: number) => advanceOrder(orderId, 'rejected'), [advanceOrder]);

  /** The seller marking packed / shipped / out for delivery / delivered, wherever that button lives. */
  const advanceManualStage = useCallback(async (orderId: number, action: ManualStageAction, opts: { navigate?: boolean } = {}): Promise<boolean> => {
    const goTrack = opts.navigate ?? !isMobile;
    if (action === 'shipped' || action === 'delivered') return advanceOrder(orderId, action, { navigate: goTrack });
    const order = orders.find(o => o.id === orderId);
    // Packing is a real status on live orders (ready for dispatch), saved to the server so every dashboard sees it.
    if (action === 'packed' && order && isLiveOrder(order)) {
      const ok = advanceOrder(orderId, 'ready_for_dispatch', { navigate: false });
      if (goTrack) trackOrder(order.order_number);
      return ok;
    }
    // Packed (offline sample) and out for delivery are kept on this device only: the backend has no status for them.
    if (offlineBlock()) return false;
    const field = action === 'packed' ? 'packedAt' : 'outForDeliveryAt';
    setShipmentDetails(prev => {
      const existing = prev[orderId] ?? { courier: '', trackingNo: '', confirmedAt: nowStamp() };
      return { ...prev, [orderId]: { ...existing, [field]: nowStamp() } };
    });
    if (order) showToast(`${order.order_number} marked ${action === 'packed' ? 'packed' : 'out for delivery'}`);
    if (goTrack && order) trackOrder(order.order_number);
    return true;
  }, [orders, isMobile, advanceOrder, offlineBlock, showToast, trackOrder]);

  /* ---------- Confirm order: courier + tracking number ---------- */
  const [confirmCard, setConfirmCard] = useState<ConfirmCard | null>(null);
  const confirmOrder = confirmCard ? orders.find(o => o.id === confirmCard.orderId) ?? null : null;

  const openConfirmCard = useCallback((orderId: number) => {
    // Opens with what is saved: the order's own courier, or (older data) a name typed before the list existed.
    const order = orders.find(o => o.id === orderId);
    const savedName = order?.courier_name ?? shipmentDetails[orderId]?.courier ?? '';
    const code: CourierCode | '' = (order?.courier_code as CourierCode | null | undefined) ?? (savedName ? courierCodeFor(savedName) : '');
    setConfirmCard({
      orderId, courierCode: code, otherName: code === 'other' ? savedName : '',
      trackingNo: order?.tracking_number ?? shipmentDetails[orderId]?.trackingNo ?? '',
      busName: code === 'bus' ? order?.bus_name ?? '' : '', busNumber: code === 'bus' ? order?.bus_number ?? '' : '',
      busy: false, error: null, checked: false,
    });
  }, [orders, shipmentDetails]);
  const closeConfirmCard = useCallback(() => setConfirmCard(c => (c?.busy ? c : null)), []);
  /** Changing the courier away from "Others" clears the typed name, so a stale name is never saved. */
  const setConfirmField = useCallback((field: 'courierCode' | 'otherName' | 'trackingNo' | 'busName' | 'busNumber', value: string) => setConfirmCard(c => {
    if (!c || c.busy) return c;
    if (field === 'courierCode') {
      // Leaving Bus clears its name and number, so choosing Bus again starts empty.
      const bus = value === 'bus' && c.courierCode === 'bus';
      return { ...c, courierCode: value as CourierCode | '', otherName: value === 'other' ? c.otherName : '', busName: bus ? c.busName : '', busNumber: bus ? c.busNumber : '', error: null };
    }
    return { ...c, [field]: value, error: null };
  }), []);

  const saveConfirmCard = useCallback(async () => {
    if (!confirmCard || confirmCard.busy) return;     // a second click while saving does nothing
    const problems = courierProblems(confirmCard);
    if (problems.courier || problems.otherName || problems.trackingNo) {
      setConfirmCard(c => (c ? { ...c, checked: true, error: 'Fix the highlighted fields to continue.' } : c));
      return;
    }
    const order = orders.find(o => o.id === confirmCard.orderId);
    const id = confirmCard.orderId;
    const payload = courierPayload(confirmCard);
    const keepLocally = () => setShipmentDetails(prev => ({
      ...prev, [id]: { ...prev[id], courier: payload.courier_name, trackingNo: payload.tracking_number ?? '', confirmedAt: prev[id]?.confirmedAt ?? nowStamp() },
    }));
    setConfirmCard(c => (c ? { ...c, busy: true, error: null } : c));

    if (order?.status === 'pending') {
      // The courier is saved with the confirmation, in the same request: both or neither.
      let reason = 'The order was not confirmed. Please try again.';
      const ok = await advanceOrder(id, 'confirmed', { extra: payload, onError: msg => { reason = `Not confirmed: ${msg}`; } });
      if (ok) { keepLocally(); setConfirmCard(null); }
      else setConfirmCard(c => (c ? { ...c, busy: false, error: reason } : c));
      return;
    }

    // Already confirmed: add or correct the courier details only.
    if (offlineBlock()) { setConfirmCard(c => (c ? { ...c, busy: false, error: "You're offline. Connect to the internet and try again." } : c)); return; }
    try {
      const res = await fetch(`/api/seller/orders/${id}/shipment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!checkSession(res)) return;
        setConfirmCard(c => (c ? { ...c, busy: false, error: body.error ?? 'Could not save the courier details.' } : c));
        return;
      }
      const saved = body.data ?? payload;
      setOrders(prev => prev.map(o => (o.id === id
        ? { ...o, courier_code: saved.courier_code, courier_name: saved.courier_name, tracking_number: saved.tracking_number, bus_name: saved.bus_name ?? null, bus_number: saved.bus_number ?? null }
        : o)));
      keepLocally();
      showToast(`${order?.order_number} courier details saved`);
      setConfirmCard(null);
    } catch {
      setConfirmCard(c => (c ? { ...c, busy: false, error: 'Could not reach the server. Check your connection and try again.' } : c));
    }
  }, [confirmCard, orders, advanceOrder, showToast, offlineBlock, checkSession]);

  /* ---------- Restock ---------- */
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [restock, setRestock] = useState<RestockState | null>(null);
  const openRestock = useCallback((p: CatalogProduct, suggested: number) => {
    setRestock({ product: p, suggested, units: String(suggested > 0 ? suggested : 10), note: '', error: null });
  }, []);
  const closeRestock = useCallback(() => setRestock(null), []);
  const setRestockField = useCallback((field: 'units' | 'note', value: string) => setRestock(r => (r ? { ...r, [field]: value, error: null } : r)), []);

  const saveRestock = useCallback(async () => {
    if (!restock) return;
    const problem = restockProblem(restock.units);
    if (problem) { setRestock(r => (r ? { ...r, error: problem } : r)); return; }
    if (offlineBlock()) return;
    const target = restock.product;
    const note = restock.note.trim();
    const units = Number(restock.units);
    // Optimistic: show the new total straight away, then persist to the backend.
    setCatalog(prev => prev.map(p => (p.id === target.id ? { ...p, stock_quantity: p.stock_quantity + units } : p)));
    const moveId = Date.now();
    setMovements(prev => [...prev, { id: moveId, productId: target.id, units, note, at: nowStamp() }]);
    setRestock(null);
    showToast(`${target.name}: +${units} units added to stock`);
    const undo = (msg: string) => {
      setCatalog(prev => prev.map(p => (p.id === target.id ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - units) } : p)));
      setMovements(prev => prev.filter(m => m.id !== moveId));
      showToast(msg, 'error');
    };
    try {
      const res = await fetch(`/api/seller/products/${target.id}/restock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { if (!checkSession(res)) { setCatalog(prev => prev.map(p => (p.id === target.id ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - units) } : p))); setMovements(prev => prev.filter(m => m.id !== moveId)); return; } undo(data.error || 'Could not save the restock. Please try again.'); return; }
      // Trust the backend's authoritative total when it sends one.
      if (typeof data.product?.stock_quantity === 'number') {
        setCatalog(prev => prev.map(p => (p.id === target.id ? { ...p, stock_quantity: data.product.stock_quantity } : p)));
      }
    } catch {
      undo('Could not reach the server. Please try again.');
    }
  }, [restock, offlineBlock, showToast, checkSession]);

  /* ---------- Add / edit a product listing ---------- */
  const [productForm, setProductForm] = useState<ProductFormState | null>(null);
  const openAddProduct = useCallback(() => {
    setProductForm({ editingId: null, draft: EMPTY_PRODUCT, specs: {}, images: {}, busy: false, error: null, fieldErrors: {} });
  }, []);
  /** Open a product's listing for editing: the form is filled with what is there now. */
  const openEditProduct = useCallback((p: CatalogProduct) => {
    const imgs = p.images.length ? p.images : p.image ? [p.image] : [];
    setProductForm({
      editingId: p.id,
      draft: {
        name: p.name, slug: p.slug, category: (p.category === 'Nutrition' ? 'Nutrition' : 'Health'), size: p.size ?? '', sku: p.sku ?? '',
        price: p.price === null ? '' : String(p.price), stock: String(p.stock_quantity), order: String(p.order),
        active: p.is_active, featured: p.is_featured, description: p.description, longDescription: p.long_description,
        highlights: p.highlights.join('\n'), recommendedFor: p.recommended_for.join('\n'),
        usage: p.usage_instructions, storage: p.storage_instructions, ingredients: p.ingredients,
      },
      specs: Object.fromEntries(p.specifications.filter(s => SPEC_LABELS.includes(s.label)).map(s => [s.label, s.value])),
      images: Object.fromEntries(imgs.slice(0, 4).map((url, i) => [IMAGE_SLOTS[i][0], url])),
      busy: false, error: null, fieldErrors: {},
    });
  }, []);
  const closeProductForm = useCallback(() => setProductForm(null), []);
  const setProductField = useCallback(<K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => {
    setProductForm(f => (f ? { ...f, draft: { ...f.draft, [k]: v }, fieldErrors: { ...f.fieldErrors, [k]: undefined } } : f));
  }, []);
  const setProductSpec = useCallback((label: string, value: string) => setProductForm(f => (f ? { ...f, specs: { ...f.specs, [label]: value } } : f)), []);
  const pickProductImage = useCallback((slot: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setProductForm(f => (f ? { ...f, error: 'Choose an image file (JPG, PNG or WebP).' } : f)); return; }
    const reader = new FileReader();
    reader.onload = () => setProductForm(f => (f ? { ...f, images: { ...f.images, [slot]: String(reader.result) }, error: null } : f));
    reader.readAsDataURL(file);
  }, []);
  const removeProductImage = useCallback((slot: string) => setProductForm(f => (f ? { ...f, images: { ...f.images, [slot]: '' } } : f)), []);

  const toLines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean);
  const saveProduct = useCallback(async () => {
    if (!productForm || productForm.busy) return;
    const { draft: add, editingId, specs, images: imageSlots } = productForm;
    const name = add.name.replace(/\s+/g, ' ').trim();
    const editing = editingId !== null;
    const fieldErrors = validateProduct(add, { editing, nameTaken: catalog.some(p => p.name.toLowerCase() === name.toLowerCase()) });
    if (Object.keys(fieldErrors).length) {
      setProductForm(f => (f ? { ...f, fieldErrors, error: Object.values(fieldErrors)[0] ?? null } : f));
      return;
    }
    if (offlineBlock()) return;
    const price = add.price.trim() === '' ? null : Number(add.price);
    const stockQty = add.stock.trim() === '' ? 0 : Number(add.stock);
    const order = Math.round(Number(add.order) || 0);
    const highlights = toLines(add.highlights);
    const recommendedFor = toLines(add.recommendedFor);
    // Specifications the form has no field for (added on the website) are kept as they are when editing.
    const keptSpecs = editing ? (catalog.find(p => p.id === editingId)?.specifications ?? []).filter(s => !SPEC_LABELS.includes(s.label)) : [];
    const specifications = [
      ...SPEC_FIELDS.map(([label]) => ({ label, value: (specs[label] ?? '').trim() })).filter(s => s.value !== ''),
      ...keptSpecs,
    ];
    const images = IMAGE_SLOTS.map(([slot]) => imageSlots[slot]).filter((v): v is string => !!v);
    setProductForm(f => (f ? { ...f, busy: true, error: null, fieldErrors: {} } : f));
    const fail = (msg: string) => setProductForm(f => (f ? { ...f, busy: false, error: msg } : f));
    try {
      const fields = {
        category: add.category, size: add.size.trim() || null, sku: add.sku.trim() || null,
        price, stock_quantity: stockQty, is_active: add.active, is_featured: add.featured, display_order: order,
        description: add.description.trim() || null, long_description: add.longDescription.trim() || null,
        highlights, recommended_for: recommendedFor, specifications,
        usage_instructions: add.usage.trim() || null, storage_instructions: add.storage.trim() || null, ingredients: add.ingredients.trim() || null,
        images,
      };
      const res = await fetch('/api/seller/products', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Editing never sends a name or slug: they identify the product on the website and are not changed here.
        body: JSON.stringify(editing ? { id: editingId, ...fields } : { name, slug: add.slug.trim() || null, ...fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { checkSession(res); fail(res.status === 401 ? 'Your session has ended. Sign in again, then save.' : data.error || (editing ? 'Could not save the changes.' : 'Could not add the product.')); return; }
      if (editing) {
        // Show the saved listing straight away (images come back as their stored URLs).
        const saved = data.product ?? {};
        setCatalog(prev => prev.map(p => (p.id !== editingId ? p : {
          ...p, category: add.category, size: add.size.trim(), sku: add.sku.trim() || null, price, stock_quantity: stockQty,
          description: add.description.trim(), long_description: add.longDescription.trim(), highlights, specifications,
          usage_instructions: add.usage.trim(), storage_instructions: add.storage.trim(), ingredients: add.ingredients.trim(),
          recommended_for: recommendedFor, is_featured: add.featured, is_active: add.active, order,
          images: Array.isArray(saved.images) ? saved.images : images, image: saved.image ?? images[0] ?? '',
        })));
        setProductForm(null);
        showToast(`${name} saved${add.active ? '' : ' · hidden on the website'}`);
        return;
      }
      const id: number = data.product?.id ?? (Math.max(0, ...catalog.map(p => p.id)) + 1);
      const product: CatalogProduct = {
        id, name, slug: (add.slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')), category: add.category, size: add.size.trim(),
        sku: add.sku.trim() || null, price, stock_quantity: stockQty, description: add.description.trim(), long_description: add.longDescription.trim(),
        image: images[0] ?? '', images, highlights, specifications, usage_instructions: add.usage.trim(), storage_instructions: add.storage.trim(),
        ingredients: add.ingredients.trim(), recommended_for: recommendedFor, rating: null, rating_count: 0, is_featured: add.featured,
        is_active: add.active, order, translations: [],
      };
      setCatalog(prev => [...prev, product]);
      setOwnedIds(prev => [...prev, id]);
      setProductForm(null);
      showToast(`${name} added${add.active ? ' · live on website' : ''}`);
    } catch {
      fail('Could not reach the server. Please try again.');
    }
  }, [productForm, catalog, offlineBlock, showToast, checkSession]);

  /* ---------- Counts used by navigation badges ---------- */
  const toConfirm = myOrders.filter(o => o.order.status === 'pending').length;
  const toShip = myOrders.filter(o => o.order.status === 'confirmed' || o.order.status === 'ready_for_dispatch').length;
  const payoutsDue = myOrders.filter(o => o.payout === 'Due').length;
  const lateShipments = useMemo(
    () => myOrders.filter(o => sellerTrackingFor(o.order, shipmentDetails[o.order.id]).delayed).length,
    [myOrders, shipmentDetails],
  );

  /* ---------- Desktop-only view state ---------- */
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => { setSearchQuery(''); setNotifsOpen(false); }, [route.screen]);

  return {
    user, seller, live, isMobile,
    orders, catalog, myProducts, myOrders, mixedOrderIds, stock, stockAlerts, shipmentDetails, movements,
    counts: { toConfirm, toShip, payoutsDue, lateShipments },
    lastSync, syncing, syncError, refresh,
    toast, showToast, dismissToast,
    notifications, unreadCount, seenNotifs, dismissNotification, clearNotifications, markNotificationsSeen, notifsOpen, setNotifsOpen,
    busyOrderIds, advanceOrder, rejectOrder, advanceManualStage, trackOrder, nextManualStep,
    confirmCard, confirmOrder, openConfirmCard, closeConfirmCard, setConfirmField, saveConfirmCard,
    restock, openRestock, closeRestock, setRestockField, saveRestock,
    productForm, openAddProduct, openEditProduct, closeProductForm, setProductField, setProductSpec, pickProductImage, removeProductImage, saveProduct,
    searchQuery, setSearchQuery,
  };
}

export type SellerStore = ReturnType<typeof useSellerState>;

const SellerContext = createContext<SellerStore | null>(null);

export function SellerProvider({ children, ...props }: Props) {
  const value = useSellerState(props);
  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>;
}

export function useSeller(): SellerStore {
  const v = useContext(SellerContext);
  if (!v) throw new Error('useSeller must be used inside <SellerProvider>');
  return v;
}
