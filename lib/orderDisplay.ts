// How the seller dashboard words an order's source, delivery address and customer mobile. Orders come from the website
// and from calls, and older ones can have gaps, so everything here copes with missing values and never prints them.

import { districtFor } from './regions';

type Text = string | null | undefined;

/** Trimmed text with inner runs of spaces collapsed; '' for nothing, or for a stored "null" / "undefined". */
const clean = (value: Text) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return /^(null|undefined)$/i.test(text) ? '' : text;
};

/** "Website", "Telecaller – Rahul Sharma", or plain "Telecaller" when that account no longer exists. */
export function orderSourceLabel(order: { source?: Text; caller_name?: Text }): string {
  const source = clean(order.source).toLowerCase();
  const caller = clean(order.caller_name);
  if (source === 'website') return 'Website';
  if (caller) return `Telecaller – ${caller}`;
  return source === 'telecaller' ? 'Telecaller' : 'Source not recorded';
}

/**
 * One line for the label: house, street, landmark and village as typed (orders keep those in `address`), then town,
 * district, state and PIN code. Empty parts are left out, and a part already typed into the address is not repeated.
 * '' when there is nothing at all.
 */
export function formatDeliveryAddress(order: { address?: Text; city?: Text; state?: Text; pincode?: Text }): string {
  const pincode = clean(order.pincode);
  const district = districtFor(order.state, pincode, clean(order.city));
  const typed = clean(order.address).split(',').map(part => {
    const text = clean(part);
    return pincode && text.endsWith(pincode) ? clean(text.slice(0, -pincode.length).replace(/[\s,–-]+$/, '')) : text;
  });

  const seen = new Set<string>();
  const parts = [...typed, clean(order.city), district === 'Unknown' ? '' : district, clean(order.state)].filter(part => {
    const key = part.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const line = parts.join(', ');
  return line && pincode ? `${line} – ${pincode}` : line || pincode;
}

/** The mobile as "+91 9876543210". A number with another country code, or an unusual length, is shown as stored. */
export function formatMobile(phone: Text): string {
  const stored = clean(phone);
  const digits = stored.replace(/\D/g, '');
  if (digits.length === 10 && !stored.startsWith('+')) return `+91 ${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91 ${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2)}`;
  return stored;
}
