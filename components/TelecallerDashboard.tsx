'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, CalendarClock, ClipboardCheck, Gauge, Inbox, PhoneCall, LayoutDashboard, MapPin, Megaphone, MessageSquareWarning, Package, TrendingUp, Truck, UserCheck, UserPlus, Users,
} from 'lucide-react';
import Sidebar, { NavGroup } from './Sidebar';
import BottomNav from './BottomNav';
import Topbar from './Topbar';
import NotificationsDrawer from './NotificationsDrawer';
import TeamOverview from './telecaller/TeamOverview';
import BusinessDashboard from './telecaller/BusinessDashboard';
import TeamLeads from './telecaller/TeamLeads';
import TeamFollowups from './telecaller/TeamFollowups';
import TeamSales from './telecaller/TeamSales';
import TeamMarketing from './telecaller/TeamMarketing';
import { Campaign, SAMPLE_CAMPAIGNS } from '../data/marketing';
import StaffOnboarding from './telecaller/StaffOnboarding';
import TelecallingExecutivesView from './views/TelecallingExecutivesView';
import RegionalReportView from './views/RegionalReportView';
import EnquiriesView from './views/EnquiriesView';
import TeamReports from './telecaller/TeamReports';
import TeamComplaints from './telecaller/TeamComplaints';
import TeamOrders from './telecaller/TeamOrders';
import OrderFollowUp from './orders/OrderFollowUp';
import CallReportsView from './workflow/CallReportsView';
import { reportStatusOf, workflowSummary } from '../lib/leadWorkflow';
import TeamInventory from './telecaller/TeamInventory';
import { trackingFor } from './telecaller/orderTracking';
import type { SalesOrder } from '../data/managerDashboard';
import { INITIAL_COMPLAINTS } from '../data/complaints';
import { useComplaints } from '../lib/useComplaints';
import { applyOrders } from '../lib/liveMode';
import { isUnassigned } from './telecaller/complaintsUtil';
import {
  SALES_ORDERS,
  TELECALLERS,
  TRACKER_SALES,
  VERTICALS,
  WebEnquiry,
} from '../data/managerDashboard';
import { detectVertical } from '../lib/leadImport';
import type { LeadPatch, NewEnquiryData, TrackerState } from '../lib/trackerOps';
import { useSharedEnquiries, useTracker } from '../lib/useTracker';
import SyncBadge from './SyncBadge';
import type { ImportOutcome, NewLead } from './telecaller/ImportLeads';
import { TeamData, isOverdue, staffStats, stuckLeadCount, teamAlerts } from './telecaller/tcData';
import type { SessionUser } from '../lib/session';

/**
 * Head telecalling dashboard: the telecalling head's view of the whole telecalling team.
 * Works on the same tracker data the manager sees (all telecallers' leads, calls, follow-ups, sales).
 */
export default function TelecallerDashboard({ user, tracker }: { user: SessionUser; tracker: TrackerState }) {
  const firstName = user.name.split(' ')[0];

  const [activePage, setActivePage] = useState('overview');
  const [focusCaller, setFocusCaller] = useState<number | undefined>(undefined);
  /** Executive open on the Executive reports page (null = the list). */
  const [reportExec, setReportExec] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Leads, calls and follow-ups are shared with the calling executives and the manager (kept in sync
  // with the server). Importing and assigning leads change them here; calls come in from the executives.
  const sync = useTracker(tracker);
  const { leads, followups, activities } = sync.data;
  // Website enquiries: the same list as the manager's Enquiries page (shared through the server)
  const [enquiries, setEnquiries] = useSharedEnquiries(sync, msg => showToast(`⚠️ ${msg}`));
  const data: TeamData = useMemo(
    () => ({ leads, followups, activities, sales: TRACKER_SALES }),
    [leads, followups, activities],
  );

  const todayStats = useMemo(() => staffStats(data, 'today', 'all'), [data]);
  const alerts = useMemo(() => teamAlerts(todayStats), [todayStats]);

  const [alertsCleared, setAlertsCleared] = useState(false);
  const [isNotifsOpen, setIsNotifsOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>(SAMPLE_CAMPAIGNS);
  const notifications = alertsCleared
    ? []
    : alerts.map(a => ({
        id: a.key,
        title: a.level === 'critical' ? 'Action needed' : 'Heads up',
        message: a.text,
        time: 'Today',
        type: a.level === 'critical' ? ('warning' as const) : ('info' as const),
      }));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Complaints come from the CRM backend (the head sees every ticket); changes made here are saved there.
  const [complaints, setComplaints, complaintsSync] = useComplaints(INITIAL_COMPLAINTS, msg => showToast(`⚠️ ${msg}`));

  const pageMeta: Record<string, { title: string; sub: string }> = {
    dashboard:  { title: 'Business Dashboard',   sub: "Here's an overview of your business performance." },
    overview:   { title: 'Telecalling Team',     sub: `Good day, ${firstName}. Here's how the whole telecalling team is doing.` },
    leads:      { title: 'Leads & Assignment',   sub: 'Import leads and hand them out to the calling executives, then keep everyone’s queue balanced.' },
    followups:  { title: 'Team Follow-ups',      sub: 'Callbacks the calling executives owe: see who is behind and move leads to someone who can call.' },
    regional:   { title: 'Regional Report',      sub: 'Orders by state, district and town: see what farmers bought in each area and download it.' },
    sales:      { title: 'Team Sales',           sub: 'What the team has sold, by telecaller, product and month.' },
    marketing:  { title: 'WhatsApp Marketing',   sub: 'Send offers, reorder reminders and new-product news to customers and leads on WhatsApp.' },
    'exec-reports': { title: 'Executive Reports', sub: 'Every telecalling executive: calls, leads, follow-ups and sales. Open one for the full report, or download reports.' },
    onboarding: { title: 'Staff Onboarding',     sub: 'Add telecalling staff and create their Staff ID and temporary password.' },
    inventory:  { title: 'Stock',                sub: 'What the team can sell today, what is running out and which customers are waiting.' },
    orders:     { title: 'Orders & Tracking',    sub: 'Review every order and where its parcel is, then keep the customer informed on WhatsApp or SMS.' },
    'call-reports': { title: 'Call Reports', sub: 'The report each executive submits after every call: verify it, or send it back with what needs correcting.' },
    'order-calls': { title: 'Order Follow-up', sub: 'Orders the seller has confirmed: call the customer, log how it went and book follow-ups.' },
    enquiries:  { title: 'Website Enquiries',    sub: 'Messages from the website contact form: reply, and assign them to a caller as leads.' },
    reports:    { title: 'Reports & Analytics',  sub: 'Generate and export telecalling, sales, order, stock and support reports as Excel or PDF.' },
    complaints: { title: 'Complaints',           sub: 'Assign each customer complaint to the right telecaller and see it through to resolution.' },
  };
  const currentMeta = pageMeta[activePage] || pageMeta.overview;

  const overdueCount = followups.filter(isOverdue).length + stuckLeadCount(data);
  const withInactive = todayStats.filter(s => !s.t.is_active).reduce((a, s) => a + s.openLeads, 0);
  // Orders for the Orders & tracking page: the live ones from the CRM (seller-confirmed onwards, re-read every 15 s so new
  // orders and status changes appear on their own), or the offline sample when there is no backend.
  const [liveOrders, setLiveOrders] = useState<SalesOrder[] | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch('/api/orders', { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json();
        if (!stop && Array.isArray(body.data)) {
          applyOrders(body.data as SalesOrder[]); // order lookups (complaints, assignment hints) read the shared list
          setLiveOrders(body.data as SalesOrder[]);
        }
      } catch { /* try again next tick */ }
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  const trackOrders = liveOrders ?? SALES_ORDERS;

  // The Regional report counts every farmer who ordered, from every platform (website, telecalling…), including orders
  // the seller has not confirmed yet, so it has its own feed (the list above only starts at confirmation). Read while the
  // report is open and re-read every 20 seconds; offline it keeps the sample orders.
  const [regionalOrders, setRegionalOrders] = useState<SalesOrder[] | null>(null);
  useEffect(() => {
    if (activePage !== 'regional') return;
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch('/api/reports/regional-orders', { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json();
        if (!stop && Array.isArray(body.data)) setRegionalOrders(body.data as SalesOrder[]);
      } catch { /* try again next tick */ }
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => { stop = true; clearInterval(id); };
  }, [activePage]);
  const lateOrders = useMemo(() => trackOrders.filter(o => trackingFor(o).delayed).length, [trackOrders]);
  const toAssign = complaints.filter(isUnassigned).length;
  const workflow = useMemo(() => workflowSummary(sync.data), [sync.data]);

  const navGroups: NavGroup[] = [
    { label: 'Overview', items: [
      { key: 'dashboard', label: 'Dashboard', icon: Gauge },
      { key: 'overview', label: 'Team overview', icon: LayoutDashboard, count: alerts.filter(a => a.level === 'critical').length },
    ] },
    {
      label: 'Team',
      items: [
        { key: 'leads', label: 'Leads & assignment', icon: Users, count: withInactive },
        { key: 'call-reports', label: 'Call reports', icon: ClipboardCheck, count: sync.data.activities.filter(a => reportStatusOf(a) === 'submitted').length },
        { key: 'followups', label: 'Follow-ups', icon: CalendarClock, count: overdueCount },
        { key: 'exec-reports', label: 'Executive reports', icon: UserCheck },
        { key: 'onboarding', label: 'Staff onboarding', icon: UserPlus },
      ],
    },
    {
      label: 'Performance',
      items: [
        { key: 'sales', label: 'Sales', icon: TrendingUp },
        { key: 'marketing', label: 'Marketing', icon: Megaphone },
        { key: 'regional', label: 'Regional report', icon: MapPin },
      ],
    },
    {
      label: 'Inventory',
      items: [
        { key: 'inventory', label: 'Stock', icon: Package },
        { key: 'orders', label: 'Orders & tracking', icon: Truck, count: lateOrders },
        { key: 'order-calls', label: 'Order follow-up', icon: PhoneCall },
      ],
    },
    {
      label: 'Support',
      items: [
        { key: 'enquiries', label: 'Enquiries', icon: Inbox, count: enquiries.filter(e => e.status === 'new').length },
        { key: 'complaints', label: 'Complaints', icon: MessageSquareWarning, count: toAssign },
      ],
    },
    { label: 'Reports', items: [{ key: 'reports', label: 'Reports & Analytics', icon: BarChart3 }] },
  ];

  // Phones: the page menu (sidebar drawer), also opened by the bottom bar's More.
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (page: string, callerId?: number) => {
    setActivePage(page);
    setFocusCaller(callerId);
    if (page === 'exec-reports') setReportExec(callerId ?? null);
    setSearchQuery('');
    window.scrollTo(0, 0);
  };

  /** Verify call reports, or send them back to the executive with a reason. Errors go to the reports page. */
  const verifyReports = async (activityIds: number[], decision: 'verified' | 'returned', note?: string) => {
    const { message } = await sync.run({ type: 'verify-report', activityIds, decision, note });
    showToast(message);
  };

  /** Move leads (and their pending follow-ups) to another telecaller. */
  const handleReassign = async (leadIds: number[], toCallerId: number) => {
    try {
      const { message } = await sync.run({ type: 'assign', leadIds, callerId: toCallerId });
      showToast(message);
    } catch (e) {
      showToast(`⚠️ ${(e as Error).message}`);
    }
  };

  /**
   * Website enquiries → a telecaller: new ones become leads (product line chosen, or read from each
   * message), enquiries that are already leads (same id or phone) move to the caller. True when saved.
   */
  const handleAssignEnquiries = async (list: WebEnquiry[], callerId: number, verticalId: number | 'auto') => {
    const caller = TELECALLERS.find(t => t.id === callerId)?.name ?? 'the caller';
    const withPhone = list.filter(e => e.phone);
    const leadOf = (e: WebEnquiry) =>
      (e.lead_id !== null ? leads.find(l => l.id === e.lead_id) : undefined) ?? leads.find(l => l.phone === e.phone);
    const existing = withPhone.map(e => ({ e, lead: leadOf(e) })).filter(x => x.lead);
    // One lead per phone number, even if the same person sent several enquiries
    const fresh = withPhone.filter(e => !leadOf(e)).filter((e, i, all) => all.findIndex(x => x.phone === e.phone) === i);
    try {
      const links = new Map<number, number>(); // enquiry id → lead id
      if (fresh.length) {
        const { createdIds } = await sync.run({
          type: 'import-leads',
          leads: fresh.map(e => ({
            vertical_id: verticalId === 'auto' ? detectVertical(`${e.message} ${e.type}`) ?? VERTICALS[0].id : verticalId,
            assigned_to: callerId,
            customer_name: e.name,
            phone: e.phone!,
            source: 'Website',
            reason: e.message,
          })),
        });
        fresh.forEach((e, i) => links.set(e.id, createdIds[i]));
        withPhone.forEach(e => { const twin = fresh.find(x => x.phone === e.phone); if (twin && !links.has(e.id)) links.set(e.id, links.get(twin.id)!); });
      }
      const toMove = existing.filter(x => x.lead!.assigned_to !== callerId).map(x => x.lead!.id);
      if (toMove.length) await sync.run({ type: 'assign', leadIds: Array.from(new Set(toMove)), callerId });
      existing.forEach(x => links.set(x.e.id, x.lead!.id));
      const changes = list.filter(e => links.has(e.id)).map(e => ({
        id: e.id,
        patch: { lead_id: links.get(e.id)!, ...(e.status === 'new' ? { status: 'read' as const } : {}) },
      }));
      if (changes.length) await sync.run({ type: 'update-enquiries', changes });
      const skipped = list.length - withPhone.length;
      showToast(`${links.size} ${links.size === 1 ? 'enquiry' : 'enquiries'} assigned to ${caller}${skipped ? ` · ${skipped} skipped (no phone)` : ''}`);
      return true;
    } catch (e) {
      showToast(`⚠️ ${(e as Error).message}`);
      return false;
    }
  };

  /** Enquiries imported from a file; optionally the sales ones go straight to a caller. True when saved. */
  const handleImportEnquiries = async (list: NewEnquiryData[], assignSalesTo: number | null) => {
    try {
      const { message, createdIds } = await sync.run({ type: 'import-enquiries', enquiries: list });
      showToast(message);
      if (assignSalesTo !== null) {
        const sales: WebEnquiry[] = list
          .map((e, i) => ({ ...e, id: createdIds[i], status: 'new' as const, admin_notes: null, replied_at: null, customer_id: null, lead_id: null, created_at: e.created_at ?? '' }))
          .filter(e => e.type === 'sales');
        if (sales.length) await handleAssignEnquiries(sales, assignSalesTo, 'auto');
      }
      return true;
    } catch (e) {
      showToast(`⚠️ ${(e as Error).message}`);
      return false;
    }
  };

  /**
   * Create leads from an imported Excel / PDF file, in the first stage of their product line. Resolves to the error to
   * show, or to what was saved. Numbers someone added since the preview, and rows the server refuses, are reported; the
   * valid rows are still saved.
   */
  const handleImport = async (newLeads: NewLead[]): Promise<ImportOutcome> => {
    try {
      const { message, summary } = await sync.run({ type: 'import-leads', leads: newLeads, skipDuplicates: true, skipInvalid: true });
      showToast(message);
      return { error: null, summary: summary ?? null };
    } catch (e) {
      return { error: (e as Error).message, summary: null };
    }
  };

  /** Edit a lead's details on the same record. Resolves to the error to show in the form, or null once saved. */
  const handleUpdateLead = async (leadId: number, patch: LeadPatch): Promise<string | null> => {
    try {
      const { message } = await sync.run({ type: 'update-lead', leadId, patch });
      showToast(message);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  return (
    <div className="card-layout has-bottom-nav">
      {toastMessage && <div className={`toast ${toastMessage.startsWith('⚠️') ? 'toast-error' : ''}`}>{toastMessage.startsWith('⚠️') ? toastMessage : `✅ ${toastMessage}`}</div>}

      <div className="shell">
        <Sidebar groups={navGroups} activePage={activePage} onSelectPage={page => handleNavigate(page)} menuOpen={menuOpen} onMenuOpenChange={setMenuOpen} />

        <main className="main">
          <Topbar
            title={currentMeta.title}
            subtitle={currentMeta.sub}
            search={{
              query: searchQuery,
              placeholder: activePage === 'complaints' ? 'Search complaints by name, phone, ticket…' : activePage === 'inventory' ? 'Search products…' : activePage === 'exec-reports' ? 'Search executives by name or region…' : activePage === 'orders' || activePage === 'order-calls' ? 'Search orders by name, phone, order no.…' : activePage === 'call-reports' ? 'Search by customer, phone or executive…' : 'Search leads by name or phone…',
              onChange: q => {
                setSearchQuery(q);
                if (activePage !== 'leads' && activePage !== 'followups' && activePage !== 'complaints' && activePage !== 'orders' && activePage !== 'order-calls' && activePage !== 'call-reports' && activePage !== 'inventory' && activePage !== 'exec-reports') {
                  setActivePage('leads');
                  setFocusCaller(undefined);
                }
              },
            }}
            notifications={{ count: notifications.length, onToggle: () => setIsNotifsOpen(o => !o), title: 'Team alerts' }}
            status={<SyncBadge syncedAt={sync.syncedAt} offline={sync.offline} />}
            profile={{ name: user.name, role: 'Telecalling Head', initials: user.initials, detail: `Staff ID ${user.staffId} · Shift 9:00–18:00` }}
          />

          {activePage === 'dashboard' && <BusinessDashboard />}
          {activePage === 'overview' && (
            <TeamOverview
              data={data}
              orders={trackOrders}
              enquiries={enquiries}
              onReassign={handleReassign}
              onOpenLeads={callerId => handleNavigate('leads', callerId)}
              onOpenFollowups={callerId => handleNavigate('followups', callerId)}
              onToast={showToast}
            />
          )}
          {activePage === 'leads' && (
            <TeamLeads key={`leads-${focusCaller ?? 'all'}`} data={data} execSummary={workflow} trackerState={sync.data} searchQuery={searchQuery} initialCaller={focusCaller} onReassign={handleReassign} onImport={handleImport} onUpdateLead={handleUpdateLead} onToast={showToast} />
          )}
          {activePage === 'followups' && (
            <TeamFollowups key={`fu-${focusCaller ?? 'all'}`} data={data} searchQuery={searchQuery} initialCaller={focusCaller} onReassign={handleReassign} onToast={showToast} />
          )}
          {activePage === 'regional' && (
            <RegionalReportView
              orders={regionalOrders ?? SALES_ORDERS}
              onToast={showToast}
            />
          )}
          {activePage === 'sales' && <TeamSales data={data} onToast={showToast} />}
          {activePage === 'marketing' && (
            <TeamMarketing data={data} orders={trackOrders} campaigns={campaigns} onCampaignsChange={setCampaigns} onToast={showToast} />
          )}
          {activePage === 'exec-reports' && (
            <TelecallingExecutivesView
              data={data}
              selectedId={reportExec}
              onSelect={id => { setReportExec(id); window.scrollTo(0, 0); }}
              searchQuery={searchQuery}
              onToast={showToast}
            />
          )}
          {activePage === 'onboarding' && <StaffOnboarding onToast={showToast} />}
          {activePage === 'inventory' && <TeamInventory orders={trackOrders} complaints={complaints} searchQuery={searchQuery} onToast={showToast} />}
          {activePage === 'orders' && <TeamOrders orders={trackOrders} complaints={complaints} searchQuery={searchQuery} onToast={showToast} />}
          {activePage === 'order-calls' && <OrderFollowUp searchQuery={searchQuery} onToast={showToast} />}
          {activePage === 'call-reports' && <CallReportsView data={sync.data} canVerify searchQuery={searchQuery} onVerify={verifyReports} />}
          {activePage === 'enquiries' && (
            <EnquiriesView
              enquiries={enquiries}
              onEnquiriesChange={setEnquiries}
              leads={leads}
              activities={activities}
              orders={trackOrders}
              onAssignToCaller={handleAssignEnquiries}
              onImportEnquiries={handleImportEnquiries}
              onToast={showToast}
            />
          )}
          {activePage === 'reports' && (
            <TeamReports data={data} orders={trackOrders} complaints={complaints} enquiries={enquiries} headName={user.name} onToast={showToast} />
          )}
          {activePage === 'complaints' && (
            <TeamComplaints complaints={complaints} onComplaintsChange={setComplaints} createComplaint={complaintsSync.create} headName={user.name} searchQuery={searchQuery} onToast={showToast} />
          )}
        </main>
      </div>

      <NotificationsDrawer
        isOpen={isNotifsOpen}
        onClose={() => setIsNotifsOpen(false)}
        notifications={notifications}
        onClearAll={() => setAlertsCleared(true)}
        title="Team Alerts"
      />

      {/* Phones: the daily pages as bottom tabs; More opens the full page menu above. */}
      <BottomNav
        groups={navGroups}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'leads', label: 'Leads' },
          { key: 'followups', label: 'Follow-ups' },
          { key: 'complaints', label: 'Complaints' },
        ]}
        activePage={activePage}
        onSelectPage={page => handleNavigate(page)}
        onMore={() => setMenuOpen(true)}
      />
    </div>
  );
}
