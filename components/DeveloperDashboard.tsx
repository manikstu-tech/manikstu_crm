'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar, { NavGroup } from './Sidebar';
import Topbar from './Topbar';
import Modal from './Modal';
import FooterFrieze from './FooterFrieze';
import type { SessionUser } from '../lib/session';
import {
  ArrowUpRight,
  Database,
  Headphones,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  Pencil,
  PhoneCall,
  RefreshCw,
  Server,
  ShieldCheck,
  Store,
  Trash2,
  Users,
} from 'lucide-react';

/** Every role portal the super admin can open. */
interface Portal {
  role: string;
  href: string;
  name: string;
  tagline: string;
  manages: string;
  login: string;
  icon: LucideIcon;
}

/** A staff account as returned by /api/admin/users. */
interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  staffId: string;
  mobile: string | null;
  region: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

const PORTALS: Portal[] = [
  {
    role: 'manager',
    href: '/manager',
    name: 'Manager',
    tagline: 'Territory operations',
    manages: 'Sales pipeline, website orders & enquiries, farmer network, inventory, finance and the whole telecalling team.',
    login: 'manager@manikstu.com',
    icon: Users,
  },
  {
    role: 'telecaller',
    href: '/telecaller',
    name: 'Telecalling Head',
    tagline: 'Lead & call desk',
    manages: 'The telecalling team: lead workflow, call reports, follow-ups, enquiries and onboarding calling executives.',
    login: 'telecalling@manikstu.com',
    icon: Headphones,
  },
  {
    role: 'calling-executive',
    href: '/calling-executive',
    name: 'Calling Executive',
    tagline: 'Front-line agent',
    manages: 'Assigned leads, logging calls, raising follow-ups, recording sales and handling complaints.',
    login: 'bikash@manikstu.in',
    icon: PhoneCall,
  },
  {
    role: 'seller',
    href: '/seller',
    name: 'Seller',
    tagline: 'Catalogue & orders',
    manages: 'Product catalogue, stock, adding products, price/visibility sync to the website and incoming website orders.',
    login: 'sanjay@manikstu.in',
    icon: Store,
  },
];

const ROLE_LABEL: Record<string, string> = {
  developer: 'Developer', manager: 'Manager', telecaller: 'Telecalling Head',
  'calling-executive': 'Calling Executive', seller: 'Seller',
};

export default function DeveloperDashboard({ user, backend = false }: { user: SessionUser; backend?: boolean }) {
  const router = useRouter();
  const [activePage, setActivePage] = useState<string>('overview');

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  // Accounts
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwMustChange, setPwMustChange] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  // Edit (email / active)
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editBusy, setEditBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) { setUsersError(data.error || 'Could not load accounts.'); setUsers([]); }
      else setUsers(data.data as AdminUser[]);
    } catch {
      setUsersError('Could not reach the server.'); setUsers([]);
    }
    setLoadingUsers(false);
  };

  useEffect(() => {
    if (activePage === 'accounts' && users === null) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwUser) return;
    setPwBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${pwUser.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwValue, mustChange: pwMustChange }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`⚠️ ${data.error || 'Could not set the password'}`); setPwBusy(false); return; }
      showToast(`Password updated for ${pwUser.name}`);
      setPwUser(null); setPwValue(''); setPwMustChange(false);
      loadUsers();
    } catch {
      showToast('⚠️ Could not reach the server.');
    }
    setPwBusy(false);
  };

  const openEdit = (u: AdminUser) => { setEditUser(u); setEditEmail(u.email ?? ''); setEditActive(u.isActive); };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editEmail.trim() || null, isActive: editActive }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`⚠️ ${data.error || 'Could not update the account'}`); setEditBusy(false); return; }
      showToast(`Updated ${editUser.name}`);
      setEditUser(null);
      loadUsers();
    } catch {
      showToast('⚠️ Could not reach the server.');
    }
    setEditBusy(false);
  };

  const handleDelete = async (u: AdminUser) => {
    if (!window.confirm(`Delete the account for ${u.name} (${u.staffId})? This cannot be undone.`)) return;
    setDeletingId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(`⚠️ ${data.error || 'Could not delete the account'}`); setDeletingId(null); return; }
      showToast(`Deleted ${u.name}`);
      loadUsers();
    } catch {
      showToast('⚠️ Could not reach the server.');
    }
    setDeletingId(null);
  };

  const meta: Record<string, { title: string; sub: string }> = {
    overview: { title: 'Developer · Super Admin', sub: 'One control centre for the whole Manikstu Samarth CRM. Open any portal, manage accounts and check the system.' },
    portals: { title: 'Role Portals', sub: 'Open any role’s dashboard directly. As the super admin you are allowed into every section.' },
    accounts: { title: 'Accounts & Passwords', sub: 'Every staff login. Set or reset the password for any role from here.' },
    roles: { title: 'Roles & Access', sub: 'Every role in the CRM, who holds it and what it can do.' },
    system: { title: 'System Status', sub: 'Backend connection, production endpoints and the deploy helpers.' },
  };
  const current = meta[activePage] ?? meta.overview;

  const navGroups: NavGroup[] = [
    { label: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: LayoutDashboard }] },
    { label: 'Manage', items: [{ key: 'portals', label: 'Role portals', icon: LayoutGrid }, { key: 'accounts', label: 'Accounts & passwords', icon: KeyRound }] },
    {
      label: 'Administration',
      items: [
        { key: 'roles', label: 'Roles & access', icon: ShieldCheck },
        { key: 'system', label: 'System status', icon: Server },
      ],
    },
  ];

  const open = (href: string) => router.push(href);

  return (
    <div className="card-layout">
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--forest)', color: '#FFF', padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.25)', zIndex: 2000, fontWeight: 600, fontSize: 13.5 }}>
          {toast.startsWith('⚠️') ? toast : `✅ ${toast}`}
        </div>
      )}

      <div className="shell">
        <Sidebar groups={navGroups} activePage={activePage} onSelectPage={setActivePage} />

        <main className="main">
          <Topbar
            title={current.title}
            subtitle={current.sub}
            profile={{ name: 'Super Admin', role: 'Developer · Manikstu Samarth', initials: user.initials, detail: `${user.name} · Staff ID ${user.staffId}` }}
          />

          {activePage === 'overview' && (
            <>
              <div style={gridTiles}>
                <StatTile label="Role portals" value="4" hint="Manager · Head · Executive · Seller" icon={LayoutGrid} />
                <StatTile label="Staff accounts" value={users ? String(users.length) : '—'} hint="Manage logins & passwords" icon={KeyRound} />
                <StatTile label="Backend" value={backend ? 'Connected' : 'Offline demo'} hint={backend ? 'Live Laravel API' : 'Local sample data'} icon={Database} tone={backend ? 'ok' : 'warn'} />
                <StatTile label="Access" value="Full" hint="Bypasses every role gate" icon={ShieldCheck} tone="ok" />
              </div>

              <SectionCard title="Launch a portal" desc="Jump straight into any role’s dashboard.">
                <div style={gridPortals}>
                  {PORTALS.map(p => <PortalCard key={p.role} portal={p} onOpen={() => open(p.href)} />)}
                </div>
              </SectionCard>
            </>
          )}

          {activePage === 'portals' && (
            <SectionCard title="All role portals" desc="Each portal is the live dashboard for that role. Opening one signs you in there as the super admin.">
              <div style={gridPortals}>
                {PORTALS.map(p => <PortalCard key={p.role} portal={p} wide onOpen={() => open(p.href)} />)}
              </div>
            </SectionCard>
          )}

          {activePage === 'accounts' && (
            <SectionCard
              title="Staff accounts"
              desc="Set a new password for any login. The person can sign in with it immediately, or tick “require change” to make them set their own on first login."
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button type="button" className="btn-secondary" onClick={loadUsers} disabled={loadingUsers} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={15} /> {loadingUsers ? 'Loading…' : 'Refresh'}
                </button>
              </div>

              {usersError && <div className="inline-alert" role="alert" style={{ marginBottom: 12 }}>{usersError}</div>}

              <div className="table-wrap">
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <Th>Name</Th><Th>Role</Th><Th>Login</Th><Th>Staff ID</Th><Th>Status</Th><Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {users && users.length > 0 && users.map(u => (
                      <tr key={u.id} style={{ borderTop: '1px solid var(--line)' }}>
                        <Td><strong>{u.name}</strong></Td>
                        <Td><span style={roleChip(u.role === 'developer')}>{ROLE_LABEL[u.role] ?? u.role}</span></Td>
                        <Td style={{ color: 'var(--ink-soft)' }}>{u.email || u.mobile || '—'}</Td>
                        <Td><code style={codeStyle}>{u.staffId}</code></Td>
                        <Td>
                          {u.isActive
                            ? <span style={{ color: 'var(--forest)', fontWeight: 600 }}>Active</span>
                            : <span style={{ color: 'var(--ink-soft)' }}>Inactive</span>}
                          {u.mustChangePassword && <div style={{ fontSize: 11.5, color: 'var(--gold)' }}>must change pw</div>}
                        </Td>
                        <Td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button type="button" className="btn-primary" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => { setPwUser(u); setPwValue(''); setPwMustChange(false); }}>
                              Set password
                            </button>
                            <button type="button" className="icon-btn" title="Edit email / status" aria-label="Edit account" onClick={() => openEdit(u)}>
                              <Pencil size={15} />
                            </button>
                            {u.role !== 'developer' && u.id !== user.id && (
                              <button type="button" className="icon-btn" title="Delete account" aria-label="Delete account" disabled={deletingId === u.id} onClick={() => handleDelete(u)} style={{ color: '#B42318' }}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    ))}
                    {users && users.length === 0 && !usersError && (
                      <tr><Td style={{ color: 'var(--ink-soft)' }}>No accounts found.</Td></tr>
                    )}
                    {users === null && !usersError && (
                      <tr><Td style={{ color: 'var(--ink-soft)' }}>Loading accounts…</Td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {activePage === 'roles' && (
            <SectionCard title="Roles & access" desc="What each role can see and do, and its seeded login.">
              <div className="table-wrap">
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><Th>Role</Th><Th>Who</Th><Th>Can do</Th><Th>Login (email)</Th></tr>
                  </thead>
                  <tbody>
                    {ROLES.map(r => (
                      <tr key={r.code} style={{ borderTop: '1px solid var(--line)' }}>
                        <Td><span style={roleChip(r.code === 'developer')}>{r.code}</span></Td>
                        <Td>{r.who}</Td>
                        <Td style={{ color: 'var(--ink-soft)' }}>{r.can}</Td>
                        <Td><code style={codeStyle}>{r.login}</code></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 14 }}>
                The <strong>developer</strong> role is the only one that bypasses every role gate — on the backend it passes
                every <code style={codeStyle}>role:</code> middleware check automatically.
              </p>
            </SectionCard>
          )}

          {activePage === 'system' && (
            <>
              <div style={gridTiles}>
                <StatTile label="Backend mode" value={backend ? 'Live' : 'Offline'} hint={backend ? 'CRM_API_BASE is set' : 'CRM_API_BASE is empty'} icon={Database} tone={backend ? 'ok' : 'warn'} />
                <StatTile label="Session" value="8h shift" hint="Signed HMAC cookie" icon={KeyRound} />
                <StatTile label="Role" value="developer" hint={user.name} icon={ShieldCheck} tone="ok" />
              </div>

              <SectionCard title="Production endpoints" desc="Where the CRM lives in production.">
                <ul style={listStyle}>
                  <li><strong>CRM portal:</strong> <code style={codeStyle}>https://samarth.manikstu.com</code></li>
                  <li><strong>CRM API:</strong> <code style={codeStyle}>https://samarth-api.manikstu.com</code></li>
                  <li><strong>Website:</strong> <code style={codeStyle}>manikstu.com</code> · <strong>Website API:</strong> <code style={codeStyle}>api.manikstu.com</code></li>
                </ul>
              </SectionCard>
            </>
          )}

          <footer className="site-footer">
            <div>© 2026 Manikstu Agri Network · Super Admin Console</div>
          </footer>
          <FooterFrieze />
        </main>
      </div>

      {/* Set-password modal */}
      <Modal isOpen={pwUser !== null} onClose={() => setPwUser(null)} title={pwUser ? `Set password · ${pwUser.name}` : 'Set password'}>
        {pwUser && (
          <form onSubmit={submitPassword}>
            <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
              {ROLE_LABEL[pwUser.role] ?? pwUser.role} · <code style={codeStyle}>{pwUser.email || pwUser.mobile || pwUser.staffId}</code>
            </p>
            <div className="form-group">
              <label>New password</label>
              <input
                type="text"
                required
                autoFocus
                placeholder="At least 8 chars, a letter and a number"
                value={pwValue}
                onChange={e => setPwValue(e.target.value)}
              />
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>Shown as text so you can copy it to share with the person.</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, margin: '6px 0 4px', cursor: 'pointer' }}>
              <input type="checkbox" checked={pwMustChange} onChange={e => setPwMustChange(e.target.checked)} />
              Require the user to change it on first login
            </label>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setPwUser(null)} disabled={pwBusy}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={pwBusy || pwValue.length < 8}>{pwBusy ? 'Saving…' : 'Set password'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit account (email / active) modal */}
      <Modal isOpen={editUser !== null} onClose={() => setEditUser(null)} title={editUser ? `Edit account · ${editUser.name}` : 'Edit account'}>
        {editUser && (
          <form onSubmit={submitEdit}>
            <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
              {ROLE_LABEL[editUser.role] ?? editUser.role} · <code style={codeStyle}>{editUser.staffId}</code>
            </p>
            <div className="form-group">
              <label>Login email</label>
              <input
                type="email"
                autoFocus
                placeholder="name@manikstu.com (leave empty to clear)"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
              />
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>This is the address the person signs in with. They can also use their Staff ID or mobile.</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, margin: '6px 0 4px', cursor: 'pointer' }}>
              <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)} />
              Account active (can sign in)
            </label>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditUser(null)} disabled={editBusy}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={editBusy}>{editBusy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/** All roles in the CRM, for the access reference. */
const ROLES: Array<{ code: string; who: string; can: string; login: string }> = [
  { code: 'developer', who: 'Platform developer (you)', can: 'Super admin — opens every dashboard and every API endpoint; bypasses all role gates.', login: 'developer@manikstu.com' },
  { code: 'manager', who: 'Smurti Nayak · MNK-MGR-042', can: 'Full operations view, telecalling oversight, inventory, finance and reports.', login: 'manager@manikstu.com' },
  { code: 'telecaller', who: 'Pradeep Mohanty · MK-TL-101', can: 'Telecalling head: runs the team and onboards calling executives.', login: 'telecalling@manikstu.com' },
  { code: 'calling-executive', who: 'Agents (e.g. MK-CE-212)', can: 'Works only their own assigned leads, calls, follow-ups and complaints.', login: 'bikash@manikstu.in' },
  { code: 'seller', who: 'Sanjay Rath · MK-SL-301', can: 'Manages the catalogue, stock and website orders. No telecalling access.', login: 'sanjay@manikstu.in' },
];

/* ---------- presentational pieces (theme-coloured inline styles) ---------- */

function StatTile({ label, value, hint, icon: Icon, tone = 'default' }: {
  label: string; value: string; hint: string; icon: LucideIcon; tone?: 'default' | 'ok' | 'warn';
}) {
  const accent = tone === 'ok' ? 'var(--forest)' : tone === 'warn' ? 'var(--gold)' : 'var(--ink)';
  return (
    <div style={tileStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--ink-soft)', fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent, marginTop: 8 }}>{value}</div>
      <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginTop: 2 }}>{hint}</div>
    </div>
  );
}

function PortalCard({ portal, onOpen, wide = false }: { portal: Portal; onOpen: () => void; wide?: boolean }) {
  const Icon = portal.icon;
  return (
    <button type="button" onClick={onOpen} style={portalCardStyle} className="dev-portal-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={portalIconWrap}><Icon size={20} style={{ color: 'var(--forest)' }} /></span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 15.5 }}>{portal.name}</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>{portal.tagline}</div>
        </div>
        <ArrowUpRight size={18} style={{ color: 'var(--gold)', marginLeft: 'auto' }} />
      </div>
      {wide && <div style={{ color: 'var(--ink-soft)', fontSize: 13, textAlign: 'left', marginTop: 10, lineHeight: 1.5 }}>{portal.manages}</div>}
      <div style={{ textAlign: 'left', marginTop: wide ? 10 : 8, fontSize: 12 }}>
        <span style={{ color: 'var(--ink-soft)' }}>Login: </span>
        <code style={codeStyle}>{portal.login}</code>
      </div>
    </button>
  );
}

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16.5, color: 'var(--ink)' }}>{title}</h2>
        {desc && <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', fontSize: 13 }}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)' }}>{children}</th>
);
const Td = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <td style={{ padding: '10px', fontSize: 13.5, verticalAlign: 'top', ...style }}>{children}</td>
);

/* styles */
const gridTiles: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 };
const gridPortals: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 };
const tileStyle: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' };
const sectionStyle: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px 22px', marginBottom: 18 };
const portalCardStyle: React.CSSProperties = { display: 'block', width: '100%', background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s' };
const portalIconWrap: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, background: 'var(--gold-light)' };
const codeStyle: React.CSSProperties = { background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px', fontSize: 12.5, color: 'var(--ink)' };
const listStyle: React.CSSProperties = { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.5 };
const roleChip = (hi: boolean): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700,
  background: hi ? 'var(--forest)' : 'var(--gold-light)', color: hi ? 'var(--cream)' : 'var(--ink)',
});
