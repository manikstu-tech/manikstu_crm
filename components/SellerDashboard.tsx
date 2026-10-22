'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Boxes, ImagePlus, LayoutDashboard, MapPin, ShoppingCart, Truck, Wallet } from 'lucide-react';
import Sidebar, { NavGroup } from './Sidebar';
import Topbar from './Topbar';
import FooterFrieze from './FooterFrieze';
import Modal from './Modal';
import NotificationsDrawer from './NotificationsDrawer';
import { LOW_STOCK_LEVEL } from '../data/stockLevels';
import SellerOverview from './seller/SellerOverview';
import SellerOrders from './seller/SellerOrders';
import SellerStock, { StockMovement } from './seller/SellerStock';
import SellerTracking from './seller/SellerTracking';
import SellerRegional from './seller/SellerRegional';
import SellerPayouts from './seller/SellerPayouts';
import SellerReports from './seller/SellerReports';
import type { CatalogProduct } from '../data/catalogProducts';
import type { OrderStatus, SalesOrder } from '../data/managerDashboard';
import type { Seller } from '../data/sellers';
import { nowStamp } from '../lib/format';
import { ManualStageAction, ORDER_STATUS_LABEL, ShipmentDetails, nextManualStep, sellerOrders, sellerTrackingFor, stockLevels } from './seller/sellerData';
import type { SessionUser } from '../lib/session';
import { isLiveOrder } from './telecaller/orderTracking';

/** How often the seller's order list is re-read from the CRM, so new website orders and status changes appear without a reload. */
const ORDER_REFRESH_MS = 15000;

interface Props {
  user: SessionUser;
  seller: Seller;
  /** Only this seller's orders, cut down to their items (see app/seller/page.tsx). */
  initialOrders: SalesOrder[];
  initialProducts: CatalogProduct[];
  /** Orders that also contain other sellers' items. */
  mixedOrderIds: number[];
}

export default function SellerDashboard({ user, seller, initialOrders, initialProducts, mixedOrderIds }: Props) {
  const [activePage, setActivePage] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  /** An order to open on the Tracking page (set by Track, Mark packed, Mark shipped…). It opens that order's tracking
   * details over the full list rather than filtering the list down to it, so the tabs and counts stay honest. */
  const [trackFocus, setTrackFocus] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // A stock warning shows in the alert colour, not with the usual "done" tick.
  const [toastWarning, setToastWarning] = useState(false);

  // Sample data, kept in this page for now: changes reset on refresh until the backend has sellers.
  const [orders, setOrders] = useState<SalesOrder[]>(initialOrders);
  // Status changes in flight to the server. While any are, a refresh would read the old status back and undo the click.
  const pendingSaves = useRef(0);
  useEffect(() => {
    const id = setInterval(async () => {
      if (pendingSaves.current > 0 || document.hidden) return;
      try {
        const res = await fetch('/api/seller/orders', { cache: 'no-store' });
        if (!res.ok) return; // offline demo or signed out: keep what is on screen
        const body = await res.json();
        if (pendingSaves.current === 0 && Array.isArray(body.data)) setOrders(body.data as SalesOrder[]);
      } catch {
        /* server briefly unreachable: try again next tick */
      }
    }, ORDER_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const [catalog, setCatalog] = useState<CatalogProduct[]>(initialProducts);
  // Product ids this seller owns; grows when they add a product.
  const [ownedIds, setOwnedIds] = useState<number[]>(seller.productIds);

  const myProducts = useMemo(() => catalog.filter(p => ownedIds.includes(p.id)), [catalog, ownedIds]);
  const myOrders = useMemo(() => sellerOrders(orders, seller, catalog), [orders, seller, catalog]);

  // Stock as customers see it: what each active product can still sell (the shelf minus unshipped orders), and
  // whether that is low (under LOW_STOCK_LEVEL) or out. The website uses the same figure.
  const stock = useMemo(() => stockLevels(myProducts.filter(p => p.is_active), myOrders), [myProducts, myOrders]);
  const stockAlerts = stock.filter(s => s.status !== 'in').length;

  // Notifications: things that need the seller's attention, newest concern first.
  const [isNotifsOpen, setIsNotifsOpen] = useState(false);
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([]);
  const notifications = useMemo(() => {
    const list: { id: string; title: string; message: string; time: string; type: 'warning' | 'success' | 'info' }[] = [];
    const toConfirm = myOrders.filter(o => o.order.status === 'pending');
    const toShip = myOrders.filter(o => o.order.status === 'confirmed' || o.order.status === 'ready_for_dispatch');
    const outOfStock = stock.filter(s => s.status === 'out');
    const lowStock = stock.filter(s => s.status === 'low').sort((a, b) => a.available - b.available);
    const dueAmount = myOrders.filter(o => o.payout === 'Due').reduce((s, o) => s + o.net, 0);

    if (toConfirm.length) list.push({ id: 'confirm', type: 'warning', title: `${toConfirm.length} order${toConfirm.length > 1 ? 's' : ''} to confirm`, message: 'New website orders are waiting for you to confirm them.', time: 'Now' });
    if (toShip.length) list.push({ id: 'ship', type: 'info', title: `${toShip.length} order${toShip.length > 1 ? 's' : ''} to pack & ship`, message: 'Confirmed orders are ready to be packed and dispatched.', time: 'Now' });
    // One alert per product that has run out, so a newly empty product shows up even after an earlier one was dismissed.
    outOfStock.forEach(({ p }) => list.push({ id: `oos:${p.id}`, type: 'warning', title: `${p.name} is out of stock`, message: 'Customers see it as out of stock on the website and cannot order it. Restock to start selling again.', time: 'Now' }));
    // Keyed by which products are low, so it comes back when another one joins them.
    if (lowStock.length) list.push({ id: `low:${lowStock.map(s => s.p.id).join(',')}`, type: 'info', title: `${lowStock.length} product${lowStock.length > 1 ? 's' : ''} low on stock`, message: `Under ${LOW_STOCK_LEVEL} left: ${lowStock.slice(0, 3).map(s => `${s.p.name} (${s.available})`).join(', ')}${lowStock.length > 3 ? '…' : ''}.`, time: 'Today' });
    if (dueAmount > 0) list.push({ id: 'payout', type: 'success', title: 'Payout due', message: `₹${dueAmount.toLocaleString('en-IN')} from delivered orders is due for payout.`, time: 'This week' });

    return list.filter(n => !dismissedNotifs.includes(n.id));
  }, [myOrders, stock, dismissedNotifs]);

  const showToast = (msg: string, warning = false) => {
    setToastMessage(msg);
    setToastWarning(warning);
    setTimeout(() => setToastMessage(null), warning ? 5000 : 3000);
  };

  // Say so the moment a product runs out or turns low (a new order arrived, an order was packed…), not only in the
  // drawer. The first render only records the starting levels. A product that is back in stock forgets its dismissed
  // out-of-stock alert, so running out again alerts again.
  const lastAvailable = useRef<Map<number, number> | null>(null);
  useEffect(() => {
    const prev = lastAvailable.current;
    lastAvailable.current = new Map(stock.map(s => [s.p.id, s.available]));
    if (!prev) return;
    const ranOut = stock.filter(s => s.status === 'out' && (prev.get(s.p.id) ?? 0) > 0);
    const turnedLow = stock.filter(s => s.status === 'low' && (prev.get(s.p.id) ?? 0) >= LOW_STOCK_LEVEL);
    const restocked = stock.filter(s => s.status !== 'out' && prev.get(s.p.id) === 0);
    if (ranOut.length) showToast(`${ranOut.map(s => s.p.name).join(', ')} ${ranOut.length > 1 ? 'are' : 'is'} now out of stock`, true);
    else if (turnedLow.length) showToast(`Low stock: ${turnedLow.map(s => `${s.p.name} (${s.available} left)`).join(', ')}`, true);
    if (restocked.length) setDismissedNotifs(prev => prev.filter(id => !restocked.some(s => id === `oos:${s.p.id}`)));
  }, [stock]);

  const advanceOrder = (orderId: number, to: OrderStatus) => {
    const at = nowStamp();
    const order = orders.find(o => o.id === orderId);
    const previousStatus = order?.status;
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: to, status_history: [...o.status_history, { status: to, at }] } : o)));
    if (order) showToast(`${order.order_number} marked ${ORDER_STATUS_LABEL[to].toLowerCase()}`);

    // Persist it. This used to be local state only, so a seller's confirmation
    // was lost on the next refresh and dispatch was never really gated. Move
    // the row optimistically, then put it back if the server disagrees — it is
    // the backend that decides which transitions are legal.
    pendingSaves.current += 1;
    void (async () => {
      try {
        const res = await fetch(`/api/seller/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: to }),
        });
        const body = await res.json().catch(() => ({}));
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
          if (previousStatus) {
            setOrders(prev => prev.map(o => (o.id === orderId
              ? { ...o, status: previousStatus, status_history: o.status_history.filter(h => !(h.status === to && h.at === at)) }
              : o)));
          }
          showToast(body.error ?? 'Could not save that change.');
        }
      } catch {
        if (previousStatus) {
          setOrders(prev => prev.map(o => (o.id === orderId
            ? { ...o, status: previousStatus, status_history: o.status_history.filter(h => !(h.status === to && h.at === at)) }
            : o)));
        }
        showToast('Could not reach the server.');
      } finally {
        pendingSaves.current -= 1;
      }
    })();
    // Once shipped or delivered, the seller's next job is tracking the delivery, so take them
    // straight there and filter to this order — a fresh shipment isn't "late" yet, so it sorts
    // near the bottom of the default list and would otherwise be invisible without this.
    if (to === 'shipped' || to === 'delivered') {
      setActivePage('tracking');
      setSearchQuery('');
      setTrackFocus(order?.order_number ?? null);
      window.scrollTo(0, 0);
    }
  };

  // Confirm order: the seller types in the courier and its tracking number by hand (the order id is already known).
  // Once saved, the row switches from "Confirm" to "View" (this same card, read/editable).
  const [shipmentDetails, setShipmentDetails] = useState<Record<number, ShipmentDetails>>({});
  const [confirmOrderId, setConfirmOrderId] = useState<number | null>(null);
  const [confirmCourier, setConfirmCourier] = useState('');
  const [confirmTrackingNo, setConfirmTrackingNo] = useState('');
  const confirmOrder = orders.find(o => o.id === confirmOrderId) ?? null;

  const openConfirmCard = (orderId: number) => {
    const existing = shipmentDetails[orderId];
    setConfirmOrderId(orderId);
    setConfirmCourier(existing?.courier ?? '');
    setConfirmTrackingNo(existing?.trackingNo ?? '');
  };
  const closeConfirmCard = () => setConfirmOrderId(null);

  const saveConfirmCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmOrderId === null || !confirmCourier.trim() || !confirmTrackingNo.trim()) return;
    const isFirstTime = confirmOrder?.status === 'pending';
    setShipmentDetails(prev => ({
      ...prev,
      [confirmOrderId]: {
        ...prev[confirmOrderId],
        courier: confirmCourier.trim(),
        trackingNo: confirmTrackingNo.trim(),
        confirmedAt: prev[confirmOrderId]?.confirmedAt ?? nowStamp(),
      },
    }));
    if (isFirstTime) {
      advanceOrder(confirmOrderId, 'confirmed');
    } else {
      showToast(`${confirmOrder?.order_number} tracking details updated`);
    }
    closeConfirmCard();
  };

  /** The seller clicking Mark packed / shipped / out for delivery / delivered, wherever that button lives. */
  const advanceManualStage = (orderId: number, action: ManualStageAction) => {
    if (action === 'shipped' || action === 'delivered') {
      advanceOrder(orderId, action);
      return;
    }
    const order = orders.find(o => o.id === orderId);
    // Packing is a real status on live orders (ready for dispatch), saved to the server so every dashboard sees it.
    if (action === 'packed' && order && isLiveOrder(order)) {
      advanceOrder(orderId, 'ready_for_dispatch');
      setActivePage('tracking');
      setSearchQuery('');
      setTrackFocus(order.order_number);
      window.scrollTo(0, 0);
      return;
    }
    const field = action === 'packed' ? 'packedAt' : 'outForDeliveryAt';
    setShipmentDetails(prev => {
      const existing = prev[orderId] ?? { courier: '', trackingNo: '', confirmedAt: nowStamp() };
      return { ...prev, [orderId]: { ...existing, [field]: nowStamp() } };
    });
    if (order) showToast(`${order.order_number} marked ${action === 'packed' ? 'packed' : 'out for delivery'}`);
    setActivePage('tracking');
    setSearchQuery('');
    setTrackFocus(order?.order_number ?? null);
    window.scrollTo(0, 0);
  };

  // Restock (Stock page): adds units and records the movement
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [restocking, setRestocking] = useState<CatalogProduct | null>(null);
  const [restockUnits, setRestockUnits] = useState('');
  const [restockNote, setRestockNote] = useState('');
  const openRestock = (p: CatalogProduct, suggested: number) => {
    setRestocking(p);
    setRestockUnits(String(suggested > 0 ? suggested : 10));
    setRestockNote('');
  };
  const saveRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restocking) return;
    const target = restocking;
    const note = restockNote.trim();
    const units = Math.round(Number(restockUnits));
    if (!(units > 0)) return;
    // Optimistic: show the new total straight away, then persist to the backend.
    setCatalog(prev => prev.map(p => (p.id === target.id ? { ...p, stock_quantity: p.stock_quantity + units } : p)));
    setMovements(prev => [...prev, { id: prev.length + 1, productId: target.id, units, note, at: nowStamp() }]);
    setRestocking(null);
    showToast(`${target.name}: +${units} units added to stock`);
    try {
      const res = await fetch(`/api/seller/products/${target.id}/restock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Roll the optimistic add back and tell the seller it didn't save.
        setCatalog(prev => prev.map(p => (p.id === target.id ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - units) } : p)));
        showToast(data.error || 'Could not save the restock. Please try again.');
        return;
      }
      // Trust the backend's authoritative total when it sends one.
      if (typeof data.product?.stock_quantity === 'number') {
        setCatalog(prev => prev.map(p => (p.id === target.id ? { ...p, stock_quantity: data.product.stock_quantity } : p)));
      }
    } catch {
      setCatalog(prev => prev.map(p => (p.id === target.id ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - units) } : p)));
      showToast('Could not reach the server. Please try again.');
    }
  };

  // Add product (Stock page): create a full listing, laid out like the website admin panel.
  const [adding, setAdding] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const SPEC_FIELDS: [label: string, placeholder: string][] = [
    ['Form', 'e.g. Pellet / Powder / Liquid'],
    ['Packaging Type', 'e.g. Bag / Bottle / Sachet'],
    ['Grade Standard', 'e.g. Feed Grade / Food Grade'],
    ['Shelf Life', 'e.g. 12 months'],
    ['Type Of Supplement', 'e.g. Nutritional Supplement'],
    ['Packaging', 'e.g. 500 ml / 25 kg'],
    ['Country of Origin', 'e.g. Made in India'],
  ];
  const emptyAdd = {
    name: '', slug: '', category: 'Health' as 'Health' | 'Nutrition', size: '', sku: '', price: '', stock: '', order: '0',
    active: true, featured: false, description: '', longDescription: '', highlights: '', recommendedFor: '',
    usage: '', storage: '', ingredients: '',
  };
  const [add, setAdd] = useState(emptyAdd);
  const [addSpecs, setAddSpecs] = useState<Record<string, string>>({});
  const [addImages, setAddImages] = useState<Record<string, string>>({}); // slot -> data URL
  const setAddField = <K extends keyof typeof emptyAdd>(k: K, v: (typeof emptyAdd)[K]) => setAdd(prev => ({ ...prev, [k]: v }));
  const pickImage = (slot: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAddImages(prev => ({ ...prev, [slot]: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  /** The product being edited (null when adding a new one). The same form serves both. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const openAddProduct = () => { setEditingId(null); setAdd(emptyAdd); setAddSpecs({}); setAddImages({}); setAddError(null); setAdding(true); };
  const SPEC_LABELS = SPEC_FIELDS.map(([label]) => label);
  /** Open a product's listing for editing: the form is filled with what is there now. */
  const openEditProduct = (p: CatalogProduct) => {
    setEditingId(p.id);
    setAdd({
      name: p.name, slug: p.slug, category: (p.category === 'Nutrition' ? 'Nutrition' : 'Health'), size: p.size ?? '', sku: p.sku ?? '',
      price: p.price === null ? '' : String(p.price), stock: String(p.stock_quantity), order: String(p.order),
      active: p.is_active, featured: p.is_featured, description: p.description, longDescription: p.long_description,
      highlights: p.highlights.join('\n'), recommendedFor: p.recommended_for.join('\n'),
      usage: p.usage_instructions, storage: p.storage_instructions, ingredients: p.ingredients,
    });
    setAddSpecs(Object.fromEntries(p.specifications.filter(s => SPEC_LABELS.includes(s.label)).map(s => [s.label, s.value])));
    const slots = ['main', 'angle1', 'angle2', 'angle3'];
    const imgs = p.images.length ? p.images : p.image ? [p.image] : [];
    setAddImages(Object.fromEntries(imgs.slice(0, 4).map((url, i) => [slots[i], url])));
    setAddError(null);
    setAdding(true);
  };
  const toLines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean);
  const saveAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = add.name.replace(/\s+/g, ' ').trim();
    if (name.length < 3) { setAddError('Enter a product name (at least 3 characters).'); return; }
    const editing = editingId !== null;
    if (!editing && catalog.some(p => p.name.toLowerCase() === name.toLowerCase())) { setAddError('A product with this name already exists.'); return; }
    const price = add.price.trim() === '' ? null : Math.max(0, Math.round(Number(add.price)));
    const stock = Math.max(0, Math.round(Number(add.stock) || 0));
    const highlights = toLines(add.highlights);
    const recommendedFor = toLines(add.recommendedFor);
    // Specifications the form has no field for (added on the website) are kept as they are when editing.
    const keptSpecs = editing ? (catalog.find(p => p.id === editingId)?.specifications ?? []).filter(s => !SPEC_LABELS.includes(s.label)) : [];
    const specifications = [
      ...SPEC_FIELDS
        .map(([label]) => ({ label, value: (addSpecs[label] ?? '').trim() }))
        .filter(s => s.value !== ''),
      ...keptSpecs,
    ];
    const images = Object.entries(addImages).filter(([, v]) => v).map(([, v]) => v);
    setAddBusy(true);
    setAddError(null);
    try {
      const fields = {
        category: add.category, size: add.size.trim() || null, sku: add.sku.trim() || null,
        price, stock_quantity: stock, is_active: add.active, is_featured: add.featured, display_order: Math.round(Number(add.order) || 0),
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
      if (!res.ok) { setAddError(data.error || (editing ? 'Could not save the changes.' : 'Could not add the product.')); setAddBusy(false); return; }
      if (editing) {
        // Show the saved listing straight away (images come back as their stored URLs).
        const saved = data.product ?? {};
        setCatalog(prev => prev.map(p => (p.id !== editingId ? p : {
          ...p, category: add.category, size: add.size.trim(), sku: add.sku.trim() || null, price, stock_quantity: stock,
          description: add.description.trim(), long_description: add.longDescription.trim(), highlights, specifications,
          usage_instructions: add.usage.trim(), storage_instructions: add.storage.trim(), ingredients: add.ingredients.trim(),
          recommended_for: recommendedFor, is_featured: add.featured, is_active: add.active, order: Math.round(Number(add.order) || 0),
          images: Array.isArray(saved.images) ? saved.images : images, image: saved.image ?? images[0] ?? '',
        })));
        setAdding(false);
        setAddBusy(false);
        showToast(`${name} saved${add.active ? '' : ' · hidden on the website'}`);
        return;
      }
      const id: number = data.product?.id ?? (Math.max(0, ...catalog.map(p => p.id)) + 1);
      const product: CatalogProduct = {
        id, name, slug: (add.slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')), category: add.category, size: add.size.trim(),
        sku: add.sku.trim() || null, price, stock_quantity: stock, description: add.description.trim(), long_description: add.longDescription.trim(),
        image: images[0] ?? '', images, highlights, specifications, usage_instructions: add.usage.trim(), storage_instructions: add.storage.trim(),
        ingredients: add.ingredients.trim(), recommended_for: recommendedFor, rating: null, rating_count: 0, is_featured: add.featured,
        is_active: add.active, order: Math.round(Number(add.order) || 0), translations: [],
      };
      setCatalog(prev => [...prev, product]);
      setOwnedIds(prev => [...prev, id]);
      setAdding(false);
      setAddBusy(false);
      showToast(`${name} added${add.active ? ' · live on website' : ''}`);
    } catch {
      setAddError('Could not reach the server. Please try again.');
      setAddBusy(false);
    }
  };

  // Matches what the Orders page shows: new orders still waiting to be confirmed.
  const toConfirm = myOrders.filter(o => o.order.status === 'pending').length;
  const toShip = myOrders.filter(o => o.order.status === 'confirmed' || o.order.status === 'ready_for_dispatch').length;
  const due = myOrders.filter(o => o.payout === 'Due').length;
  const lateShipments = useMemo(
    () => myOrders.filter(o => sellerTrackingFor(o.order, shipmentDetails[o.order.id]).delayed).length,
    [myOrders, shipmentDetails],
  );

  const pageMeta: Record<string, { title: string; sub: string }> = {
    overview: { title: 'Seller Dashboard', sub: `Your sales on Manikstu, ${user.name.split(' ')[0]}: orders to ship, stock and earnings.` },
    orders:   { title: 'Orders',           sub: 'New orders to confirm or reject, and the orders you have already confirmed. Follow deliveries in Tracking.' },
    stock:    { title: 'Stock',            sub: 'What you have, what is promised to customers, how long it lasts and what to restock.' },
    tracking: { title: 'Tracking',         sub: 'Where each of your orders is: courier, tracking number, expected delivery and history.' },
    regional: { title: 'Regional Report',  sub: 'Where your products sell: orders and customers by state, district, town and PIN code.' },
    payouts:  { title: 'Payouts',          sub: 'What you earn from each order after Manikstu commission, and when it is paid.' },
    reports:  { title: 'Reports',          sub: 'Your orders, payouts and stock, exportable to Excel or PDF.' },
  };
  const currentMeta = pageMeta[activePage] ?? pageMeta.overview;

  const navGroups: NavGroup[] = [
    { label: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: LayoutDashboard }] },
    {
      label: 'Sell',
      items: [
        { key: 'orders', label: 'Orders', icon: ShoppingCart, count: toConfirm },
        { key: 'stock', label: 'Stock', icon: Boxes, count: stockAlerts },
        { key: 'tracking', label: 'Tracking', icon: Truck, count: lateShipments + toShip },
        { key: 'regional', label: 'Regional report', icon: MapPin },
      ],
    },
    {
      label: 'Money',
      items: [
        { key: 'payouts', label: 'Payouts', icon: Wallet, count: due },
        { key: 'reports', label: 'Reports', icon: BarChart3 },
      ],
    },
  ];

  const handleNavigate = (page: string) => {
    setActivePage(page);
    setSearchQuery('');
    window.scrollTo(0, 0);
  };

  return (
    <div className="card-layout">
      {toastMessage && (
        <div className={`toast ${toastWarning ? 'toast-error' : ''}`} role={toastWarning ? 'alert' : 'status'}>
          {toastWarning ? '⚠️' : '✅'} {toastMessage}
        </div>
      )}

      <div className="shell">
        <Sidebar groups={navGroups} activePage={activePage} onSelectPage={handleNavigate} />

        <main className="main">
          <Topbar
            title={currentMeta.title}
            subtitle={currentMeta.sub}
            search={activePage === 'orders' || activePage === 'stock' || activePage === 'tracking'
              ? {
                  query: searchQuery,
                  onChange: setSearchQuery,
                  placeholder: activePage === 'stock' ? 'Search products…' : activePage === 'tracking' ? 'Search order, customer, city, AWB…' : 'Search order, customer, city, product…',
                }
              : undefined}
            notifications={{ count: notifications.length, onToggle: () => setIsNotifsOpen(o => !o), title: 'Seller alerts' }}
            profile={{ name: user.name, role: seller.business, initials: user.initials, detail: `Seller ID ${user.staffId} · ${seller.city}` }}
          />

          {activePage === 'overview' && (
            <SellerOverview
              orders={myOrders}
              products={myProducts}
              onNavigate={handleNavigate}
              shipmentDetails={shipmentDetails}
              onAdvanceStage={advanceManualStage}
              onOpenConfirm={openConfirmCard}
            />
          )}
          {activePage === 'orders' && (
            <SellerOrders
              orders={myOrders}
              mixedOrderIds={mixedOrderIds}
              searchQuery={searchQuery}
              onOpenConfirm={openConfirmCard}
              onReject={id => advanceOrder(id, 'rejected')}
              onTrack={orderNumber => { setActivePage('tracking'); setSearchQuery(''); setTrackFocus(orderNumber); window.scrollTo(0, 0); }}
            />
          )}
          {activePage === 'stock' && <SellerStock products={myProducts} orders={myOrders} movements={movements} searchQuery={searchQuery} onRestock={openRestock} onEditProduct={openEditProduct} onAddProduct={openAddProduct} />}
          {activePage === 'tracking' && (
            <SellerTracking
              orders={myOrders}
              searchQuery={searchQuery}
              shipmentDetails={shipmentDetails}
              onAdvanceStage={advanceManualStage}
              focusOrderNumber={trackFocus}
              onFocusHandled={() => setTrackFocus(null)}
              onOpenConfirm={openConfirmCard}
            />
          )}
          {activePage === 'regional' && <SellerRegional seller={seller} orders={myOrders} onToast={showToast} />}
          {activePage === 'payouts' && <SellerPayouts orders={myOrders} seller={seller} />}
          {activePage === 'reports' && <SellerReports seller={seller} orders={myOrders} products={myProducts} onToast={showToast} />}
          <footer className="site-footer">
            <div>© 2026 Manikstu Agri Network · Seller Hub</div>
          </footer>
          <FooterFrieze />
        </main>
      </div>

      <NotificationsDrawer
        isOpen={isNotifsOpen}
        onClose={() => setIsNotifsOpen(false)}
        notifications={notifications}
        onClearAll={() => setDismissedNotifs(notifications.map(n => n.id))}
        title="Seller alerts"
      />

      <Modal
        isOpen={confirmOrder !== null}
        onClose={closeConfirmCard}
        title={confirmOrder ? `${confirmOrder.status === 'pending' ? 'Confirm order' : 'Order details'} · ${confirmOrder.order_number}` : ''}
        closeOnBackdrop={false}
      >
        {confirmOrder && (
          <form onSubmit={saveConfirmCard}>
            <p className="loc" style={{ marginBottom: 14 }}>
              {confirmOrder.status === 'pending'
                ? 'Add the courier and its tracking number to confirm this order.'
                : 'The courier and tracking number saved for this order.'}
            </p>
            <div className="form-group">
              <label htmlFor="sc-courier">Courier name</label>
              <input
                id="sc-courier"
                type="text"
                required
                placeholder="e.g. India Post, Delhivery, DTDC"
                value={confirmCourier}
                onChange={e => setConfirmCourier(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sc-tracking-no">Tracking No.</label>
              <input
                id="sc-tracking-no"
                type="text"
                required
                placeholder="Courier tracking / AWB number"
                value={confirmTrackingNo}
                onChange={e => setConfirmTrackingNo(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={closeConfirmCard}>Cancel</button>
              {(() => {
                const step = nextManualStep(confirmOrder, shipmentDetails[confirmOrder.id]);
                return step && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { advanceManualStage(confirmOrder.id, step.action); closeConfirmCard(); }}
                  >
                    {step.label}
                  </button>
                );
              })()}
              <button type="submit" className="btn-primary">{confirmOrder.status === 'pending' ? 'Confirm order' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={restocking !== null} onClose={() => setRestocking(null)} title={`Restock · ${restocking?.name ?? ''}`} closeOnBackdrop={false}>
        {restocking && (
          <form onSubmit={saveRestock}>
            <p className="loc" style={{ marginBottom: 14 }}>
              In stock now: <strong>{restocking.stock_quantity}</strong> units ({restocking.size}). The units you add are counted straight away.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="rs-units">Units received</label>
                <input id="rs-units" type="number" min={1} step={1} required value={restockUnits} onChange={e => setRestockUnits(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="rs-note">Batch / note (optional)</label>
                <input id="rs-note" type="text" placeholder="e.g. Batch 24-09, invoice 1182" value={restockNote} onChange={e => setRestockNote(e.target.value)} />
              </div>
            </div>
            <div className="form-total">New stock: <strong>{restocking.stock_quantity + Math.max(0, Math.round(Number(restockUnits)) || 0)}</strong> units</div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setRestocking(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Add to stock</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={adding} onClose={() => setAdding(false)} title={editingId !== null ? `Edit ${add.name}` : 'Add a product'} closeOnBackdrop={false} wide>
        <form onSubmit={saveAddProduct} className="product-form">
          <div className="pf-grid">
            <div className="pf-main">
              <section className="pf-section">
                <h3 className="pf-section-title">Basics</h3>
                <div className="form-group">
                  <label htmlFor="ap-name">Product name *</label>
                  <input id="ap-name" type="text" required placeholder="e.g. Calcium Syrup" value={add.name} readOnly={editingId !== null} title={editingId !== null ? 'The name identifies this product on the website and cannot be changed here' : undefined} onChange={e => setAddField('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-slug">Slug <span className="pf-hint">leave blank to generate from the name</span></label>
                  <input id="ap-slug" type="text" placeholder="calcium-syrup" value={add.slug} readOnly={editingId !== null} onChange={e => setAddField('slug', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-desc">Short description</label>
                  <textarea id="ap-desc" rows={2} placeholder="One-line summary shown on product cards." value={add.description} onChange={e => setAddField('description', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-long">Full description</label>
                  <textarea id="ap-long" rows={4} placeholder="Shown on the product detail page." value={add.longDescription} onChange={e => setAddField('longDescription', e.target.value)} />
                </div>
              </section>

              <section className="pf-section">
                <h3 className="pf-section-title">Highlights &amp; details</h3>
                <div className="form-group">
                  <label htmlFor="ap-high">Highlights <span className="pf-hint">one per line</span></label>
                  <textarea id="ap-high" rows={3} placeholder={'Boosts immunity\nImproves milk yield'} value={add.highlights} onChange={e => setAddField('highlights', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-rec">Recommended for <span className="pf-hint">one per line</span></label>
                  <textarea id="ap-rec" rows={2} placeholder={'Goats\nSheep'} value={add.recommendedFor} onChange={e => setAddField('recommendedFor', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Product specifications <span className="pf-hint">only rows with a value appear on the website</span></label>
                  <div className="pf-specs">
                    {SPEC_FIELDS.map(([label, placeholder]) => (
                      <div key={label} className="pf-spec-row">
                        <span className="pf-spec-label">{label}</span>
                        <input type="text" placeholder={placeholder} value={addSpecs[label] ?? ''} onChange={e => setAddSpecs(prev => ({ ...prev, [label]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="ap-use">Usage / dosage</label>
                  <textarea id="ap-use" rows={2} value={add.usage} onChange={e => setAddField('usage', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-store">Storage &amp; handling</label>
                  <textarea id="ap-store" rows={2} value={add.storage} onChange={e => setAddField('storage', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-ing">Composition / ingredients</label>
                  <textarea id="ap-ing" rows={2} value={add.ingredients} onChange={e => setAddField('ingredients', e.target.value)} />
                </div>
              </section>

              <section className="pf-section">
                <h3 className="pf-section-title">Product images</h3>
                <p className="pf-hint" style={{ display: 'block', marginBottom: 10 }}>One main image (shown first) and up to three angle views. JPG, PNG or WebP.</p>
                <div className="pf-images">
                  {[['main', 'Main image'], ['angle1', 'Angle view 1'], ['angle2', 'Angle view 2'], ['angle3', 'Angle view 3']].map(([slot, label]) => (
                    <label key={slot} className="pf-img-slot">
                      {addImages[slot]
                        ? <img src={addImages[slot]} alt={label} />
                        : <span className="pf-img-ph"><ImagePlus size={20} /><span>Upload</span></span>}
                      <span className="pf-img-label">{label}</span>
                      <input type="file" accept="image/*" hidden onChange={e => pickImage(slot, e.target.files?.[0])} />
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <aside className="pf-side">
              <section className="pf-section">
                <h3 className="pf-section-title">Publish</h3>
                <label className="check-filter" style={{ display: 'flex' }}>
                  <input type="checkbox" checked={add.active} onChange={e => setAddField('active', e.target.checked)} />
                  Published <span className="pf-hint">live on the website</span>
                </label>
                <label className="check-filter" style={{ display: 'flex', marginTop: 8 }}>
                  <input type="checkbox" checked={add.featured} onChange={e => setAddField('featured', e.target.checked)} />
                  Featured
                </label>
              </section>

              <section className="pf-section">
                <h3 className="pf-section-title">Organisation</h3>
                <div className="form-group">
                  <label htmlFor="ap-cat">Category</label>
                  <select id="ap-cat" className="filter-select" value={add.category} onChange={e => setAddField('category', e.target.value as 'Health' | 'Nutrition')} style={{ width: '100%' }}>
                    <option value="Health">Health</option>
                    <option value="Nutrition">Nutrition</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="ap-order">Order <span className="pf-hint">lower shows first</span></label>
                  <input id="ap-order" type="number" step={1} value={add.order} onChange={e => setAddField('order', e.target.value)} />
                </div>
              </section>

              <section className="pf-section">
                <h3 className="pf-section-title">Pricing &amp; stock</h3>
                <div className="form-group">
                  <label htmlFor="ap-price">Price (₹)</label>
                  <input id="ap-price" type="number" min={0} step={1} placeholder="Not set" value={add.price} onChange={e => setAddField('price', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-size">Size / unit</label>
                  <input id="ap-size" type="text" placeholder="e.g. 500 ml" value={add.size} onChange={e => setAddField('size', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-sku">SKU / product ID</label>
                  <input id="ap-sku" type="text" placeholder="Optional" value={add.sku} onChange={e => setAddField('sku', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="ap-stock">Opening stock (units)</label>
                  <input id="ap-stock" type="number" min={0} step={1} placeholder="0" value={add.stock} onChange={e => setAddField('stock', e.target.value)} />
                </div>
              </section>
            </aside>
          </div>

          {addError && <p className="loc" style={{ color: 'var(--rust)', margin: '4px 0 12px' }}>{addError}</p>}
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={addBusy}>{addBusy ? (editingId !== null ? 'Saving…' : 'Adding…') : (editingId !== null ? 'Save changes' : 'Add product')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
