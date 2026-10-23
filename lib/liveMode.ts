import { SALES_ORDERS, TELECALLERS, TRACKER_PRODUCTS, TRACKER_SALES, WEB_ENQUIRIES, type SalesOrder, type TrackerSale } from '../data/managerDashboard';
import { INITIAL_COMPLAINTS } from '../data/complaints';
import { SAMPLE_CAMPAIGNS } from '../data/marketing';
import { INITIAL_CUSTOMERS, INITIAL_FPOS, INITIAL_FRANCHISES, INITIAL_TRANSACTIONS } from '../data/initialData';
import { INITIAL_STOCK } from '../data/centralInventory';

/**
 * Live mode: the dashboards are connected to the CRM backend, so they must show what is really in it
 * (including nothing, on a fresh install) and never the made-up sample data that powers the offline demo.
 *
 * Several pages start from these sample lists directly, so they are emptied in place: every module that
 * imported one sees the change. Without a backend nothing is touched and the offline demo works as before.
 */
export function emptySampleData(): void {
  for (const list of [
    SALES_ORDERS, TRACKER_SALES, WEB_ENQUIRIES, INITIAL_COMPLAINTS, SAMPLE_CAMPAIGNS,
    INITIAL_CUSTOMERS, INITIAL_FRANCHISES, INITIAL_FPOS, INITIAL_TRANSACTIONS, INITIAL_STOCK,
    // The sample executives: without this, a backend with no executives falls back
    // to showing these fake names (workload, assignment lists, etc.).
    TELECALLERS,
  ] as unknown[][]) {
    list.length = 0;
  }
}

/**
 * Put the backend's real telecalling sales where the dashboards read them (TRACKER_SALES, replaced in place so every
 * page that imported it sees them). Called after emptySampleData, so a failed load shows no sales rather than made-up ones.
 */
export function applySales(list: TrackerSale[]): void {
  TRACKER_SALES.splice(0, TRACKER_SALES.length, ...list);
  registerSaleProducts(list);
}

/**
 * Put the backend's real orders where the telecalling pages read them (SALES_ORDERS, replaced in place like applySales),
 * so order lookups (complaint drawer, assignment hints, raising a complaint against an order) find live orders.
 */
export function applyOrders(list: SalesOrder[]): void {
  SALES_ORDERS.splice(0, SALES_ORDERS.length, ...list);
}

/**
 * Teach the shared product lookup (TRACKER_PRODUCTS, behind productName / productOf on every sales page) about any product
 * that arrives with a sale but is not in it: one added after the dashboards were built, such as a website product the
 * sales tracker has just met for the first time. Without this its sales would read "—" with no product line.
 */
export function registerSaleProducts(sales: TrackerSale[]): void {
  for (const s of sales) {
    if (s.product_name && !TRACKER_PRODUCTS.some(p => p.id === s.product_id)) {
      TRACKER_PRODUCTS.push({ id: s.product_id, vertical_id: s.vertical_id ?? 1, name: s.product_name, price: s.quantity > 0 ? Math.round(s.amount / s.quantity) : 0 });
    }
  }
}
