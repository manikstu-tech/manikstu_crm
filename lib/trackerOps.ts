// Shared telecalling data (leads, calls, follow-ups) and the changes each dashboard may make.
//
// Lead import → assignment (telecalling head / manager) → calling executive calls or imports a
// calling report → the head's dashboard and the manager's Team overview see the result.
//
// Plain functions with no browser or file-system code: the server applies them to the stored
// data (lib/trackerStore.ts). Record shapes are the existing tracker tables, unchanged.

import {
  FOLLOWUPS, LEAD_ACTIVITIES, STAGES, TELECALLERS, TRACKER_LEADS, VERTICALS, WEB_ENQUIRIES,
  CUSTOMER_RESPONSES,
  CallOutcome, CustomerResponse, EnquiryStatus, EnquiryType, Followup, LeadActivity, TrackerLead, WebEnquiry,
} from '../data/managerDashboard';
import { nowStamp } from './format';

export interface TrackerState {
  /** Goes up by one with every change, so dashboards can tell when to refresh. */
  version: number;
  leads: TrackerLead[];
  followups: Followup[];
  activities: LeadActivity[];
  /**
   * When each lead was last assigned, and by whom, keyed by lead id. Kept beside the leads so the
   * lead records stay unchanged. Leads missing here (the sample data) count as assigned when created.
   */
  assignments?: Record<string, Assignment>;
  /** Website enquiries, shared by the manager's and the telecalling head's Enquiries pages. */
  enquiries?: WebEnquiry[];
}

/** An enquiry to add (imported from a file). created_at null = now. */
export interface NewEnquiryData {
  name: string;
  email: string;
  phone: string | null;
  type: EnquiryType;
  message: string;
  created_at: string | null;
}

/** Fields of an enquiry the Enquiries pages may change. */
export type EnquiryPatch = Partial<Pick<WebEnquiry, 'status' | 'admin_notes' | 'replied_at' | 'lead_id'>>;

/** Enquiries in the stored data, or the sample ones if none were saved yet. */
export const enquiriesOf = (state: Pick<TrackerState, 'enquiries'>): WebEnquiry[] => state.enquiries ?? WEB_ENQUIRIES;

export interface Assignment {
  at: string;
  by: string;
}

/** When a lead was assigned to its current telecaller, and who assigned it (null if unknown). */
export function assignmentOf(state: Pick<TrackerState, 'assignments'>, lead: TrackerLead): { at: string; by: string | null } {
  const a = state.assignments?.[String(lead.id)];
  return a ? { at: a.at, by: a.by } : { at: lead.created_at, by: null };
}

export type NewLeadInput = Omit<TrackerLead, 'id' | 'stage_id' | 'created_at' | 'updated_at'>;

export interface CallInput {
  leadId: number;
  outcome: CallOutcome;
  /** Status after the call; null keeps the lead's current status. */
  stageId: number | null;
  note: string;
  durationSec: number | null;
  /** The callback this call answers, if any: marked done when the customer was reached. */
  followupId?: number | null;
  /** Book the next callback. */
  next?: { date: string; note: string } | null;
  /** When the call happened (calling report import); defaults to now. */
  calledAt?: string | null;
  /** The order the customer placed during the call (taken with the call report when the response is "Placed order"). */
  order?: CallOrderInput | null;
  /** What the customer said: required on the call report when the customer was reached. */
  customerResponse?: CustomerResponse | null;
}

/** What a phone order carries: a catalogue product (priced by the server), how many, and where to deliver. */
export interface CallOrderInput {
  productId: number;
  quantity: number;
  address: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: 'COD' | 'UPI';
}

/** The part of a call report an executive can correct and submit again. */
export interface ReportEdit {
  activityId: number;
  note?: string;
  customerResponse?: CustomerResponse | null;
}

export type TrackerAction =
  | { type: 'import-leads'; leads: NewLeadInput[] }
  | { type: 'add-lead'; lead: NewLeadInput }
  | { type: 'assign'; leadIds: number[]; callerId: number }
  | { type: 'log-call'; call: CallInput }
  | { type: 'import-report'; calls: CallInput[] }
  | { type: 'complete-followup'; followupId: number }
  /** Spread uncalled leads evenly across the active executives (all of them when no ids are given). */
  | { type: 'distribute'; leadIds?: number[] }
  | { type: 'update-report'; report: ReportEdit }
  | { type: 'verify-report'; activityIds: number[]; decision: 'verified' | 'returned'; note?: string | null }
  | { type: 'update-enquiries'; changes: { id: number; patch: EnquiryPatch }[] }
  | { type: 'import-enquiries'; enquiries: NewEnquiryData[] };

export type ActorRole = 'manager' | 'telecaller' | 'calling-executive';
const ACTOR_ROLES: string[] = ['manager', 'telecaller', 'calling-executive'];
/** Roles that may see or change the telecalling data (sellers may not). */
export const isActorRole = (role: string): role is ActorRole => ACTOR_ROLES.includes(role);
export interface Actor {
  role: ActorRole;
  name: string;
  /** For calling executives: their telecaller id. */
  callerId?: number;
}

/** Which roles may make each change. */
export const ALLOWED: Record<TrackerAction['type'], ActorRole[]> = {
  'import-leads': ['telecaller', 'manager'],
  'add-lead': ['telecaller', 'manager'],
  assign: ['telecaller', 'manager'],
  'log-call': ['calling-executive'],
  'import-report': ['calling-executive'],
  'complete-followup': ['calling-executive'],
  distribute: ['telecaller', 'manager'],
  'update-report': ['calling-executive'],
  'verify-report': ['telecaller'],
  'update-enquiries': ['manager', 'telecaller'],
  'import-enquiries': ['manager', 'telecaller'],
};

const ENQUIRY_TYPES: EnquiryType[] = ['sales', 'partnership', 'career', 'general'];

const ENQUIRY_STATUSES: EnquiryStatus[] = ['new', 'read', 'replied', 'archived'];

export const OUTCOME_LIST: CallOutcome[] = ['Connected', 'No answer', 'Busy', 'Wrong number', 'Not interested'];
const MAX_IMPORT = 500;

export class TrackerError extends Error {}

export const sampleState = (): TrackerState => ({
  version: 0,
  leads: TRACKER_LEADS.map(l => ({ ...l })),
  followups: FOLLOWUPS.map(f => ({ ...f })),
  activities: LEAD_ACTIVITIES.map(a => ({ ...a })),
});

/** Timestamps follow the sample data's calendar (TODAY at the current time), like the dashboards do. */
const stamp = () => nowStamp();

const firstStage = (verticalId: number) =>
  STAGES.filter(s => s.vertical_id === verticalId).sort((a, b) => a.sort_order - b.sort_order)[0];
const activeCaller = (id: number) => TELECALLERS.find(t => t.id === id && t.is_active);
const nextId = (rows: { id: number }[]) => Math.max(0, ...rows.map(r => r.id)) + 1;

function checkNewLead(l: NewLeadInput, index?: number): NewLeadInput {
  const where = index === undefined ? '' : ` (row ${index + 1})`;
  const name = String(l.customer_name ?? '').replace(/\s+/g, ' ').trim();
  const phone = String(l.phone ?? '').replace(/\D/g, '').slice(-10);
  if (name.length < 2 || name.length > 80) throw new TrackerError(`Lead name is missing${where}.`);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new TrackerError(`Phone number is not a valid mobile${where}.`);
  if (!VERTICALS.some(v => v.id === l.vertical_id)) throw new TrackerError(`Unknown product line${where}.`);
  // 0 = leave the lead unassigned; otherwise it must go to an active telecaller.
  if (l.assigned_to !== 0 && !activeCaller(l.assigned_to)) throw new TrackerError(`Leads can only be assigned to an active telecaller${where}.`);
  const reason = String(l.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
  return { vertical_id: l.vertical_id, assigned_to: l.assigned_to, customer_name: name, phone, source: String(l.source ?? 'Imported file').slice(0, 40), reason };
}

function createLeads(state: TrackerState, inputs: NewLeadInput[]): TrackerLead[] {
  const now = stamp();
  let id = nextId(state.leads);
  const phones = new Set(state.leads.map(l => l.phone));
  return inputs.map((raw, i) => {
    const l = checkNewLead(raw, inputs.length > 1 ? i : undefined);
    if (phones.has(l.phone)) throw new TrackerError(`${l.customer_name} (${l.phone}) is already a lead.`);
    phones.add(l.phone);
    return { ...l, id: id++, stage_id: firstStage(l.vertical_id).id, created_at: now, updated_at: now };
  });
}

/** Adds one call to the state (activity, lead stage, follow-ups). Mutates the given arrays' copies. */
function applyCall(state: TrackerState, call: CallInput, actor: Actor, needsReport = false): string {
  const lead = state.leads.find(l => l.id === Number(call.leadId));
  if (!lead) throw new TrackerError('That lead no longer exists.');
  if (lead.assigned_to !== actor.callerId) throw new TrackerError(`${lead.customer_name} is not assigned to you any more.`);
  if (!OUTCOME_LIST.includes(call.outcome)) throw new TrackerError('Choose a call outcome.');
  // A call logged from the dashboard is also the call report: when the customer was reached it must say what they answered.
  const response = String(call.customerResponse ?? '').trim();
  if (response && !CUSTOMER_RESPONSES.includes(response as CustomerResponse)) throw new TrackerError('Choose the customer’s response from the list.');
  if (needsReport && call.outcome === 'Connected' && !response) throw new TrackerError('Fill in the customer’s response to submit the call report.');
  const nextDate = call.next?.date && /^\d{4}-\d{2}-\d{2}$/.test(call.next.date) ? call.next.date : null;
  const stage = STAGES.find(s => s.id === (call.stageId === null || call.stageId === undefined ? lead.stage_id : Number(call.stageId)));
  if (!stage || stage.vertical_id !== lead.vertical_id) throw new TrackerError(`Choose a status from ${lead.customer_name}'s product line.`);

  const now = stamp();
  const at = call.calledAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(call.calledAt) && call.calledAt <= now ? call.calledAt : now;
  const duration = call.durationSec === null || call.durationSec === undefined ? null : Math.max(0, Math.min(4 * 3600, Math.round(Number(call.durationSec)) || 0));

  // The lead's status follows its most recent call (a report can contain older calls).
  const latest = state.activities.reduce((m, a) => (a.lead_id === lead.id && a.created_at > m ? a.created_at : m), '');
  state.activities.push({
    id: nextId(state.activities),
    lead_id: lead.id,
    caller_id: actor.callerId!,
    stage_id: stage.id,
    note: String(call.note ?? '').trim().slice(0, 500) || (call.outcome === 'Connected' ? 'Spoke to customer' : call.outcome),
    outcome: call.outcome,
    duration_sec: call.outcome === 'Connected' ? duration : null,
    created_at: at,
    customer_response: (response as CustomerResponse) || null,
    followup_date: nextDate,
    followup_note: nextDate ? String(call.next?.note ?? '').trim().slice(0, 200) || 'Call back' : null,
    report_status: 'submitted',
    verified_by: null,
    verified_at: null,
    verify_note: null,
  });
  if (at >= latest) lead.stage_id = stage.id;
  lead.updated_at = at > lead.updated_at ? at : lead.updated_at;

  if (call.outcome === 'Connected') {
    // A connected call answers the callback it was for (or the oldest open one on this lead).
    const fu = state.followups.find(f => f.id === Number(call.followupId) && f.lead_id === lead.id && f.status !== 'done')
      ?? state.followups.filter(f => f.lead_id === lead.id && f.status !== 'done' && f.due_at.slice(0, 10) <= at.slice(0, 10)).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    if (fu) { fu.status = 'done'; fu.completed_at = at; }
  }
  if (call.next?.date && /^\d{4}-\d{2}-\d{2}$/.test(call.next.date)) {
    state.followups.push({
      id: nextId(state.followups),
      lead_id: lead.id,
      caller_id: actor.callerId!,
      due_at: `${call.next.date}T10:00`,
      note: String(call.next.note ?? '').trim().slice(0, 200) || 'Call back',
      status: 'pending',
      completed_at: null,
    });
  }
  return lead.customer_name;
}

export interface ActionResult {
  state: TrackerState;
  message: string;
  /** Ids of leads created by this change. */
  createdIds?: number[];
}

/** Applies one change and returns the new state (the input is not modified). */
export function applyAction(current: TrackerState, action: TrackerAction, actor: Actor): ActionResult {
  if (!ALLOWED[action.type]?.includes(actor.role)) throw new TrackerError('You are not allowed to do that.');
  const state: TrackerState = {
    version: current.version + 1,
    leads: current.leads.map(l => ({ ...l })),
    followups: current.followups.map(f => ({ ...f })),
    activities: current.activities.map(a => ({ ...a })), // copies: report edits change rows in place
    assignments: { ...(current.assignments ?? {}) },
    enquiries: enquiriesOf(current).map(e => ({ ...e })),
  };
  const noteAssigned = (ids: number[]) => {
    const at = stamp();
    ids.forEach(id => { state.assignments![String(id)] = { at, by: actor.name }; });
  };

  switch (action.type) {
    case 'import-leads':
    case 'add-lead': {
      const inputs = action.type === 'add-lead' ? [action.lead] : action.leads;
      if (!Array.isArray(inputs) || inputs.length === 0) throw new TrackerError('No leads to add.');
      if (inputs.length > MAX_IMPORT) throw new TrackerError(`Import at most ${MAX_IMPORT} leads at a time.`);
      const created = createLeads(state, inputs);
      state.leads = [...created, ...state.leads];
      noteAssigned(created.map(l => l.id));
      const people = new Set(created.map(l => l.assigned_to)).size;
      return {
        state,
        createdIds: created.map(l => l.id),
        message: `${created.length} lead${created.length === 1 ? '' : 's'} added and assigned to ${people} telecaller${people === 1 ? '' : 's'}`,
      };
    }
    case 'assign': {
      const to = activeCaller(Number(action.callerId));
      if (!to) throw new TrackerError('Leads can only be assigned to an active telecaller.');
      const ids = new Set((action.leadIds ?? []).map(Number));
      const moved = state.leads.filter(l => ids.has(l.id));
      if (moved.length === 0) throw new TrackerError('Those leads no longer exist.');
      const now = stamp();
      moved.forEach(l => { l.assigned_to = to.id; l.updated_at = now; });
      noteAssigned(moved.map(l => l.id));
      // Open callbacks move with the lead.
      state.followups.forEach(f => {
        if (ids.has(f.lead_id) && f.status !== 'done') { f.caller_id = to.id; f.status = 'pending'; }
      });
      return { state, message: `${moved.length === 1 ? moved[0].customer_name : `${moved.length} leads`} assigned to ${to.name}` };
    }
    case 'log-call': {
      const name = applyCall(state, action.call, actor, true);
      return { state, message: `${name}: ${action.call.outcome} saved and report submitted` };
    }
    case 'distribute': {
      const execs = TELECALLERS.filter(t => t.is_active);
      if (execs.length === 0) throw new TrackerError('There are no active calling executives to distribute to.');
      const called = new Set(state.activities.map(a => a.lead_id));
      const only = action.leadIds ? new Set(action.leadIds.map(Number)) : null;
      const untouched = state.leads.filter(l => !called.has(l.id) && (!only || only.has(l.id))).sort((a, b) => a.id - b.id);
      if (untouched.length === 0) throw new TrackerError('There are no uncalled leads to distribute.');
      // Open workload now = uncalled leads each executive holds; the ones being re-dealt stop counting against their holder.
      const load = new Map(execs.map(t => [t.id, state.leads.filter(l => l.assigned_to === t.id && !called.has(l.id)).length]));
      untouched.forEach(l => { if (load.has(l.assigned_to)) load.set(l.assigned_to, load.get(l.assigned_to)! - 1); });
      const now = stamp();
      let moved = 0;
      for (const lead of untouched) {
        const [to] = Array.from(load.entries()).sort((a, b) => a[1] - b[1])[0];
        if (lead.assigned_to !== to) {
          lead.assigned_to = to;
          lead.updated_at = now;
          state.followups.forEach(f => { if (f.lead_id === lead.id && f.status !== 'done') { f.caller_id = to; f.status = 'pending'; } });
          noteAssigned([lead.id]);
          moved++;
        }
        load.set(to, load.get(to)! + 1);
      }
      return { state, message: `${untouched.length} uncalled leads spread across ${execs.length} executives (${moved} reassigned)` };
    }
    case 'update-report': {
      const a = state.activities.find(x => x.id === Number(action.report?.activityId));
      if (!a || a.caller_id !== actor.callerId) throw new TrackerError('That call report is not yours.');
      if (a.report_status === 'verified') throw new TrackerError('A verified report can no longer be changed.');
      const response = String(action.report.customerResponse ?? a.customer_response ?? '').trim();
      if (response && !CUSTOMER_RESPONSES.includes(response as CustomerResponse)) throw new TrackerError('Choose the customer’s response from the list.');
      if (a.outcome === 'Connected' && !response) throw new TrackerError('Fill in the customer’s response to submit the call report.');
      const note = action.report.note === undefined ? '' : String(action.report.note).trim().slice(0, 500);
      if (note) a.note = note;
      a.customer_response = (response as CustomerResponse) || null;
      a.report_status = 'submitted';
      a.verified_by = null; a.verified_at = null; a.verify_note = null;
      return { state, message: 'Call report submitted again' };
    }
    case 'verify-report': {
      if (action.decision !== 'verified' && action.decision !== 'returned') throw new TrackerError('Choose verify or return.');
      const note = action.note ? String(action.note).trim().slice(0, 300) : '';
      if (action.decision === 'returned' && !note) throw new TrackerError('Say what needs correcting when sending a report back.');
      const ids = new Set((action.activityIds ?? []).map(Number));
      const found = state.activities.filter(a => ids.has(a.id));
      if (found.length === 0) throw new TrackerError('Those reports no longer exist.');
      const now = stamp();
      found.forEach(a => {
        a.report_status = action.decision;
        a.verified_by = actor.name; a.verified_at = now;
        a.verify_note = action.decision === 'returned' ? note : note || null;
      });
      return { state, message: `${found.length} call report${found.length === 1 ? '' : 's'} ${action.decision === 'verified' ? 'verified' : 'sent back'}` };
    }
    case 'import-report': {
      if (!Array.isArray(action.calls) || action.calls.length === 0) throw new TrackerError('The report has no calls to import.');
      if (action.calls.length > MAX_IMPORT) throw new TrackerError(`Import at most ${MAX_IMPORT} calls at a time.`);
      // Oldest first; calls without a time happened just now, so they go last.
      const now = stamp();
      const ordered = [...action.calls].sort((a, b) => (a.calledAt || now).localeCompare(b.calledAt || now));
      ordered.forEach(c => applyCall(state, c, actor));
      return { state, message: `${ordered.length} call${ordered.length === 1 ? '' : 's'} imported from the report` };
    }
    case 'complete-followup': {
      const f = state.followups.find(x => x.id === Number(action.followupId));
      const lead = f && state.leads.find(l => l.id === f.lead_id);
      if (!f || !lead) throw new TrackerError('That follow-up no longer exists.');
      if (lead.assigned_to !== actor.callerId) throw new TrackerError(`${lead.customer_name} is not assigned to you any more.`);
      if (f.status !== 'done') { f.status = 'done'; f.completed_at = stamp(); }
      return { state, message: `Follow-up done: ${lead.customer_name}` };
    }
    case 'update-enquiries': {
      if (!Array.isArray(action.changes) || action.changes.length === 0) throw new TrackerError('Nothing to change.');
      for (const { id, patch } of action.changes) {
        const e = state.enquiries!.find(x => x.id === Number(id));
        if (!e) throw new TrackerError('That enquiry no longer exists.');
        if (patch.status !== undefined) {
          if (!ENQUIRY_STATUSES.includes(patch.status)) throw new TrackerError('Unknown enquiry status.');
          e.status = patch.status;
        }
        if (patch.admin_notes !== undefined) e.admin_notes = patch.admin_notes === null ? null : String(patch.admin_notes).slice(0, 2000);
        if (patch.replied_at !== undefined) {
          if (patch.replied_at !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(patch.replied_at)) throw new TrackerError('Invalid reply time.');
          e.replied_at = patch.replied_at;
        }
        if (patch.lead_id !== undefined) {
          if (patch.lead_id !== null && !state.leads.some(l => l.id === Number(patch.lead_id))) throw new TrackerError('That lead no longer exists.');
          e.lead_id = patch.lead_id === null ? null : Number(patch.lead_id);
        }
      }
      const n = action.changes.length;
      return { state, message: `${n} ${n === 1 ? 'enquiry' : 'enquiries'} updated` };
    }
    case 'import-enquiries': {
      const list = action.enquiries;
      if (!Array.isArray(list) || list.length === 0) throw new TrackerError('No enquiries to import.');
      if (list.length > MAX_IMPORT) throw new TrackerError(`Import at most ${MAX_IMPORT} enquiries at a time.`);
      const now = stamp();
      let id = Math.max(0, ...state.enquiries!.map(e => e.id)) + 1;
      const created: WebEnquiry[] = list.map((raw, i) => {
        const row = list.length > 1 ? ` (row ${i + 1})` : '';
        const name = String(raw.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
        const email = String(raw.email ?? '').trim().slice(0, 120);
        const digits = String(raw.phone ?? '').replace(/\D/g, '').slice(-10);
        const phone = /^[6-9]\d{9}$/.test(digits) ? digits : null;
        const message = String(raw.message ?? '').trim().slice(0, 2000);
        if (!name) throw new TrackerError(`Name is missing${row}.`);
        if (!phone && !email) throw new TrackerError(`Add a phone number or email${row}.`);
        if (!message) throw new TrackerError(`Message is missing${row}.`);
        if (!ENQUIRY_TYPES.includes(raw.type)) throw new TrackerError(`Unknown enquiry type${row}.`);
        const when = raw.created_at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw.created_at) && raw.created_at <= now ? raw.created_at : now;
        return {
          id: id++, name, email, phone, type: raw.type, message, status: 'new' as EnquiryStatus,
          admin_notes: null, replied_at: null, customer_id: null, lead_id: null, created_at: when,
        };
      });
      state.enquiries = [...created, ...state.enquiries!].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { state, createdIds: created.map(e => e.id), message: `${created.length} ${created.length === 1 ? 'enquiry' : 'enquiries'} imported` };
    }
    default:
      throw new TrackerError('Unknown change.');
  }
}

/** What a calling executive may see: their own leads, with the full call history on them. */
export function stateFor(state: TrackerState, actor: Actor): TrackerState {
  if (actor.role !== 'calling-executive') return state.enquiries ? state : { ...state, enquiries: WEB_ENQUIRIES };
  const leads = state.leads.filter(l => l.assigned_to === actor.callerId);
  const ids = new Set(leads.map(l => l.id));
  return {
    version: state.version,
    leads,
    followups: state.followups.filter(f => ids.has(f.lead_id)),
    activities: state.activities.filter(a => ids.has(a.lead_id)),
    assignments: Object.fromEntries(Object.entries(state.assignments ?? {}).filter(([id]) => ids.has(Number(id)))),
  };
}
