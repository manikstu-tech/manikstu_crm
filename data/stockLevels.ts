/**
 * Fewer than this many units available counts as low stock; 0 is out of stock. The same rule as the CRM backend
 * (App\Services\CatalogStock) and the website storefront, so every screen agrees.
 */
export const LOW_STOCK_LEVEL = 30;

export type StockStatus = 'in' | 'low' | 'out';

export const stockStatusOf = (available: number): StockStatus =>
  available <= 0 ? 'out' : available < LOW_STOCK_LEVEL ? 'low' : 'in';

/** Order statuses whose units are promised to a customer but still on the shelf (not handed to the courier yet). */
export const RESERVING_STATUSES: ReadonlySet<string> = new Set(['pending', 'confirmed', 'ready_for_dispatch']);
