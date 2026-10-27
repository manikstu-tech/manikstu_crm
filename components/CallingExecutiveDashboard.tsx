'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarClock, ClipboardCheck, Inbox, LayoutDashboard, ListChecks, MessageSquareWarning, PackageCheck } from 'lucide-react';
import Sidebar, { NavGroup } from './Sidebar';
import BottomNav from './BottomNav';
import Topbar from './Topbar';
import CeOverview from './calling-executive/CeOverview';
import { type CallForm, emptyOrderForm } from './calling-executive/CallDeskView';
import CallbacksView from './calling-executive/CallbacksView';
import CeFollowupsView from './calling-executive/CeFollowupsView';
import CeReportsView from './calling-executive/CeReportsView';
import OrderFollowUp from './orders/OrderFollowUp';
import MyReports from './workflow/MyReports';
import ExecEnquiries from './calling-executive/ExecEnquiries';
import ExecComplaints from './calling-executive/ExecComplaints';
import { useComplaints } from '../lib/useComplaints';
import { enquiriesOf } from '../lib/trackerOps';
import { reportStatusOf } from '../lib/leadWorkflow';
import CallModal, { CallTarget, CatalogItem, dial } from './calling-executive/CallModal';
import { TODAY, TRACKER_SALES, CallOutcome, CustomerResponse } from '../data/managerDashboard';
import { dayStart } from '../lib/format';
import type { CallInput, TrackerState } from '../lib/trackerOps';
import { useTracker } from '../lib/useTracker';
import SyncBadge from './SyncBadge';
import { TeamData, stageOf } from './telecaller/tcData';
import { QueueItem, buildQueue, callerFor } from './calling-executive/queue';
import type { SessionUser } from '../lib/session';

const tomorrow = () => {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyForm = (stageId: number, nextNote = ''): CallForm => ({
  note: '',
  stageId,
  scheduleNext: false,
  nextDate: tomorrow(),
  nextNote,
  customerResponse: '',
  order: emptyOrderForm(),
});

export default function CallingExecutiveDashboard({ user, tracker }: { user: SessionUser; tracker: TrackerState }) {
  const firstName = user.name.split(' ')[0];
  const me = callerFor(user.name);

  const [activePage, setActivePage] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Shared tracker data: leads the telecalling head assigns show up here automatically, and calls
  // saved here reach the head's dashboard and the manager's Team overview.
  const sync = useTracker(tracker);
  const { leads, followups, activities } = sync.data;
  const teamData: TeamData = useMemo(
    () => ({ leads, followups, activities, sales: TRACKER_SALES }),
    [leads, followups, activities],
  );

  const myLeads = useMemo(() => leads.filter(l => l.assigned_to === me.id), [leads, me.id]);
  const myFollowups = useMemo(() => followups.filter(f => f.caller_id === me.id), [followups, me.id]);
  const myActivities = useMemo(() => activities.filter(a => a.caller_id === me.id), [activities, me.id]);

  // Leads called this session drop out of the "to call now" queue count.
  const [handled, setHandled] = useState<number[]>([]);
  const queue = useMemo(() => {
    return buildQueue(myLeads, myFollowups, myActivities).filter(q => !handled.includes(q.lead.id));
  }, [myLeads, myFollowups, myActivities, handled]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Customer support. Enquiries: only the ones the head handed to this executive (the server sends no others), each
  // one also a lead on the Call desk. Complaints: only the tickets assigned to them, read from and saved to the backend.
  const myEnquiries = useMemo(() => enquiriesOf(sync.data).filter(e => e.lead_id !== null && myLeads.some(l => l.id === e.lead_id)), [sync.data, myLeads]);
  const enquiriesToCall = myEnquiries.filter(e => e.status !== 'replied' && !myActivities.some(a => a.lead_id === e.lead_id && a.outcome === 'Connected')).length;
  const [complaints, setComplaints, complaintsSync] = useComplaints([], msg => showToast(`⚠️ ${msg}`));
  const myOpenComplaints = complaints.filter(c => c.assigned_to === me.id && c.status !== 'resolved' && c.status !== 'closed').length;

  // What a customer can order on a call, with prices: the live catalogue (every priced, active product from the website
  // and the sellers). Loaded when the dashboard opens and again each time a call opens, so a product added a minute ago
  // is there. Empty without a backend (offline demo), where a call can still be saved but no order is placed.
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const loadCatalog = async () => {
    try {
      const res = await fetch('/api/catalog/products', { cache: 'no-store' });
      if (!res.ok) return;
      const body = await res.json();
      if (Array.isArray(body.data)) setCatalog(body.data as CatalogItem[]);
    } catch { /* the order section shows "Loading products…" until it works */ }
  };
  useEffect(() => { void loadCatalog(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Records a call (activity, lead stage, follow-ups) on the server. */
  /** Saves the call (and its order). Resolves to null once saved, or to the reason it was not, so nothing typed is lost. */
  const logCall = async (
    { lead, followup }: CallTarget,
    outcome: CallOutcome,
    form: CallForm,
    durationSec: number | null,
  ): Promise<string | null> => {
    const lines = form.order.items.filter(l => l.productId !== '');
    const call: CallInput = {
      leadId: lead.id,
      outcome,
      stageId: form.stageId,
      note: form.note,
      customerResponse: form.customerResponse || null,
      // The customer ordered on this call: send what, how many and where, so it becomes one order for the seller. Each
      // line carries the price the caller saw; the server prices the order itself and refuses it if that has changed.
      order: outcome === 'Connected' && form.customerResponse === 'Placed order' && lines.length > 0
        ? {
            items: lines.map(l => ({
              productId: Number(l.productId),
              quantity: Math.floor(Number(l.quantity) || 0),
              price: catalog.find(c => c.id === l.productId)?.price,
            })),
            address: form.order.address.trim(),
            city: form.order.city.trim(), state: form.order.state.trim(), pincode: form.order.pincode.trim(), paymentMethod: form.order.paymentMethod,
          }
        : null,
      durationSec,
      followupId: followup?.id ?? null,
      next: form.scheduleNext && form.nextDate ? { date: form.nextDate, note: form.nextNote } : null,
    };
    setHandled(prev => [...prev, lead.id]);
    try {
      const { message } = await sync.run({ type: 'log-call', call });
      const stageChanged = form.stageId !== lead.stage_id;
      // When an order was placed the server says which one (and that it went to the seller): that is the news worth showing.
      showToast(call.order && message.includes('order')
        ? message
        : `${lead.customer_name}: ${outcome}${stageChanged ? ` · moved to ${stageOf(form.stageId)?.name}` : ''}${form.scheduleNext ? ' · callback booked' : ''}`);
      return null;
    } catch (e) {
      setHandled(prev => prev.filter(id => id !== lead.id)); // not saved: keep it in the queue
      // A price or product may have changed since the window opened: reload the catalogue so the window shows it now.
      if (call.order) void loadCatalog();
      return (e as Error).message || 'Could not save the call. Please try again.';
    }
  };

  // The Call button dials straight away and opens the calling window.
  const [callTarget, setCallTarget] = useState<CallTarget | null>(null);
  const startCall = (leadId: number, followupId?: number) => {
    const lead = myLeads.find(l => l.id === leadId);
    if (!lead) return;
    const followup =
      (followupId !== undefined ? myFollowups.find(f => f.id === followupId) : undefined) ??
      queue.find(q => q.lead.id === leadId)?.followup ??
      myFollowups.filter(f => f.lead_id === leadId && f.status !== 'done').sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    dial(lead.phone);
    void loadCatalog(); // refresh the products the customer can order, so a newly added one is in the list
    setCallTarget({ lead, followup });
  };

  /** "Start calling": open the next lead in the queue. */
  const startNext = () => {
    if (queue[0]) startCall(queue[0].lead.id);
    else showToast('No leads waiting to be called right now');
  };

  /** The executive corrects a call report (usually one sent back) and submits it again. Errors go to the form. */
  const resubmitReport = async (activityId: number, note: string, response: CustomerResponse | null) => {
    const { message } = await sync.run({ type: 'update-report', report: { activityId, note, customerResponse: response } });
    showToast(message);
  };

  const completeFollowup = async (followupId: number) => {
    try {
      const { message } = await sync.run({ type: 'complete-followup', followupId });
      showToast(message);
    } catch (e) {
      showToast(`⚠️ ${(e as Error).message}`);
    }
  };

  const dueCallbacks = myFollowups.filter(
    f => f.status !== 'done' && (f.status === 'missed' || dayStart(f.due_at) <= dayStart(TODAY))
  ).length;

  const pageMeta: Record<string, { title: string; sub: string }> = {
    overview:  { title: `Namaskar, ${firstName}`, sub: 'Your day, callbacks, leads and performance at a glance.' },
    callbacks: { title: 'Call Desk',    sub: 'Your assigned leads, calls made, pending calls and callbacks in one place.' },
    followups: { title: 'Follow-ups',   sub: 'Every callback you owe — overdue, due today and upcoming.' },
    reports:   { title: 'Reports',      sub: 'Your calling performance, and reports you can download as Excel or PDF.' },
    enquiries: { title: 'Website Enquiries', sub: 'Enquiries the telecalling head has handed to you: call the customer with their message in front of you.' },
    complaints: { title: 'Complaints', sub: 'Customer complaints assigned to you: call, add notes, resolve them or hand them back to the head.' },
    'my-reports': { title: 'Call Reports', sub: 'Every call you have made and the report you submitted for it, and whether the telecalling head has verified it or sent it back.' },
    'order-calls': { title: 'Order Calls', sub: 'Orders the seller has confirmed: call the customer, log how it went and book follow-ups.' },
  };
  const currentMeta = pageMeta[activePage] ?? pageMeta.overview;

  const navGroups: NavGroup[] = [
    { label: 'Overview', items: [{ key: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'My work',
      items: [
        { key: 'callbacks', label: 'Call desk', icon: CalendarClock, count: dueCallbacks },
        { key: 'followups', label: 'Follow-ups', icon: ListChecks, count: dueCallbacks },
        { key: 'my-reports', label: 'Call reports', icon: ClipboardCheck, count: myActivities.filter(a => reportStatusOf(a) === 'returned').length },
        { key: 'order-calls', label: 'Order calls', icon: PackageCheck },
      ],
    },
    {
      label: 'Customer support',
      items: [
        { key: 'enquiries', label: 'Enquiries', icon: Inbox, count: enquiriesToCall },
        { key: 'complaints', label: 'Complaints', icon: MessageSquareWarning, count: myOpenComplaints },
      ],
    },
    { label: 'Performance', items: [{ key: 'reports', label: 'Reports', icon: BarChart3 }] },
  ];

  // Phones: the page menu (sidebar drawer), also opened by the bottom bar's More.
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (page: string) => {
    setActivePage(page);
    setSearchQuery('');
    window.scrollTo(0, 0);
  };

  return (
    <div className="card-layout has-bottom-nav">
      {toastMessage && <div className={`toast ${toastMessage.startsWith('⚠️') ? 'toast-error' : ''}`}>{toastMessage.startsWith('⚠️') ? toastMessage : `✅ ${toastMessage}`}</div>}

      <div className="shell">
        <Sidebar groups={navGroups} activePage={activePage} onSelectPage={handleNavigate} menuOpen={menuOpen} onMenuOpenChange={setMenuOpen} />

        <main className="main">
          <Topbar
            title={currentMeta.title}
            subtitle={currentMeta.sub}
            search={activePage === 'callbacks' || activePage === 'followups' || activePage === 'order-calls' || activePage === 'my-reports' || activePage === 'enquiries' || activePage === 'complaints'
              ? { query: searchQuery, onChange: setSearchQuery, placeholder: 'Search by name, phone or note…' }
              : undefined}
            status={<SyncBadge syncedAt={sync.syncedAt} offline={sync.offline} />}
            profile={{ name: user.name, role: 'Calling Executive', initials: user.initials, detail: `Staff ID ${user.staffId} · Morning shift 9:00–18:00` }}
          />

          {activePage === 'overview' && (
            <CeOverview
              data={teamData}
              assignments={sync.data.assignments}
              me={me}
              queueCount={queue.length}
              onStartCalling={startNext}
              onOpenCallbacks={() => handleNavigate('callbacks')}
              onCallLead={startCall}
              onFollowupDone={completeFollowup}
            />
          )}
          {activePage === 'followups' && (
            <CeFollowupsView
              leads={myLeads}
              followups={myFollowups}
              activities={myActivities}
              searchQuery={searchQuery}
              onCall={startCall}
              onDone={completeFollowup}
            />
          )}
          {activePage === 'order-calls' && <OrderFollowUp searchQuery={searchQuery} onToast={showToast} />}
          {activePage === 'my-reports' && <MyReports leads={myLeads} activities={myActivities} searchQuery={searchQuery} onResubmit={resubmitReport} />}
          {activePage === 'enquiries' && <ExecEnquiries enquiries={myEnquiries} leads={myLeads} activities={myActivities} searchQuery={searchQuery} meName={me.name} onCall={leadId => startCall(leadId)} />}
          {activePage === 'complaints' && <ExecComplaints complaints={complaints} meId={me.id} meName={me.name} searchQuery={searchQuery} ready={complaintsSync.ready} onChange={setComplaints} onToast={showToast} />}
          {activePage === 'callbacks' && (
            <CallbacksView leads={myLeads} followups={myFollowups} activities={myActivities} queue={queue} assignments={sync.data.assignments} searchQuery={searchQuery} onOpen={startCall} />
          )}
          {activePage === 'reports' && (
            <CeReportsView
              me={me}
              leads={myLeads}
              followups={myFollowups}
              activities={myActivities}
              queue={queue}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {callTarget && (
        <CallModal
          key={callTarget.lead.id}
          target={callTarget}
          me={me}
          history={activities.filter(a => a.lead_id === callTarget.lead.id).sort((a, b) => b.created_at.localeCompare(a.created_at))}
          enquiry={myEnquiries.find(e => e.lead_id === callTarget.lead.id)}
          catalog={catalog}
          initialForm={emptyForm(callTarget.lead.stage_id, callTarget.followup?.note ?? '')}
          onSave={async (outcome, callForm, durationSec) => {
            // The window closes only once the call (and any order) is saved; otherwise it stays open with the error.
            const error = await logCall(callTarget, outcome, callForm, durationSec);
            if (!error) setCallTarget(null);
            return error;
          }}
          onClose={() => setCallTarget(null)}
        />
      )}

      {/* Phones: the daily pages as bottom tabs; More opens the full page menu above. */}
      <BottomNav
        groups={navGroups}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'callbacks', label: 'Call desk' },
          { key: 'followups', label: 'Follow-ups' },
          { key: 'order-calls', label: 'Order calls' },
        ]}
        activePage={activePage}
        onSelectPage={handleNavigate}
        onMore={() => setMenuOpen(true)}
      />
    </div>
  );
}
