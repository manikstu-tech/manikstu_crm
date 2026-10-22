import { TELECALLERS, TODAY, CallOutcome, Followup, LeadActivity, Telecaller, TrackerLead } from '../../data/managerDashboard';
import { dayStart, daysBefore } from '../../lib/format';
import { isOpenLead, lastCallFor } from '../telecaller/tcData';

// Call-queue helpers for the calling executive desk.

/** The caller record matching the signed-in user (falls back to the first active caller). */
export const callerFor = (name: string): Telecaller =>
  TELECALLERS.find(t => t.name === name) ?? TELECALLERS.find(t => t.is_active) ?? TELECALLERS[0];

export const OUTCOME_COLORS: Record<CallOutcome, string> = {
  Connected: 'var(--leaf)',
  'No answer': 'var(--gold)',
  Busy: 'var(--rust)',
  'Wrong number': 'var(--ink-soft)',
  'Not interested': 'var(--clay, #8a6d4b)',
};

export type QueueReason = 'Overdue follow-up' | 'Follow-up today' | 'New lead' | 'Quiet 3+ days';
export const QUEUE_CHIP: Record<QueueReason, string> = {
  'Overdue follow-up': 'pending',
  'Follow-up today': 'transit',
  'New lead': 'confirmed',
  'Quiet 3+ days': 'muted',
};

export interface QueueItem {
  lead: TrackerLead;
  reason: QueueReason;
  followup?: Followup;
  lastCall?: LeadActivity;
}

/**
 * Who to call next, in priority order: overdue follow-ups, follow-ups due today,
 * new leads never called, then open leads nobody has touched for 3+ days.
 */
export function buildQueue(leads: TrackerLead[], followups: Followup[], activities: LeadActivity[]): QueueItem[] {
  const byId = new Map(leads.map(l => [l.id, l]));
  const seen = new Set<number>();
  const items: QueueItem[] = [];
  const add = (lead: TrackerLead | undefined, reason: QueueReason, followup?: Followup) => {
    if (!lead || seen.has(lead.id)) return;
    seen.add(lead.id);
    items.push({ lead, reason, followup, lastCall: lastCallFor(lead.id, activities) });
  };

  const today = dayStart(TODAY);
  followups
    .filter(f => f.status === 'missed' || (f.status === 'pending' && dayStart(f.due_at) < today))
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .forEach(f => add(byId.get(f.lead_id), 'Overdue follow-up', f));

  followups
    .filter(f => f.status === 'pending' && f.due_at.startsWith(TODAY))
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .forEach(f => add(byId.get(f.lead_id), 'Follow-up today', f));

  const calledIds = new Set(activities.map(a => a.lead_id));
  leads
    .filter(l => isOpenLead(l) && !calledIds.has(l.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id) // newest first
    .forEach(l => add(l, 'New lead'));

  leads
    .filter(l => isOpenLead(l) && daysBefore(l.updated_at) >= 3)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .forEach(l => add(l, 'Quiet 3+ days'));

  return items;
}
