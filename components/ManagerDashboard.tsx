'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar, { NavGroup } from './Sidebar';
import Topbar from './Topbar';
import Modal from './Modal';
import NotificationsDrawer from './NotificationsDrawer';
import { INITIAL_STOCK, StockRow, pointById, productById } from '../data/centralInventory';
import { BarChart3, ClipboardCheck, GitBranch, Headphones, LayoutDashboard, MapPin, PhoneCall, ShoppingCart, Sprout, Store, Users, Wallet, Warehouse } from 'lucide-react';

// Views
import DashboardView from './views/DashboardView';
import OrdersView from './views/OrdersView';
import CustomersView from './views/CustomersView';
import FarmerDetailsView from './views/FarmerDetailsView';
import ComingSoonView from './views/ComingSoonView';
import InventoryView from './views/InventoryView';
import MonetaryView from './views/MonetaryView';
import ReportsView from './views/ReportsView';
import TelecallingOverviewView from './views/TelecallingOverviewView';
import RegionalReportView from './views/RegionalReportView';
import TelecallingExecutivesView from './views/TelecallingExecutivesView';
import WorkflowBoard from './workflow/WorkflowBoard';
import CallReportsView from './workflow/CallReportsView';
import { reportStatusOf, workflowSummary } from '../lib/leadWorkflow';
import { TeamData, staffStats, teamAlerts } from './telecaller/tcData';

// Initial Data
import {
  INITIAL_CUSTOMERS,
  INITIAL_FRANCHISES,
  INITIAL_FPOS,
  INITIAL_TRANSACTIONS,
  Customer,
  Franchise,
  FPO,
  Transaction
} from '../data/initialData';
import {
  SALES_ORDERS,
  TRACKER_SALES,
  SalesOrder,
  OrderReport,
} from '../data/managerDashboard';
import type { TrackerState } from '../lib/trackerOps';
import { useSharedEnquiries, useTracker } from '../lib/useTracker';
import SyncBadge from './SyncBadge';
import type { SessionUser } from '../lib/session';

const ORDER_CITIES = ['Bhubaneswar', 'Cuttack', 'Berhampur', 'Sambalpur', 'Balasore', 'Koraput', 'Rayagada', 'Bolangir', 'Keonjhar', 'Angul'];

export default function ManagerDashboard({
  user,
  tracker,
  orders = SALES_ORDERS,
  customers: initialCustomers = INITIAL_CUSTOMERS,
  stock: initialStock = INITIAL_STOCK,
  transactions: initialTransactions = INITIAL_TRANSACTIONS,
  orderReport = null,
  backend = false,
}: {
  user: SessionUser;
  tracker: TrackerState;
  orders?: SalesOrder[];
  /** Seller-wise / telecaller-wise order roll-ups from the backend (null offline). */
  orderReport?: OrderReport | null;
  customers?: Customer[];
  stock?: StockRow[];
  transactions?: Transaction[];
  /** True when a live backend is configured: write actions go to it, else they mutate local sample data. */
  backend?: boolean;
}) {
  // Page Routing State
  const [activePage, setActivePage] = useState<string>('dashboard');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);


  // Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Set only when a global search is submitted, to seed the destination page's own search box
  const [searchSeed, setSearchSeed] = useState<{ page: string; query: string; token: number } | null>(null);

  // Data Stores
  // Website orders + telecaller sales, shared by the dashboard and the Orders page
  const salesOrders = orders;
  // With a live backend, re-fetch the server data every 15s so orders the seller confirms and calls the
  // telecallers log show up without a manual reload.
  const router = useRouter();
  useEffect(() => {
    if (!backend) return;
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [backend, router]);
  // Telecalling leads and website enquiries, shown on the dashboard
  // Leads, calls and follow-ups are shared with the telecalling head and the calling executives
  // (kept in sync with the server), so Team overview shows their latest work automatically.
  const sync = useTracker(tracker);
  const trackerLeads = sync.data.leads;
  // Telecalling section (view-only): same tracker data the telecalling head works from
  const [selectedExecutive, setSelectedExecutive] = useState<number | null>(null);
  const telecallingData: TeamData = useMemo(
    () => ({ leads: sync.data.leads, followups: sync.data.followups, activities: sync.data.activities, sales: TRACKER_SALES }),
    [sync.data],
  );
  const telecallingAlerts = useMemo(
    () => teamAlerts(staffStats(telecallingData, 'today', 'all')).filter(a => a.level === 'critical').length,
    [telecallingData],
  );
  // Pending assignments and reports the manager should look at (warnings and criticals).
  const workflowAttention = useMemo(() => workflowSummary(sync.data).alerts.filter(a => a.level !== 'info').length, [sync.data]);
  // Website enquiries are shared with the telecalling head's Enquiries page (kept in sync with the server)
  const [webEnquiries, setWebEnquiries] = useSharedEnquiries(sync, msg => showToast(`⚠️ ${msg}`));
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [franchises] = useState<Franchise[]>(INITIAL_FRANCHISES);
  const [fpos] = useState<FPO[]>(INITIAL_FPOS);
  const [stock, setStock] = useState<StockRow[]>(initialStock);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);

  // Manager Notifications
  const [notifications, setNotifications] = useState([
    { id: 'n1', title: 'Low Inventory Alert', message: 'Some products are below their reorder level at warehouses and franchise hubs. See Central inventory.', time: '10 mins ago', type: 'warning' as const },
    { id: 'n2', title: 'Order MK-2458 Pending', message: 'Manoj Mallick payment pending confirmation.', time: '45 mins ago', type: 'info' as const },
    { id: 'n3', title: 'Franchise Payout Approved', message: 'Cuttack Hub payout of ₹42,000 processed.', time: '2 hours ago', type: 'success' as const }
  ]);
  const [isNotifsOpen, setIsNotifsOpen] = useState(false);

  // Modals
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Form States

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerLocation, setNewCustomerLocation] = useState('Cuttack');
  const [newCustomerLand, setNewCustomerLand] = useState('');


  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Nav metadata
  const pageMeta: Record<string, { title: string; sub: string }> = {
    dashboard:       { title: "Manager Dashboard", sub: "Telecalling team, sales pipeline, website orders and enquiries at a glance." },
    orders:          { title: "Orders", sub: "Website and telecaller orders: status, payment and details. View only." },
    'tc-overview':   { title: "Telecalling · Team Overview", sub: "The whole telecalling team: calls, leads, follow-ups, sales and who needs a look." },
    'tc-workflow':   { title: "Telecalling · Lead Workflow", sub: "Leads imported, distributed and called, executive-wise progress, and which assignments or reports are pending." },
    'tc-reports':    { title: "Telecalling · Call Reports", sub: "The reports the executives submit after every call, and whether the telecalling head has verified them." },
    'tc-executives': { title: "Telecalling Executives", sub: "Every telecalling executive. Tap one to see their leads, calls, follow-ups and sales." },
    customers:       { title: "Farmer Network", sub: "Directory of farmers across Odisha with crop profiles and purchase history." },
    farmer:          { title: "Farmer Profile", sub: "Land holding, livestock breakdown, crops and past orders." },
    regional:        { title: "Regional Report", sub: "Orders by state, district and town: see what farmers bought in each area and download it." },
    franchise:       { title: "Franchise Hubs", sub: "Coming soon." },
    fpo:             { title: "FPO Collectives", sub: "Coming soon." },
    inventory:       { title: "Central Inventory", sub: "Stock of every product across Manikstu warehouses and franchise hubs." },
    monetary:        { title: "Monetary Section", sub: "Revenue ledgers, escrow holds, pending settlements and franchise payouts." },
    reports:         { title: "Reports & Analytics", sub: "Generate and export SLA, financial, telecalling and inventory reports." }
  };

  const currentMeta = pageMeta[activePage] || pageMeta.dashboard;

  // Select Customer Profile Trigger
  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomer(cust);
    setActivePage('farmer');
  };

  // Global search: jump to whichever page actually has a match, and seed its own search box
  const handleSearchSubmit = () => {
    const q = searchQuery.trim();
    if (!q) return;
    const ql = q.toLowerCase();
    const inCustomers = customers.some(c => [c.name, c.phone, c.location].some(v => v.toLowerCase().includes(ql)));
    const inOrders = salesOrders.some(o => [o.order_number, o.customer_name, o.phone, o.city].some(v => v.toLowerCase().includes(ql)));

    const target = inCustomers ? 'customers' : inOrders ? 'orders' : null;
    if (target) {
      setActivePage(target);
      setSearchSeed({ page: target, query: q, token: Date.now() });
      showToast(`Found "${q}" in ${pageMeta[target].title}`);
    } else {
      showToast(`No matches for "${q}" in customers or orders`);
    }
  };

  const handleReassignLead = async (leadId: number, callerId: number) => {
    try {
      const { message } = await sync.run({ type: 'assign', leadIds: [leadId], callerId });
      showToast(message);
    } catch (e) {
      showToast(`⚠️ ${(e as Error).message}`);
    }
  };

  // Add Farmer / Customer Profile (saved on the backend when configured, else local sample)
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return;
    if (!backend) {
      const id = `C-${String(customers.length + 1).padStart(3, '0')}`;
      const newCust: Customer = {
        id,
        name: newCustomerName.trim(),
        location: newCustomerLocation,
        ordersCount: 0,
        lifetimeValue: 0,
        lastOrder: '—',
        status: 'New',
        phone: newCustomerPhone.trim(),
        landHolding: newCustomerLand.trim() || '—',
        crops: [],
        livestock: { cows: 0, buffaloes: 0, goats: 0, sheep: 0, poultry: 0 },
      };
      setCustomers([newCust, ...customers]);
      setActiveModal(null);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerLand('');
      showToast(`Farmer profile for ${newCust.name} added`);
      return;
    }
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.replace(/\D/g, '').slice(-10),
          location: newCustomerLocation,
          landHolding: newCustomerLand.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`⚠️ ${data.error || 'Could not add the farmer'}`); return; }
      setCustomers([data.data as Customer, ...customers]);
      setActiveModal(null);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerLand('');
      showToast(`Farmer profile for ${data.data.name} added`);
    } catch {
      showToast('⚠️ Could not reach the server. Try again.');
    }
  };

  // Reorder Item (saved on the backend when configured, else local sample)
  const handleTriggerReorder = async (rowIds: string[]) => {
    const rows = stock.filter(r => rowIds.includes(r.id));
    if (rows.length === 0) return;
    if (!backend) {
      setStock(prev => prev.map(r => (rowIds.includes(r.id) ? { ...r, stock: r.reorderLevel * 2, restockedDaysAgo: 0 } : r)));
      const product = productById(rows[0].productId).name;
      showToast(rows.length === 1
        ? `Reorder placed: ${product} for ${pointById(rows[0].pointId).name}`
        : `Reorder placed: ${product} for ${rows.length} locations`);
      return;
    }
    try {
      const res = await fetch('/api/inventory/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: rowIds.map(Number) }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`⚠️ ${data.error || 'Could not place the reorder'}`); return; }
      const updated = new Map((data.data as StockRow[]).map(r => [r.id, r]));
      setStock(prev => prev.map(r => updated.get(r.id) ?? r));
      const product = productById(rows[0].productId).name;
      showToast(rows.length === 1
        ? `Reorder placed: ${product} for ${pointById(rows[0].pointId).name}`
        : `Reorder placed: ${product} for ${rows.length} locations`);
    } catch {
      showToast('⚠️ Could not reach the server. Try again.');
    }
  };

  // Approve Transaction (saved on the backend when configured, else local sample)
  const handleApproveTransaction = async (txId: string) => {
    if (!backend) {
      setTransactions(prev => prev.map(t => (t.id === txId ? { ...t, status: 'Settled' } : t)));
      showToast(`Transaction ${txId} approved & settled`);
      return;
    }
    try {
      const res = await fetch(`/api/finance/transactions/${txId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showToast(`⚠️ ${data.error || 'Could not approve the transaction'}`); return; }
      setTransactions(prev => prev.map(t => (t.id === txId ? (data.data as Transaction) : t)));
      showToast(`Transaction ${txId} approved & settled`);
    } catch {
      showToast('⚠️ Could not reach the server. Try again.');
    }
  };

  const navGroups: NavGroup[] = [
    { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
    {
      label: 'Operations',
      items: [
        { key: 'orders', label: 'Orders', icon: ShoppingCart, count: salesOrders.filter(o => o.status === 'pending').length },
        { key: 'customers', label: 'Customers', icon: Users },
        { key: 'regional', label: 'Regional report', icon: MapPin },
      ],
    },
    {
      label: 'Telecalling',
      items: [
        { key: 'tc-overview', label: 'Team overview', icon: Headphones, count: telecallingAlerts },
        { key: 'tc-executives', label: 'Telecalling executives', icon: PhoneCall },
        { key: 'tc-workflow', label: 'Lead workflow', icon: GitBranch, count: workflowAttention },
        { key: 'tc-reports', label: 'Call reports', icon: ClipboardCheck, count: sync.data.activities.filter(a => reportStatusOf(a) === 'submitted').length },
      ],
    },
    {
      label: 'Network & Partners',
      items: [
        { key: 'franchise', label: 'Franchise Hubs', icon: Store, soon: true },
        { key: 'fpo', label: 'FPO Collectives', icon: Sprout, soon: true },
      ],
    },
    {
      label: 'Inventory & Finance',
      items: [
        { key: 'inventory', label: 'Central inventory', icon: Warehouse },
        { key: 'monetary', label: 'Monetary section', icon: Wallet },
      ],
    },
    { label: 'Insights & Approvals', items: [{ key: 'reports', label: 'Reports & Analytics', icon: BarChart3 }] },
  ];

  return (
    <div className="card-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'var(--forest)',
          color: '#FFF',
          padding: '12px 20px',
          borderRadius: 8,
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          zIndex: 2000,
          fontWeight: 600,
          fontSize: 13.5
        }}>
          ✅ {toastMessage}
        </div>
      )}

      {/* Main Shell */}
      <div className="shell">
        <Sidebar
          groups={navGroups}
          activePage={activePage}
          onSelectPage={page => { setActivePage(page); if (page === 'tc-executives') setSelectedExecutive(null); }}
        />

        <main className="main">
          <Topbar
            title={currentMeta.title}
            subtitle={currentMeta.sub}
            search={{ query: searchQuery, onChange: setSearchQuery, onSubmit: handleSearchSubmit, placeholder: 'Search orders, farmers… (Enter to jump)' }}
            notifications={{ count: notifications.length, onToggle: () => setIsNotifsOpen(!isNotifsOpen), title: 'Manager notifications' }}
            status={<SyncBadge syncedAt={sync.syncedAt} offline={sync.offline} />}
            profile={{ name: 'Manager Portal', role: 'Manikstu Samarth', detail: `${user.name} · Staff ID ${user.staffId}` }}
          />

          {/* PAGE ROUTING */}
          {activePage === 'dashboard' && (
            <DashboardView
              orders={salesOrders}
              leads={trackerLeads}
              followups={sync.data.followups}
              activities={sync.data.activities}
              onReassignLead={handleReassignLead}
              enquiries={webEnquiries}
              onEnquiriesChange={setWebEnquiries}
              onNavigate={setActivePage}
              onToast={showToast}
            />
          )}

          {activePage === 'orders' && (
            <OrdersView
              key={searchSeed?.page === 'orders' ? searchSeed.token : 'orders'}
              orders={salesOrders}
              report={orderReport}
              onToast={showToast}
              initialQuery={searchSeed?.page === 'orders' ? searchSeed.query : undefined}
            />
          )}

          {activePage === 'tc-workflow' && <WorkflowBoard data={sync.data} audience="manager" />}
          {activePage === 'tc-reports' && <CallReportsView data={sync.data} canVerify={false} />}

          {activePage === 'regional' && (
            <RegionalReportView
              orders={salesOrders}
              onToast={showToast}
            />
          )}

          {activePage === 'tc-overview' && (
            <TelecallingOverviewView
              data={telecallingData}
              onOpenExecutive={id => { setSelectedExecutive(id); setActivePage('tc-executives'); window.scrollTo(0, 0); }}
              onToast={showToast}
            />
          )}

          {activePage === 'tc-executives' && (
            <TelecallingExecutivesView
              data={telecallingData}
              selectedId={selectedExecutive}
              onSelect={id => { setSelectedExecutive(id); window.scrollTo(0, 0); }}
              searchQuery=""
              onToast={showToast}
            />
          )}

          {activePage === 'customers' && (
            <CustomersView
              key={searchSeed?.page === 'customers' ? searchSeed.token : 'customers'}
              customers={customers}
              onSelectCustomer={handleSelectCustomer}
              onOpenAddCustomerModal={() => setActiveModal('addCustomer')}
              initialQuery={searchSeed?.page === 'customers' ? searchSeed.query : undefined}
            />
          )}

          {activePage === 'farmer' && (
            <FarmerDetailsView
              customer={selectedCustomer}
              orders={salesOrders}
              onBack={() => setActivePage('customers')}
            />
          )}


          {activePage === 'franchise' && (
            <ComingSoonView
              icon={Store}
              title="Franchise Hubs"
              description="Track every Manikstu Agri Hub franchise in one place. This section is being built and will open soon."
              planned={['Hub list with partner, district and status', 'Monthly orders and revenue per hub', 'Payouts and settlements for each partner', 'Adding and onboarding new hubs']}
            />
          )}

          {activePage === 'fpo' && (
            <ComingSoonView
              icon={Sprout}
              title="FPO Collectives"
              description="Work with Farmer Producer Organisations partnered with Manikstu. This section is being built and will open soon."
              planned={['Partner FPOs with district and status', 'Member farmers and main crops', 'Orders and sales through each FPO', 'Partnering new FPOs']}
            />
          )}

          {activePage === 'inventory' && (
            <InventoryView
              stock={stock}
              onTriggerReorder={handleTriggerReorder}
            />
          )}

          {activePage === 'monetary' && (
            <MonetaryView
              transactions={transactions}
              onApproveTransaction={handleApproveTransaction}
            />
          )}

          {activePage === 'reports' && (
            <ReportsView
              salesOrders={salesOrders}
              trackerLeads={trackerLeads}
              followups={sync.data.followups}
              activities={sync.data.activities}
              franchises={franchises}
              fpos={fpos}
              stock={stock}
              transactions={transactions}
              onToast={showToast}
            />
          )}

          {/* Footer + village frieze sit in the content column, so the sidebar stays pinned to the end */}
          <footer className="site-footer">
            <div>© 2026 Manikstu Agri Network · Territory Operations Manager</div>
          </footer>
        </main>
      </div>

      {/* Manager Notifications Drawer */}
      <NotificationsDrawer
        isOpen={isNotifsOpen}
        onClose={() => setIsNotifsOpen(false)}
        notifications={notifications}
        onClearAll={() => setNotifications([])}
      />

      {/* MODALS */}
      {/* Add Farmer Profile Modal */}
      <Modal
        isOpen={activeModal === 'addCustomer'}
        onClose={() => setActiveModal(null)}
        title="Add Farmer Profile"
      >
        <form onSubmit={handleAddCustomer}>
          <div className="form-group">
            <label>Farmer Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Ramesh Nayak"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                required
                placeholder="10-digit mobile"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Location / District</label>
              <select value={newCustomerLocation} onChange={(e) => setNewCustomerLocation(e.target.value)}>
                {ORDER_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Land Holding (optional)</label>
            <input
              type="text"
              placeholder="e.g. 3.5 acres"
              value={newCustomerLand}
              onChange={(e) => setNewCustomerLand(e.target.value)}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Add Farmer</button>
          </div>
        </form>
      </Modal>



    </div>
  );
}
