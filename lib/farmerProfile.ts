import type { Customer } from '../data/initialData';

/** What the head can edit on a farmer's profile from the Regional report drawer. */
export interface FarmerProfilePatch {
  phone: string;
  name?: string;
  landHolding?: string;
  crops?: string[];
  livestock?: Customer['livestock'];
  farmingModel?: string;
  waterResource?: string;
  preferredLanguage?: string;
}

/** The saved farmer profile for one phone, or null if there is none yet. */
export async function fetchFarmerProfile(phone: string): Promise<Customer | null> {
  try {
    const r = await fetch(`/api/customers/profile?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const body = await r.json().catch(() => null);
    return (body?.data as Customer) ?? null;
  } catch {
    return null;
  }
}

/** Saved profiles for several phones at once (phone → profile or null), for the download. */
export async function fetchFarmerProfiles(phones: string[]): Promise<Record<string, Customer | null>> {
  const list = Array.from(new Set(phones)).filter(Boolean);
  if (list.length === 0) return {};
  try {
    const r = await fetch(`/api/customers/profiles?phones=${encodeURIComponent(list.join(','))}`, { cache: 'no-store' });
    if (!r.ok) return {};
    const body = await r.json().catch(() => null);
    return (body?.data as Record<string, Customer | null>) ?? {};
  } catch {
    return {};
  }
}

/** Save a farmer's land / crops / livestock (creates the profile if the phone has none). */
export async function saveFarmerProfile(patch: FarmerProfilePatch): Promise<Customer> {
  const r = await fetch('/api/customers/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || 'Could not save the farmer profile.');
  return body.data as Customer;
}
