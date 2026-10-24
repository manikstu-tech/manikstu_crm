/**
 * The "Assigned" date filter on Leads & Assignment: which leads were handed to their executive on a given Indian day.
 *
 * The date used is the lead's assignment time (the tracker's `assignments[id].at`, set when the head assigns or
 * reassigns a lead; a lead never reassigned was assigned when it was created, so its `created_at`). The backend writes
 * these stamps in UTC without a zone ("2026-10-24T03:15"), so they are read as UTC and placed on the India
 * (Asia/Kolkata) calendar: a lead assigned at 01:00 IST belongs to that day, not to the UTC day before.
 */

export type AssignedDateKey = 'any' | 'today' | 'yesterday' | '7d' | 'month' | 'custom';

export const ASSIGNED_DATE_OPTIONS: { key: AssignedDateKey; label: string }[] = [
  { key: 'any', label: 'Any date' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
];

export interface DayRange { from: string; to: string }

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today in India, YYYY-MM-DD. */
export const istToday = (now: Date = new Date()) => IST_DAY.format(now);

/** The India day (YYYY-MM-DD) of a tracker stamp; a stamp without a zone is UTC. Null if it cannot be read. */
export function istDayOf(ts: string): string | null {
  if (!ts) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(ts);
  const iso = hasZone ? ts : `${ts.length === 10 ? `${ts}T00:00` : ts}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : IST_DAY.format(d);
}

/** A calendar day moved by n days (no time zone involved: the input is already an India day). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Why a custom range cannot be used, or null if it can. */
export function customRangeError(range: Partial<DayRange>, today: string): string | null {
  if (!range.from || !range.to) return 'Choose both a start and an end date.';
  if (range.from > range.to) return 'The start date must be on or before the end date.';
  if (range.from > today) return 'The start date cannot be in the future.';
  return null;
}

/** The inclusive India-day range for a choice; null for "any date" (or a custom range not applied yet). */
export function assignedRange(key: AssignedDateKey, custom: DayRange | null, today: string): DayRange | null {
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y }; }
    case '7d': return { from: addDays(today, -6), to: today };       // today and the 6 days before it
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'custom': return custom;
    default: return null;
  }
}

export const inDayRange = (ts: string, range: DayRange | null) => {
  if (!range) return true;
  const day = istDayOf(ts);
  return day !== null && day >= range.from && day <= range.to;
};

/** "24 Oct", or "1 Oct – 24 Oct" for the filter's tag. */
export function rangeLabel(range: DayRange): string {
  const f = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return range.from === range.to ? f(range.from) : `${f(range.from)} – ${f(range.to)}`;
}
