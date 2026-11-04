// The invoice a seller prints for a confirmed order: their own items only, with no commission or payout figures, since
// the customer sees this page. The backend stores no tax rates, so tax is not split out, and orders have no separate
// invoice series, so the order number identifies it.

import type { OrderItem, SalesOrder } from '../data/managerDashboard';
import { shortDateTime } from './format';
import { formatDeliveryAddress, formatMobile } from './orderDisplay';

interface InvoiceInput {
  order: Pick<SalesOrder, 'order_number' | 'created_at' | 'customer_name' | 'phone' | 'address' | 'city' | 'state' | 'pincode' | 'payment_method' | 'payment_status'>;
  items: OrderItem[];
  seller: { business: string; city?: string | null; gstin?: string | null };
  /** The order also has other sellers' items, which are not on this invoice. */
  partial?: boolean;
}

/** Customers type names and addresses, so everything goes through here before it reaches the page. */
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const amount = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_STATUS: Record<string, string> = { paid: 'Paid', unpaid: 'Unpaid', refunded: 'Refunded' };

export function sellerInvoiceHtml({ order, items, seller, partial }: InvoiceInput): string {
  const rows = items.map(i => `<tr><td>${escapeHtml(i.product_name)}</td><td class="r">${escapeHtml(i.quantity)}</td><td class="r">${amount(i.price)}</td><td class="r">${amount(i.price * i.quantity)}</td></tr>`).join('');
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const address = formatDeliveryAddress(order);
  const mobile = formatMobile(order.phone);
  const method = order.payment_method === 'COD' ? 'Cash on delivery' : order.payment_method;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(order.order_number)}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#2B2A22;overflow-wrap:anywhere}h1{font-size:22px;margin:0}h2{font-size:12px;margin:22px 0 6px;color:#6B6A5C;text-transform:uppercase;letter-spacing:.4px}p{margin:3px 0}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;font-size:14px}.r{text-align:right}.muted{color:#6B6A5C;font-size:13px}tfoot th{font-size:15px}</style></head>
<body><h1>${escapeHtml(seller.business)}</h1>
${seller.city ? `<p class="muted">${escapeHtml(seller.city)}</p>` : ''}
${seller.gstin ? `<p class="muted">GSTIN ${escapeHtml(seller.gstin)}</p>` : ''}
<h2>Invoice</h2><p><strong>Order ${escapeHtml(order.order_number)}</strong></p><p class="muted">Placed ${escapeHtml(shortDateTime(order.created_at))}</p>
<h2>Bill to</h2><p><strong>${escapeHtml(order.customer_name)}</strong></p>
${address ? `<p>${escapeHtml(address)}</p>` : ''}
${mobile ? `<p>${escapeHtml(mobile)}</p>` : ''}
<table><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><th colspan="3">Total</th><th class="r">${amount(total)}</th></tr></tfoot></table>
<p class="muted" style="margin-top:14px">Payment: ${escapeHtml(method)} · ${escapeHtml(PAYMENT_STATUS[order.payment_status] ?? order.payment_status)}</p>
${partial ? '<p class="muted">Items from other sellers on this order are not included.</p>' : ''}
</body></html>`;
}

/** Opens the invoice and the print dialog. False when the browser blocked the new window. */
export function printSellerInvoice(input: InvoiceInput): boolean {
  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) return false;
  win.document.write(sellerInvoiceHtml(input));
  win.document.close();
  win.focus();
  win.print();
  return true;
}
