// Exports the frontend's canonical demo data to JSON so the CRM backend can seed
// the exact same rows (same ids, same values). Run: npx tsx scripts/export-seed.ts
// Output goes to ../manikstu_crm_backend/database/seed/*.json
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import {
  VERTICALS, STAGES, TRACKER_PRODUCTS, TELECALLERS,
  TRACKER_LEADS, LEAD_ACTIVITIES, FOLLOWUPS, TRACKER_SALES,
  SALES_ORDERS, WEB_ENQUIRIES,
} from '../data/managerDashboard';
import { INITIAL_CUSTOMERS, INITIAL_TRANSACTIONS } from '../data/initialData';
import { STOCK_POINTS, INITIAL_STOCK } from '../data/centralInventory';
import { CATALOG_PRODUCTS } from '../data/catalogProducts';

const OUT = path.resolve(__dirname, '..', '..', 'manikstu_crm_backend', 'database', 'seed');
mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) => {
  writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 0));
  console.log(`${name}.json`, Array.isArray(data) ? data.length : '');
};

const numId = (s: string) => Number(String(s).replace(/\D/g, ''));

// ---- Reference ----
write('verticals', VERTICALS.map(v => ({ id: v.id, name: v.name, slug: v.slug, is_active: v.is_active })));
write('stages', STAGES.map(s => ({ id: s.id, vertical_id: s.vertical_id, name: s.name, sort_order: s.sort_order })));
write('tracker_products', TRACKER_PRODUCTS.map(p => ({ id: p.id, vertical_id: p.vertical_id, name: p.name, price: p.price })));
write('telecallers', TELECALLERS.map(t => ({ id: t.id, name: t.name, region: t.region, is_active: t.is_active })));

// ---- Tracker ----
write('leads', TRACKER_LEADS.map(l => ({
  id: l.id, vertical_id: l.vertical_id, stage_id: l.stage_id, assigned_to: l.assigned_to,
  customer_name: l.customer_name, phone: l.phone, source: l.source,
  created_at: l.created_at, updated_at: l.updated_at,
})));
write('activities', LEAD_ACTIVITIES.map(a => ({
  id: a.id, lead_id: a.lead_id, caller_id: a.caller_id, stage_id: a.stage_id,
  note: a.note, outcome: a.outcome, duration_sec: a.duration_sec, created_at: a.created_at,
})));
write('followups', FOLLOWUPS.map(f => ({
  id: f.id, lead_id: f.lead_id, caller_id: f.caller_id, due_at: f.due_at,
  note: f.note, status: f.status, completed_at: f.completed_at,
})));
write('sales', TRACKER_SALES.map(s => ({
  id: s.id, lead_id: s.lead_id, product_id: s.product_id, caller_id: s.caller_id,
  customer_name: s.customer_name, quantity: s.quantity, amount: s.amount, sold_at: s.sold_at,
})));

// ---- Enquiries (customer_id references orders in the sample, so null it to avoid FK issues) ----
write('enquiries', WEB_ENQUIRIES.map(e => ({
  id: e.id, name: e.name, email: e.email, phone: e.phone, type: e.type, message: e.message,
  status: e.status, admin_notes: e.admin_notes, replied_at: e.replied_at,
  customer_id: null, lead_id: e.lead_id, received_at: e.created_at,
})));

// ---- Orders (+ items + status history) ----
write('orders', SALES_ORDERS.map(o => ({
  id: o.id, order_number: o.order_number, source: o.source, caller_id: o.caller_id,
  customer_name: o.customer_name, phone: o.phone, address: o.address, city: o.city,
  state: o.state, pincode: o.pincode, total: o.total, status: o.status,
  payment_status: o.payment_status, payment_method: o.payment_method, notes: o.notes,
  placed_at: o.created_at,
  items: o.items.map(i => ({ product_name: i.product_name, quantity: i.quantity, price: i.price })),
  status_history: o.status_history.map(h => ({ status: h.status, at: h.at })),
})));

// ---- Commerce ----
write('customers', INITIAL_CUSTOMERS.map(c => ({
  id: numId(c.id), name: c.name, phone: c.phone.replace(/\s/g, ''), location: c.location,
  status: c.status, orders_count: c.ordersCount, lifetime_value: c.lifetimeValue,
  land_holding: c.landHolding, crops: c.crops, livestock: c.livestock,
})));

const parseRupees = (s: string): number => {
  const t = String(s).replace(/[₹,\s]/g, '');
  if (t === '—' || t === '') return 0;
  if (/L$/i.test(t)) return Math.round(parseFloat(t) * 100000);
  if (/K$/i.test(t)) return Math.round(parseFloat(t) * 1000);
  return Math.round(Number(t) || 0);
};
write('transactions', INITIAL_TRANSACTIONS.map(t => ({
  id: numId(t.id), type: t.type, party: t.party, amount: t.amount, status: t.status, occurred_at: null,
})));

// ---- Inventory ----
write('catalog_products', CATALOG_PRODUCTS.map(p => ({
  id: p.id, name: p.name, slug: p.slug, category: p.category, price: p.price,
  image: p.image, is_active: p.is_active, display_order: p.order,
})));
write('stock_points', STOCK_POINTS.map(p => ({
  id: p.id, kind: p.kind, name: p.name, city: p.city, district: p.district, region: p.region,
})));
write('stock', INITIAL_STOCK.map(r => ({
  product_id: r.productId, point_id: r.pointId, stock: r.stock, reorder_level: r.reorderLevel,
  lead_time_days: r.leadTimeDays, restocked_days_ago: r.restockedDaysAgo,
})));

console.log('Exported to', OUT);
