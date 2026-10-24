// The telecalling lead workflow, worked out from the shared tracker data (the same data every dashboard
// already syncs), so the telecalling head, the manager and the calling executives always agree:
//
//   imported -> distributed to an executive -> called -> call report submitted -> report verified
//
// Plain functions only. Nothing here talks to the server.

import { TELECALLERS, TODAY, CallOutcome, LeadActivity, ReportStatus, TrackerLead } from '../data/managerDashboard';
import { TrackerState, assignmentOf } from './trackerOps';
import { nowStamp } from './format';
import { DayRange, addDays, istDayOf, istToday } from './assignedDate';
import { isOverdue } from '../components/telecaller/tcData';

/** A lead's place in the workflow, from its latest call report. */
export type WorkflowStatus = 'not_called' | 'report_submitted' | 'report_verified' | 'report_returned';

export const WORKFLOW_LABEL: Record<WorkflowStatus, string> = {
  not_called: 'Assigned · not called',
  report_submitted: 'Report submitted',
  report_verified: 'Report verified',
  report_returned: 'Report returned',
};
export const WORKFLOW_CHIP: Record<WorkflowStatus, string> = {
  not_called: 'pending',
  report_submitted: 'transit',
  report_verified: 'delivered',
  report_returned: 'pending',
};
export const REPORT_LABEL: Record<ReportStatus, string> = { submitted: 'Submitted', verified: 'Verified', returned: 'Returned' };
export const REPORT_CHIP: Record<ReportStatus, string> = { submitted: 'transit', verified: 'delivered', returned: 'pending' };

/** A call that didn't reach the customer; the workflow groups these as "Not connected". */
export const NOT_CONNECTED: CallOutcome[] = ['No answer', 'Busy'];

/** How long a lead may sit uncalled, or a report may wait to be verified, before it is highlighted. */
export const STALE_HOURS = 24;

/** Calls from before call reports existed (and the offline sample) count as verified. */
export const reportStatusOf = (a: LeadActivity): ReportStatus => a.report_status ?? 'verified';

const realNow = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** "Now" for ages and "today": the real clock for live data, the demo calendar for the offline sample. */
export function referenceNow(state: Pick<TrackerState, 'leads' | 'activities'>): string {
  return isLiveTracker(state) ? realNow() : nowStamp();
}

/** Live data from the CRM backend (rather than the offline sample, which lives on the demo calendar). */
export const isLiveTracker = (state: Pick<TrackerState, 'leads' | 'activities'>) =>
  state.activities.some(a => a.report_status !== undefined) || state.leads.some(l => l.created_at.slice(0, 10) > TODAY);

/** A span of time to count calls in. 'all' is every call ever made. */
export type ActivityPeriod = 'all' | 'today' | 'week' | 'month';
export const ACTIVITY_PERIODS: ActivityPeriod[] = ['all', 'today', 'week', 'month'];
export const ACTIVITY_PERIOD_LABEL: Record<ActivityPeriod, string> = { all: 'All time', today: 'Today', week: 'This week', month: 'This month' };

/**
 * The calendar days (inclusive, YYYY-MM-DD) a period covers, up to `today`: today, this week (weeks run Monday to
 * Sunday, as on the Sales page), this calendar month, or one chosen day. Null for all time.
 */
export function activityRange(period: ActivityPeriod | { day: string }, today: string): DayRange | null {
  if (typeof period === 'object') return { from: period.day, to: period.day };
  if (period === 'today') return { from: today, to: today };
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (period === 'week') return { from: addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)), to: today };
  return null;
}

/**
 * The day a tracker stamp belongs to. The backend writes stamps in UTC without a zone, so live stamps are placed on the
 * India calendar (a call at 01:00 IST is that day's call, not the UTC day before); the offline sample's stamps are
 * already on the demo calendar.
 */
export const trackerDay = (ts: string, live: boolean) => (live ? istDayOf(ts) : ts.slice(0, 10));

/** "Today" for the periods: India's today for live data, the demo calendar's for the sample. */
export const trackerToday = (state: Pick<TrackerState, 'leads' | 'activities'>) =>
  isLiveTracker(state) ? istToday() : referenceNow(state).slice(0, 10);

export function inActivityRange(ts: string, range: DayRange | null, live: boolean): boolean {
  if (!range) return true;
  const day = trackerDay(ts, live);
  return day !== null && day >= range.from && day <= range.to;
}

const hoursBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;

/** Calls grouped by lead, oldest first. */
function callsByLead(activities: LeadActivity[]) {
  const m = new Map<number, LeadActivity[]>();
  [...activities].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    .forEach(a => m.set(a.lead_id, [...(m.get(a.lead_id) ?? []), a]));
  return m;
}

export function workflowStatusOf(calls: LeadActivity[]): WorkflowStatus {
  const last = calls[calls.length - 1];
  if (!last) return 'not_called';
  const s = reportStatusOf(last);
  return s === 'submitted' ? 'report_submitted' : s === 'returned' ? 'report_returned' : 'report_verified';
}

export interface LeadFlow {
  lead: TrackerLead;
  status: WorkflowStatus;
  calls: LeadActivity[];
  last: LeadActivity | undefined;
  assignedAt: string;
  assignedBy: string | null;
  /** Hours since it was assigned, while it is still uncalled; otherwise null. */
  waitingHours: number | null;
  /** Needs the head's or manager's eye: uncalled too long, report waiting too long, or returned. */
  attention: boolean;
}

export function leadFlows(state: TrackerState): LeadFlow[] {
  const now = referenceNow(state);
  const byLead = callsByLead(state.activities);
  return state.leads.map(lead => {
    const calls = byLead.get(lead.id) ?? [];
    const status = workflowStatusOf(calls);
    const last = calls[calls.length - 1];
    const { at, by } = assignmentOf(state, lead);
    const waitingHours = status === 'not_called' ? Math.max(0, hoursBetween(at, now)) : null;
    const reportAge = status === 'report_submitted' && last ? hoursBetween(last.created_at, now) : 0;
    return {
      lead, status, calls, last, assignedAt: at, assignedBy: by, waitingHours,
      attention: (waitingHours ?? 0) >= STALE_HOURS || reportAge >= STALE_HOURS || status === 'report_returned',
    };
  });
}

export interface ExecWorkflow {
  id: number;
  name: string;
  active: boolean;
  assigned: number;
  notCalled: number;
  called: number;
  calls: number;
  connected: number;
  notConnected: number;
  wrongNumber: number;
  notInterested: number;
  awaiting: number;
  verified: number;
  returned: number;
  /** Share of assigned leads that have had at least one call. */
  progressPct: number;
  overdueFollowups: number;
  lastCallAt: string | null;
  calledToday: number;
}

export type AlertLevel = 'critical' | 'warning' | 'info';
export interface WorkflowAlert {
  key: string;
  level: AlertLevel;
  text: string;
  /** Which executive it is about, if one. */
  execId?: number;
  /** Who has to act on it. */
  owner: 'head' | 'executive';
}

export interface WorkflowSummary {
  imported: number;
  distributed: number;
  /** Leads no active executive is holding (should be none: every lead is assigned when it is created). */
  withoutOwner: number;
  notCalled: number;
  called: number;
  completedCalls: number;
  reportsSubmitted: number;
  awaitingVerification: number;
  verified: number;
  returned: number;
  execs: ExecWorkflow[];
  alerts: WorkflowAlert[];
}

export function workflowSummary(state: TrackerState): WorkflowSummary {
  const now = referenceNow(state);
  const today = now.slice(0, 10);
  const flows = leadFlows(state);
  const execList = TELECALLERS;
  const activeIds = new Set(execList.filter(t => t.is_active).map(t => t.id));

  const execs: ExecWorkflow[] = execList.map(t => {
    const mine = flows.filter(f => f.lead.assigned_to === t.id);
    const calls = state.activities.filter(a => a.caller_id === t.id);
    const count = (o: CallOutcome) => calls.filter(a => a.outcome === o).length;
    const status = (s: ReportStatus) => calls.filter(a => reportStatusOf(a) === s).length;
    const lastCallAt = calls.reduce<string | null>((m, a) => (m === null || a.created_at > m ? a.created_at : m), null);
    const assigned = mine.length;
    const called = mine.filter(f => f.status !== 'not_called').length;
    return {
      id: t.id, name: t.name, active: t.is_active,
      assigned, notCalled: assigned - called, called, calls: calls.length,
      connected: count('Connected'),
      notConnected: NOT_CONNECTED.reduce((n, o) => n + count(o), 0),
      wrongNumber: count('Wrong number'),
      notInterested: count('Not interested'),
      awaiting: status('submitted'), verified: status('verified'), returned: status('returned'),
      progressPct: assigned === 0 ? 0 : Math.round((called / assigned) * 100),
      overdueFollowups: state.followups.filter(f => f.caller_id === t.id && isOverdue(f)).length,
      lastCallAt,
      calledToday: calls.filter(a => a.created_at.startsWith(today)).length,
    };
  });

  const alerts: WorkflowAlert[] = [];
  for (const e of execs) {
    const mine = flows.filter(f => f.lead.assigned_to === e.id);
    if (!e.active && e.notCalled > 0) {
      alerts.push({ key: `inactive-${e.id}`, level: 'critical', owner: 'head', execId: e.id,
        text: `${e.name} is inactive but still holds ${e.notCalled} uncalled lead${e.notCalled === 1 ? '' : 's'}: reassign them.` });
    }
    if (!e.active) continue;
    const waiting = mine.filter(f => (f.waitingHours ?? 0) >= STALE_HOURS).length;
    if (waiting > 0) {
      alerts.push({ key: `waiting-${e.id}`, level: 'warning', owner: 'executive', execId: e.id,
        text: `${e.name} has ${waiting} lead${waiting === 1 ? '' : 's'} assigned more than a day ago and not called yet.` });
    } else if (e.notCalled > 0 && e.calledToday === 0) {
      alerts.push({ key: `idle-${e.id}`, level: 'info', owner: 'executive', execId: e.id,
        text: `${e.name} has ${e.notCalled} lead${e.notCalled === 1 ? '' : 's'} to call and no calls yet today.` });
    }
    if (e.returned > 0) {
      alerts.push({ key: `returned-${e.id}`, level: 'warning', owner: 'executive', execId: e.id,
        text: `${e.returned} call report${e.returned === 1 ? '' : 's'} sent back to ${e.name} still need correcting.` });
    }
    if (e.overdueFollowups > 0) {
      alerts.push({ key: `overdue-${e.id}`, level: 'warning', owner: 'executive', execId: e.id,
        text: `${e.name} has ${e.overdueFollowups} overdue follow-up${e.overdueFollowups === 1 ? '' : 's'}.` });
    }
  }
  const staleReports = state.activities.filter(a => reportStatusOf(a) === 'submitted' && hoursBetween(a.created_at, now) >= STALE_HOURS).length;
  const awaiting = execs.reduce((n, e) => n + e.awaiting, 0);
  if (staleReports > 0) {
    alerts.push({ key: 'stale-reports', level: 'warning', owner: 'head',
      text: `${staleReports} call report${staleReports === 1 ? ' has' : 's have'} waited more than a day for verification.` });
  } else if (awaiting > 0) {
    alerts.push({ key: 'awaiting', level: 'info', owner: 'head', text: `${awaiting} call report${awaiting === 1 ? ' is' : 's are'} waiting to be verified.` });
  }
  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  const distributed = flows.filter(f => activeIds.has(f.lead.assigned_to)).length;
  const sum = (pick: (e: ExecWorkflow) => number) => execs.reduce((n, e) => n + pick(e), 0);
  return {
    imported: flows.length,
    distributed,
    withoutOwner: flows.length - distributed,
    notCalled: flows.filter(f => f.status === 'not_called').length,
    called: flows.filter(f => f.status !== 'not_called').length,
    completedCalls: state.activities.length,
    reportsSubmitted: state.activities.length,
    awaitingVerification: awaiting,
    verified: sum(e => e.verified),
    returned: sum(e => e.returned),
    execs,
    alerts,
  };
}
