import {
  STAGES,
  TELECALLERS,
  TRACKER_PRODUCTS,
  VERTICALS,
  TODAY,
  CallOutcome,
  Followup,
  LeadActivity,
  Telecaller,
  TrackerLead,
  TrackerSale,
  isWonStage,
} from '../../data/managerDashboard';
import { MONTH, dayStart, daysBefore, pct } from '../../lib/format';

// ---- Lookups ------------------------------------------------------------------------------

export const stageOf = (id: number) => STAGES.find(s => s.id === id);
export const stageName = (id: number) => stageOf(id)?.name ?? '—';
export const verticalName = (id: number) => VERTICALS.find(v => v.id === id)?.name ?? '—';
export const productOf = (id: number) => TRACKER_PRODUCTS.find(p => p.id === id);
export const productName = (id: number) => productOf(id)?.name ?? '—';
export const callerOf = (id: number) => TELECALLERS.find(t => t.id === id);
// A lead's assigned_to is 0 when it is unassigned (sits in the Follow-up pool until handed out).
export const callerName = (id: number) => (id === 0 ? 'Unassigned' : callerOf(id)?.name ?? '—');
export const stagesFor = (verticalId: number) =>
  STAGES.filter(s => s.vertical_id === verticalId).sort((a, b) => a.sort_order - b.sort_order);

export const isOpenLead = (l: TrackerLead) => {
  const s = stageOf(l.stage_id);
  return !isWonStage(s) && s?.name !== 'Lost';
};
export const isWonLead = (l: TrackerLead) => isWonStage(stageOf(l.stage_id));

export const OUTCOMES: CallOutcome[] = ['Connected', 'No answer', 'Busy', 'Wrong number', 'Not interested'];

export const time12 = (ts: string) => {
  const [h, m] = ts.slice(11, 16).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const fmtDuration = (sec: number | null) => (sec === null ? '—' : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`);

export const lastCallFor = (leadId: number, activities: LeadActivity[]) => {
  for (let i = activities.length - 1; i >= 0; i--) if (activities[i].lead_id === leadId) return activities[i];
  return undefined;
};

// ---- Periods ------------------------------------------------------------------------------

export type Period = 'today' | '7d' | 'month';
export const PERIOD_LABEL: Record<Period, string> = { today: 'Today', '7d': 'Last 7 days', month: 'This month' };
export const inPeriod = (ts: string, period: Period) =>
  period === 'today' ? ts.startsWith(TODAY) : period === '7d' ? daysBefore(ts) <= 6 : ts.startsWith(MONTH);

export const isOverdue = (f: Followup) =>
  f.status === 'missed' || (f.status === 'pending' && dayStart(f.due_at) < dayStart(TODAY));

// ---- Team data ----------------------------------------------------------------------------

/** Everything the head's pages work from. Leads and follow-ups change when leads are reassigned. */
export interface TeamData {
  leads: TrackerLead[];
  followups: Followup[];
  activities: LeadActivity[];
  sales: TrackerSale[];
}

// A lead left unassigned this long, or assigned but not called this long, is surfaced
// in the Follow-up section so nothing slips. Shared by the section and its nav badge.
export const UNASSIGNED_STALE_DAYS = 3;
export const UNCALLED_STALE_DAYS = 3;

/** Leads surfaced automatically in Follow-up: unassigned too long, or assigned but never called. */
export function stuckLeadCount(data: Pick<TeamData, 'leads' | 'activities'>): number {
  const called = new Set(data.activities.map(a => a.lead_id));
  let n = 0;
  for (const l of data.leads) {
    if (l.assigned_to === 0) {
      if (daysBefore(l.created_at) >= UNASSIGNED_STALE_DAYS) n++;
    } else if (isOpenLead(l) && !called.has(l.id) && daysBefore(l.updated_at) >= UNCALLED_STALE_DAYS) {
      n++;
    }
  }
  return n;
}

export interface StaffStats {
  t: Telecaller;
  calls: number;
  connected: number;
  connectRate: number;
  openLeads: number;
  staleLeads: number;
  pendingFollowups: number;
  overdueFollowups: number;
  sales: number;
  revenue: number;
  conversion: number;
  callsToday: number;
  lastCall?: string;
}

/** Per-telecaller numbers for the chosen period (and optional vertical). */
export function staffStats(data: TeamData, period: Period, verticalId: number | 'all'): StaffStats[] {
  const productInVertical = (id: number) => verticalId === 'all' || productOf(id)?.vertical_id === verticalId;
  const leadInVertical = (l: TrackerLead) => verticalId === 'all' || l.vertical_id === verticalId;
  const leadVertical = new Map(data.leads.map(l => [l.id, l.vertical_id]));
  const activityInVertical = (a: LeadActivity) => verticalId === 'all' || leadVertical.get(a.lead_id) === verticalId;
  const soldLeadIds = new Set(data.sales.map(s => s.lead_id));

  return TELECALLERS.map(t => {
    const mine = data.leads.filter(l => l.assigned_to === t.id && leadInVertical(l));
    const myLeadIds = new Set(mine.map(l => l.id));
    const acts = data.activities.filter(a => a.caller_id === t.id && activityInVertical(a));
    const periodActs = acts.filter(a => inPeriod(a.created_at, period));
    const connected = periodActs.filter(a => a.outcome === 'Connected').length;
    const fus = data.followups.filter(f => f.caller_id === t.id && myLeadIds.has(f.lead_id));
    const sales = data.sales.filter(s => s.caller_id === t.id && inPeriod(s.sold_at, period) && productInVertical(s.product_id));
    return {
      t,
      calls: periodActs.length,
      connected,
      connectRate: pct(connected, periodActs.length),
      openLeads: mine.filter(isOpenLead).length,
      staleLeads: mine.filter(l => isOpenLead(l) && daysBefore(l.updated_at) >= 3).length,
      pendingFollowups: fus.filter(f => f.status === 'pending').length,
      overdueFollowups: fus.filter(isOverdue).length,
      sales: sales.length,
      revenue: sales.reduce((a, s) => a + s.amount, 0),
      conversion: pct(mine.filter(l => soldLeadIds.has(l.id)).length, mine.length),
      callsToday: acts.filter(a => a.created_at.startsWith(TODAY)).length,
      lastCall: acts[acts.length - 1]?.created_at,
    };
  });
}

export interface TeamAlert {
  key: string;
  level: 'critical' | 'warning';
  text: string;
  callerId?: number;
}

/** Things the head should act on today, most serious first. */
export function teamAlerts(stats: StaffStats[]): TeamAlert[] {
  const alerts: TeamAlert[] = [];
  stats.filter(s => !s.t.is_active && s.openLeads > 0).forEach(s =>
    alerts.push({ key: `inactive-${s.t.id}`, level: 'critical', callerId: s.t.id, text: `${s.t.name} is inactive but still holds ${s.openLeads} open leads` }));
  stats.filter(s => s.t.is_active && s.callsToday === 0).forEach(s =>
    alerts.push({ key: `nocalls-${s.t.id}`, level: 'critical', callerId: s.t.id, text: `${s.t.name} has made no calls today` }));
  stats.filter(s => s.t.is_active && s.overdueFollowups >= 2).forEach(s =>
    alerts.push({ key: `overdue-${s.t.id}`, level: 'warning', callerId: s.t.id, text: `${s.t.name} has ${s.overdueFollowups} overdue follow-ups` }));
  const stale = stats.filter(s => s.t.is_active).reduce((a, s) => a + s.staleLeads, 0);
  if (stale > 0) alerts.push({ key: 'stale', level: 'warning', text: `${stale} open leads haven't been touched for 3+ days` });
  return alerts;
}

/** Six calendar months ending this month, with total sales in each. */
export function salesByMonth(sales: TrackerSale[]) {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const start = new Date(`${TODAY.slice(0, 8)}01T00:00:00`);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(start);
    d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rows = sales.filter(s => s.sold_at.startsWith(key));
    return { key, label: names[d.getMonth()], amount: rows.reduce((a, s) => a + s.amount, 0), count: rows.length };
  });
}
