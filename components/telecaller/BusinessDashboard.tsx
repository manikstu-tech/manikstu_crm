'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, IndianRupee, Info, MapPin, Minus, RefreshCw, ShoppingCart, Tractor, UserPlus } from 'lucide-react';
import { rupees } from '../../lib/format';
import { districtFor, stateFor } from '../../lib/regions';

/**
 * Business Dashboard: five headline figures counted by the backend (/api/reports/dashboard) from the live database.
 * Nothing here is sample data: until the backend answers there are placeholders, and if it fails there is an error
 * with a retry, never a zero. Definitions are the backend's (CRM_backend app/Services/BusinessDashboard.php).
 */

type PeriodKey = 'today' | '7d' | 'month' | 'custom';
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
];

interface Location { state: string | null; city: string | null; pincode: string | null; orders: number; orders_in_period: number }
interface DashboardData {
  period: { key: PeriodKey; timezone: string; from: string; to: string; previous_from: string; previous_to: string };
  farmers: { total: number; active: number; new: number; new_previous: number };
  sales: { total: number; website: number; website_orders: number; telecalling: number; telecalling_sales: number; previous_total: number };
  orders: { total: number; completed: number; in_progress: number; cancelled: number; previous_total: number };
  leads: { total: number; new: number; new_previous: number; converted: number; conversion_pct: number | null };
  regions: Location[];
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  /** refreshError: a background update failed, so these figures are from updatedAt, not now. */
  | { status: 'ok'; data: DashboardData; updatedAt: Date; refreshError?: string };

const clock = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

/** Today's date in India, as YYYY-MM-DD (the backend's business day). */
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** How the selected period and the one it is compared with read in a sentence (windows: BusinessDashboard::for). */
const NOW_PHRASE: Record<PeriodKey, string> = { today: 'today', '7d': 'in the last 7 days', month: 'this month', custom: 'in this period' };
const BEFORE_PHRASE: Record<PeriodKey, string> = { today: 'yesterday', '7d': 'the previous 7 days', month: 'last month', custom: 'the previous period' };
/** The same, after a count ("24 last month", "none in the previous 7 days"). */
const IN_BEFORE_PHRASE: Record<PeriodKey, string> = { today: 'yesterday', '7d': 'in the previous 7 days', month: 'last month', custom: 'in the previous period' };

/**
 * Change against the previous period, as one short sentence about one metric (`noun`, e.g. "new leads").
 * A percentage only when the previous period gives a real baseline; every other case says what happened instead of
 * inventing a figure. Green for a rise, red for a fall (every compared figure here is better higher).
 */
function Change({ current, previous, period, noun, format = count }: {
  current: number; previous: number | null | undefined; period: PeriodKey; noun: string; format?: (n: number) => string;
}) {
  const now = NOW_PHRASE[period];
  const before = BEFORE_PHRASE[period];
  if (previous === null || previous === undefined) {
    return <div className="bd-change flat">Comparison unavailable</div>;
  }
  if (current === 0 && previous === 0) {
    return <div className="bd-change flat">No activity in either period <span className="bd-compare">· {now} vs {before}</span></div>;
  }
  if (current === 0) {
    return <div className="bd-change down">No {noun} {now} <span className="bd-compare">· down from {format(previous)} {IN_BEFORE_PHRASE[period]}</span></div>;
  }
  if (previous === 0) {
    return <div className="bd-change up">New activity <span className="bd-compare">· none {IN_BEFORE_PHRASE[period]}</span></div>;
  }
  // Towards zero, so a small remainder never reads as "-100%" (that case, nothing at all, is said in words above).
  const change = Math.trunc(((current - previous) / previous) * 100);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <div className={`bd-change ${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}`}>
      <Icon size={14} aria-hidden /> {change > 0 ? '+' : ''}{change}% <span className="bd-compare">{noun} vs {before} ({format(previous)})</span>
    </div>
  );
}

/** A KPI card: icon and title, an info tip with the definition, the headline value, compact rows, then the comparison. */
function Card({ icon: Icon, title, info, value, children, footer, className }: {
  icon: React.ElementType; title: string; info: string; value: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; className?: string;
}) {
  return (
    <section className={`bd-card ${className ?? ''}`} aria-label={title}>
      <div className="bd-card-head">
        <span className="bd-icon"><Icon size={18} aria-hidden /></span>
        <h3>{title}</h3>
        <span className="bd-info" tabIndex={0} role="img" aria-label={info} data-tip={info}><Info size={14} aria-hidden /></span>
      </div>
      <div className="bd-value">{value}</div>
      {children && <dl className="bd-rows">{children}</dl>}
      {footer && <div className="bd-foot">{footer}</div>}
    </section>
  );
}

const Row = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'warn' | 'good' }) => (
  <div className="bd-row"><dt>{label}</dt><dd className={tone ? `bd-tone-${tone}` : undefined}>{value}</dd></div>
);

const count = (n: number) => n.toLocaleString('en-IN');

export default function BusinessDashboard() {
  const [period, setPeriod] = useState<PeriodKey>('today');
  const today = istToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  // The custom range actually requested (applied with the button, not on every keystroke).
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const request = useRef<AbortController | null>(null);

  /**
   * Load the figures. A filter change or Refresh shows placeholders; a background update (silent) keeps the current
   * figures on screen and, if it fails, keeps them with a note rather than replacing them with an error or zeros.
   */
  const fetchDashboard = useCallback(async (key: PeriodKey, range: { from: string; to: string } | null, silent = false) => {
    request.current?.abort();                       // a newer request wins; the older answer is ignored
    const controller = new AbortController();
    request.current = controller;
    if (!silent) setLoad({ status: 'loading' });
    const failed = (error: string) => setLoad(prev => (silent && prev.status === 'ok' ? { ...prev, refreshError: error } : { status: 'error', error }));
    const query = new URLSearchParams({ period: key, ...(key === 'custom' && range ? range : {}) });
    try {
      const res = await fetch(`/api/reports/dashboard?${query}`, { cache: 'no-store', signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (!res.ok || !body?.data) {
        failed(body?.error || 'Could not load the dashboard.');
        return;
      }
      setLoad({ status: 'ok', data: body.data as DashboardData, updatedAt: new Date() });
    } catch {
      if (!controller.signal.aborted) failed('Could not reach the server. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    if (period === 'custom' && !custom) return;     // waiting for a range
    void fetchDashboard(period, period === 'custom' ? custom : null);
  }, [period, custom, fetchDashboard]);
  useEffect(() => () => request.current?.abort(), []);

  // Coming back to the tab (after a while, or the next day) updates the figures quietly: no polling, and nothing
  // stale is left on screen once the page is looked at again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || (period === 'custom' && !custom)) return;
      void fetchDashboard(period, period === 'custom' ? custom : null, true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [period, custom, fetchDashboard]);

  const rangeError = period === 'custom' && from && to && from > to ? 'The start date must be on or before the end date.' : null;
  const retry = () => void fetchDashboard(period, period === 'custom' ? custom : null);

  // Regions as the Regional report counts them: districts (from the delivery address) with at least one order.
  const regions = useMemo(() => {
    if (load.status !== 'ok') return null;
    const all = new Set<string>();
    const active = new Set<string>();
    const states = new Set<string>();
    let unplaced = 0;
    for (const l of load.data.regions) {
      const state = stateFor(l.state, l.pincode);
      const district = districtFor(l.state, l.pincode, l.city);
      if (state === 'Unknown' && district === 'Unknown') { unplaced += l.orders; continue; }
      const key = `${state}|${district}`;
      all.add(key);
      if (state !== 'Unknown') states.add(state);
      if (l.orders_in_period > 0) active.add(key);
    }
    return { total: all.size, active: active.size, states: states.size, unplaced };
  }, [load]);

  const d = load.status === 'ok' ? load.data : null;

  return (
    <div className="business-dashboard">
      <div className="bd-toolbar">
        <div className="filters" role="group" aria-label="Period">
          {PERIODS.map(p => (
            <button key={p.key} type="button" className={`filter-chip ${period === p.key ? 'active' : ''}`} aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="bd-status">
          {load.status === 'ok' && (
            <span className={load.refreshError ? 'text-warn' : 'loc'} role="status">
              {load.refreshError ? `Couldn't update · showing ${clock(load.updatedAt)}` : `Updated ${clock(load.updatedAt)}`}
            </span>
          )}
          <button type="button" className="btn-secondary btn-small bd-refresh" onClick={retry} disabled={load.status === 'loading' || (period === 'custom' && !custom)}>
            <RefreshCw size={14} aria-hidden /> Refresh
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <form className="bd-range" onSubmit={e => { e.preventDefault(); if (!rangeError && from && to) setCustom({ from, to }); }}>
          <label>From <input type="date" value={from} max={today} onChange={e => setFrom(e.target.value)} required /></label>
          <label>To <input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} required /></label>
          <button type="submit" className="btn-primary btn-small" disabled={!!rangeError || !from || !to}>Apply</button>
          {rangeError && <span className="text-warn">{rangeError}</span>}
          {!custom && !rangeError && <span className="loc">Choose dates and press Apply (up to a year).</span>}
        </form>
      )}

      {load.status === 'error' && (
        <div className="bd-error" role="alert">
          <strong>The dashboard could not be loaded.</strong>
          <span>{load.error}</span>
          <button type="button" className="btn-primary btn-small" onClick={retry}>Try again</button>
        </div>
      )}

      {period === 'custom' && !custom && load.status !== 'error' ? null : load.status === 'loading' ? (
        <div className="bd-grid" aria-busy="true" aria-live="polite">
          <span className="bd-sr-only">Loading the dashboard…</span>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`bd-card bd-skeleton ${i === 0 ? 'bd-hero' : ''}`} aria-hidden>
              <span className="bd-sk bd-sk-title" /><span className="bd-sk bd-sk-value" /><span className="bd-sk bd-sk-line" /><span className="bd-sk bd-sk-line bd-short" />
            </div>
          ))}
        </div>
      ) : d && regions ? (
        <div className="bd-grid">
          {/* Row 1: leads across the full width. */}
          <Card icon={UserPlus} title="Total Leads" className="bd-hero" value={count(d.leads.total)}
            info="All leads in the telecalling tracker. New: created in the period. Converted: at least one sale recorded for the lead (as Team conversion). Rate: converted ÷ all leads."
            footer={<Change current={d.leads.new} previous={d.leads.new_previous} period={d.period.key} noun="new leads" />}>
            <Row label="New leads" value={count(d.leads.new)} />
            <Row label="Converted" value={count(d.leads.converted)} />
            <Row label="Conversion rate" value={d.leads.conversion_pct === null ? '—' : `${d.leads.conversion_pct}%`} />
          </Card>

          {/* Row 2: orders and sales. */}
          <Card icon={ShoppingCart} title="Total Orders" value={count(d.orders.total)}
            info="Orders placed in the period, from the website and on calls. In progress: pending, confirmed, packed or shipped."
            footer={<Change current={d.orders.total} previous={d.orders.previous_total} period={d.period.key} noun="orders" />}>
            <Row label="Delivered" value={count(d.orders.completed)} />
            <Row label="In progress" value={count(d.orders.in_progress)} />
            <Row label="Cancelled / rejected" value={count(d.orders.cancelled)} tone={d.orders.cancelled > 0 ? 'warn' : undefined} />
          </Card>

          <Card icon={IndianRupee} title="Total Sales" value={rupees(d.sales.total)}
            info="Website orders (not cancelled, rejected or refunded) plus telecalling sales. A phone order counts once, as its telecalling sale."
            footer={<Change current={d.sales.total} previous={d.sales.previous_total} period={d.period.key} noun="sales" format={rupees} />}>
            <Row label="Website sales" value={rupees(d.sales.website)} />
            <Row label="Telecalling sales" value={rupees(d.sales.telecalling)} />
          </Card>

          {/* Row 3: farmers and regions. */}
          <Card icon={Tractor} title="Total Farmers" value={count(d.farmers.total)}
            info="Everyone in the farmer directory, whatever the period. New: registered in the period. Active: farmers marked Active."
            footer={<Change current={d.farmers.new} previous={d.farmers.new_previous} period={d.period.key} noun="new farmers" />}>
            <Row label="New farmers" value={count(d.farmers.new)} />
            <Row label="Active" value={count(d.farmers.active)} />
          </Card>

          {/* A running total (there is no configured list of regions), so no period comparison. */}
          <Card icon={MapPin} title="Total Regions" value={count(regions.total)}
            info={`Districts the business has delivered to, from order addresses, as in the Regional report (there is no configured list of regions). With orders in period: districts with at least one order in the selected period. Cancelled orders are left out.${regions.unplaced ? ` ${regions.unplaced} order${regions.unplaced === 1 ? ' has' : 's have'} no usable address.` : ''}`}>
            <Row label="With orders in period" value={count(regions.active)} />
            <Row label="States covered" value={count(regions.states)} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
