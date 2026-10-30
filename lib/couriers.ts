// The couriers a seller can pick when confirming an order. One list for the desktop modal and the mobile sheet; the
// codes and order match the backend's Order::COURIERS, which checks them. "bus" is its own choice (a parcel sent by
// bus, with the bus reference as the tracking number); "other" asks for the courier's name.

export type CourierCode = 'india_post' | 'delhivery' | 'dtdc' | 'blue_dart' | 'xpressbees' | 'ecom_express' | 'bus' | 'other';

export const COURIERS: { code: CourierCode; label: string }[] = [
  { code: 'india_post', label: 'India Post' },
  { code: 'delhivery', label: 'Delhivery' },
  { code: 'dtdc', label: 'DTDC' },
  { code: 'blue_dart', label: 'Blue Dart' },
  { code: 'xpressbees', label: 'Xpressbees' },
  { code: 'ecom_express', label: 'Ecom Express' },
  { code: 'bus', label: 'Bus' },
  { code: 'other', label: 'Others' },
];

export const courierLabel = (code: string | null | undefined) => COURIERS.find(c => c.code === code)?.label ?? '';

/** The code for a courier name saved earlier (e.g. typed before the list existed): a listed name, else "other". */
export function courierCodeFor(name: string): CourierCode {
  const n = name.trim().toLowerCase();
  return COURIERS.find(c => c.code !== 'other' && c.label.toLowerCase() === n)?.code ?? 'other';
}

/** Same rule as the backend (Order::TRACKING_PATTERN): 3–40 characters, letters and digits, spaces and - / # . */
export const TRACKING_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 \-/#.]{2,39}$/;

/** busName / busNumber: optional, Bus only (the operator or service, and the bus number). */
export interface CourierForm { courierCode: CourierCode | ''; otherName: string; trackingNo: string; busName: string; busNumber: string }

export const BUS_NAME_MAX = 80;
export const BUS_NUMBER_MAX = 30;

/** Bus parcels have no tracking number: the field is hidden and not asked for. Every other courier needs one. */
export const needsTracking = (code: CourierCode | '') => code !== 'bus';

/** What is wrong with each field, or null. Shown under the field once the seller tries to save. */
export function courierProblems(f: CourierForm): { courier: string | null; otherName: string | null; trackingNo: string | null } {
  const other = f.otherName.replace(/\s+/g, ' ').trim();
  const tracking = f.trackingNo.trim();
  return {
    courier: f.courierCode ? null : 'Choose the courier.',
    otherName: f.courierCode !== 'other' ? null
      : !other ? 'Enter the courier name.'
      : other.length < 2 || !/[a-zऀ-෿]/i.test(other) ? 'The courier name must be at least 2 characters and contain letters.'
      : null,
    trackingNo: !needsTracking(f.courierCode) ? null
      : !tracking ? 'Enter the tracking / AWB number.'
      : !TRACKING_PATTERN.test(tracking) ? 'Use 3–40 characters: letters, digits, spaces, - / # or .'
      : null,
  };
}

/** The body the backend expects (courier_name is only used for "Others"; the list's names are filled in there). */
export const courierPayload = (f: CourierForm) => ({
  courier_code: f.courierCode,
  courier_name: f.courierCode === 'other' ? f.otherName.replace(/\s+/g, ' ').trim() : courierLabel(f.courierCode),
  // None for Bus (hidden, so a number typed for another courier before switching is not sent).
  tracking_number: needsTracking(f.courierCode) ? f.trackingNo.trim() : null,
  // Bus only; empty means "not given" (the backend ignores them for every other courier).
  bus_name: f.courierCode === 'bus' ? f.busName.replace(/\s+/g, ' ').trim() || null : null,
  bus_number: f.courierCode === 'bus' ? f.busNumber.replace(/\s+/g, ' ').trim() || null : null,
});
