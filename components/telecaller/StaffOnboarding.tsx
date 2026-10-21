import React, { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, MessageCircle, RefreshCw, Trash2, UserPlus, X } from 'lucide-react';
import { TELECALLERS, VERTICALS } from '../../data/managerDashboard';
import type { PublicStaffAccount } from '../../lib/staffAccounts';
import Modal from '../Modal';

type Stage = 'deactivated' | 'share-details' | 'training' | 'ready';
const STAGE_LABEL: Record<Stage, string> = {
  deactivated: 'Deactivated',
  'share-details': 'Share login details',
  training: 'In training',
  ready: 'Ready',
};
const STAGE_CHIP: Record<Stage, string> = { deactivated: 'muted', 'share-details': 'pending', training: 'transit', ready: 'delivered' };

const stageOf = (a: PublicStaffAccount): Stage =>
  !a.isActive ? 'deactivated' : !a.detailsShared ? 'share-details' : !a.trainingDone ? 'training' : 'ready';

const WORDS = ['Goat', 'Lake', 'Farm', 'Leaf', 'Hill', 'Rain', 'Seed', 'Milk', 'Mint', 'Sun', 'Tree', 'River'];
/** Easy-to-read temporary password like "Goat-4827-Lake", from the browser's secure random source. */
function generatePassword(): string {
  const n = crypto.getRandomValues(new Uint32Array(3));
  return `${WORDS[n[0] % WORDS.length]}-${1000 + (n[1] % 9000)}-${WORDS[n[2] % WORDS.length]}`;
}
const passwordProblem = (p: string) =>
  p.length < 8 ? 'Password: at least 8 characters.' : !/[a-z]/i.test(p) || !/\d/.test(p) ? 'Password needs a letter and a number.' : null;

const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const verticalNames = (ids: number[]) => ids.map(id => VERTICALS.find(v => v.id === id)?.name.replace('Goat ', '') ?? '').join(', ');

/** Login details, shown once after adding staff or resetting a password. */
function CredentialsCard({ account, password, onShared, onToast }: {
  account: PublicStaffAccount;
  password: string;
  onShared: () => void;
  onToast: (m: string) => void;
}) {
  const first = account.name.split(' ')[0];
  const message = `Hello ${first}, your Manikstu telecalling staff account is ready.\n${account.email ? `Sign-in email: ${account.email}\n` : ''}Staff ID: ${account.staffId}\nTemporary password: ${password}\nYou'll be asked to set your own password the first time you sign in.`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      onToast('Login details copied');
      onShared();
    } catch {
      onToast('Couldn’t copy. Select the details and copy them by hand.');
    }
  };
  return (
    <div className="cred-card">
      <div className="cred-warning">These details are shown <strong>only once</strong>. Share them with {first} now.</div>
      <div className="cred-grid">
        <div><div className="od-label">Name</div><div className="cred-value small">{account.name}</div></div>
        {account.email && <div><div className="od-label">Sign-in email</div><div className="cred-value small">{account.email}</div></div>}
        <div><div className="od-label">Staff ID</div><div className="cred-value">{account.staffId}</div></div>
        <div><div className="od-label">Temporary password</div><div className="cred-value">{password}</div></div>
      </div>
      <div className="cred-actions">
        <button type="button" className="btn-secondary" onClick={copy}><Copy size={14} /> Copy details</button>
        <a className="btn-secondary whatsapp-btn" href={`https://wa.me/91${account.mobile}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" onClick={onShared}>
          <MessageCircle size={14} /> Share on WhatsApp
        </a>
      </div>
      <div className="loc">The password is saved hashed and can&apos;t be viewed again, only reset. {first} must set their own password at first sign-in.</div>
    </div>
  );
}

export default function StaffOnboarding({ onToast }: { onToast: (message: string) => void }) {
  const [accounts, setAccounts] = useState<PublicStaffAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add staff
  const emptyForm = { name: '', mobile: '', email: '', region: '', otherRegion: '', verticalIds: [1] as number[], dailyTarget: '40', password: '' };
  const [addOpen, setAddOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [form, setForm] = useState(emptyForm);
  const [showPw, setShowPw] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ account: PublicStaffAccount; password: string } | null>(null);

  // Reset password
  const [resetFor, setResetFor] = useState<PublicStaffAccount | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/staff', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load staff');
      setAccounts(data.data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load staff');
    }
  };
  useEffect(() => { load(); }, []);

  const regions = Array.from(new Set([...TELECALLERS.map(t => t.region), ...(accounts ?? []).map(a => a.region)]));
  const region = form.region === '__other' ? form.otherRegion.trim() : form.region;

  const openAdd = () => {
    setForm({ ...emptyForm, password: generatePassword() });
    setStep('form');
    setFormError(null);
    setCreated(null);
    setShowPw(true);
    setAddOpen(true);
  };

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    const mobile = form.mobile.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    const problem =
      form.name.trim().length < 3 ? 'Enter the full name.'
      : !/^[6-9]\d{9}$/.test(mobile) ? 'Enter a valid 10-digit mobile number.'
      : !form.email.trim() ? 'Enter the email address — it is used to sign in.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? 'Enter a valid email address.'
      : !region ? 'Choose a region.'
      : !(Number(form.dailyTarget) >= 5 && Number(form.dailyTarget) <= 200) ? 'Daily call target should be between 5 and 200.'
      : passwordProblem(form.password);
    if (problem) { setFormError(problem); return; }
    setForm(f => ({ ...f, mobile }));
    setFormError(null);
    setStep('review');
  };

  const confirmCreate = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, mobile: form.mobile, email: form.email, region,
          verticalIds: form.verticalIds, dailyTarget: Number(form.dailyTarget), password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Could not add the staff member'); setStep('form'); return; }
      setCreated({ account: data.data, password: form.password });
      setStep('done');
      onToast(`${data.data.name} added · Staff ID ${data.data.staffId}`);
      load();
    } catch {
      setFormError('Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (a: PublicStaffAccount, body: { isActive?: boolean; detailsShared?: boolean; trainingDone?: boolean }, message?: string) => {
    try {
      const res = await fetch(`/api/staff/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { onToast(data.error || 'Could not update'); return; }
      if (message) onToast(message);
      load();
    } catch {
      onToast('Could not reach the server. Try again.');
    }
  };

  const deactivate = (a: PublicStaffAccount) => {
    if (window.confirm(`Deactivate ${a.name} (${a.staffId})? Their Staff ID won't work until you activate it again.`)) {
      patch(a, { isActive: false }, `${a.name} deactivated`);
    }
  };

  const remove = async (a: PublicStaffAccount) => {
    if (!window.confirm(`Delete ${a.name} (${a.staffId})? This permanently removes the account and their leads, calls and sales. This can't be undone — to keep their records, use Deactivate instead.`)) return;
    try {
      const res = await fetch(`/api/staff/${a.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { onToast(data.error || 'Could not delete the staff member'); return; }
      onToast(`${a.name} deleted`);
      load();
    } catch {
      onToast('Could not reach the server. Try again.');
    }
  };

  const submitReset = async () => {
    if (!resetFor) return;
    const problem = passwordProblem(resetPw);
    if (problem) { onToast(problem); return; }
    try {
      const res = await fetch(`/api/staff/${resetFor.id}/password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: resetPw }) });
      const data = await res.json();
      if (!res.ok) { onToast(data.error || 'Could not reset the password'); return; }
      setResetFor(data.data);
      setResetDone(true);
      onToast(`New temporary password set for ${resetFor.name}`);
      load();
    } catch {
      onToast('Could not reach the server. Try again.');
    }
  };

  const list = accounts ?? [];
  const count = (s: Stage) => list.filter(a => stageOf(a) === s).length;

  return (
    <>
      <div className="scoreboard">
        <div className="score"><div className="num">{list.length}</div><div className="label">Staff added</div></div>
        <div className="score"><div className="num">{count('share-details')}</div><div className="label">Login details to share</div></div>
        <div className="score"><div className="num">{count('training')}</div><div className="label">In training</div></div>
        <div className="score"><div className="num">{count('ready')}</div><div className="label">Ready</div></div>
        <div className="score"><div className="num">{count('deactivated')}</div><div className="label">Deactivated</div></div>
      </div>

      <div className="page-toolbar">
        <div className="loc" style={{ maxWidth: '62ch' }}>
          Add each new telecaller here to give them a <strong>Staff ID</strong> and a <strong>temporary password</strong>.
          They&apos;ll set their own password the first time they sign in.
        </div>
        <div className="toolbar-actions">
          <button className="btn-secondary" onClick={load} title="Refresh" aria-label="Refresh"><RefreshCw size={14} /></button>
          <button className="btn-primary" onClick={openAdd}><UserPlus size={15} /> Add staff</button>
        </div>
      </div>

      <div className="panel">
        {loadError && <div className="inline-alert">{loadError}</div>}
        {accounts === null && !loadError && <div className="loc">Loading staff…</div>}
        {accounts && accounts.length === 0 && (
          <div className="empty-onboarding">
            <UserPlus size={30} />
            <div className="drop-title">No staff added yet</div>
            <div className="loc">Add your first telecaller to create their Staff ID and password.</div>
            <button className="btn-primary" onClick={openAdd} style={{ marginTop: 10 }}>Add staff</button>
          </div>
        )}
        {accounts && accounts.length > 0 && (
          <div className="table-wrap">
            <table className="orders-table staff-table">
              <thead>
                <tr><th>Staff</th><th>Region · products</th><th>Status</th><th>Onboarding</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {accounts.map(a => {
                  const stage = stageOf(a);
                  const steps = [
                    { label: 'Staff ID & password created', done: true },
                    { label: 'Login details shared', done: a.detailsShared, toggle: () => patch(a, { detailsShared: !a.detailsShared }) },
                    { label: 'Training done', done: a.trainingDone, toggle: () => patch(a, { trainingDone: !a.trainingDone }) },
                  ];
                  return (
                    <tr key={a.id} className={stage === 'deactivated' ? 'row-skipped' : undefined}>
                      <td className="cust">
                        {a.name}
                        <div className="loc"><strong>{a.staffId}</strong> · {a.mobile}{a.email ? ` · ${a.email}` : ''}</div>
                        <div className="loc">Added {fmtDate(a.createdAt)} by {a.createdBy}{a.passwordResetAt ? ` · password reset ${fmtDate(a.passwordResetAt)}` : ''}</div>
                      </td>
                      <td>{a.region}<div className="loc">{verticalNames(a.verticalIds)} · {a.dailyTarget} calls/day</div></td>
                      <td>
                        <span className={`chip ${STAGE_CHIP[stage]}`}>{STAGE_LABEL[stage]}</span>
                        {a.mustChangePassword && a.isActive && <div className="loc" style={{ marginTop: 4 }}>Must set own password at first sign-in</div>}
                      </td>
                      <td>
                        <ul className="onboard-steps">
                          {steps.map(s => (
                            <li key={s.label} className={s.done ? 'ok' : 'missing'}>
                              {s.toggle && a.isActive ? (
                                <button className="step-toggle" onClick={s.toggle} title={s.done ? 'Mark as not done' : 'Mark as done'}>
                                  {s.done ? <Check size={12} /> : <X size={12} />} {s.label}
                                </button>
                              ) : (
                                <>{s.done ? <Check size={12} /> : <X size={12} />} {s.label}</>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <div className="row-actions staff-actions">
                          {a.isActive && (
                            <button className="kanban-btn" onClick={() => { setResetFor(a); setResetPw(generatePassword()); setResetDone(false); }}>
                              <KeyRound size={11} /> Reset password
                            </button>
                          )}
                          {a.isActive
                            ? <button className="kanban-btn danger-text" onClick={() => deactivate(a)}>Deactivate</button>
                            : <button className="kanban-btn" onClick={() => patch(a, { isActive: true }, `${a.name} activated`)}>Activate</button>}
                          <button className="kanban-btn danger-text" onClick={() => remove(a)} title="Delete this staff account"><Trash2 size={11} /> Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel-note">
        Staff can&apos;t sign in with these details yet: that needs the backend (see <code>docs/backend-staff-onboarding.md</code>).
        Until then, staff are saved on this computer only, in <code>.data/staff-accounts.json</code>, with passwords stored hashed.
      </div>

      {/* Add staff */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} closeOnBackdrop={false} title={step === 'done' ? 'Staff added' : step === 'review' ? 'Check and confirm' : 'Add staff'}>
        {step === 'form' && (
          <form onSubmit={review}>
            <div className="form-group">
              <label>Full name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Sahoo" autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Mobile number</label>
                <input type="tel" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="10-digit mobile" />
              </div>
              <div className="form-group">
                <label>Email (used to sign in)</label>
                <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@manikstu.in" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Region</label>
                <select value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}>
                  <option value="" disabled>Choose…</option>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                  <option value="__other">Other…</option>
                </select>
                {form.region === '__other' && (
                  <input style={{ marginTop: 6 }} value={form.otherRegion} onChange={e => setForm({ ...form, otherRegion: e.target.value })} placeholder="Region name" />
                )}
              </div>
              <div className="form-group">
                <label>Daily call target</label>
                <input type="number" min={5} max={200} value={form.dailyTarget} onChange={e => setForm({ ...form, dailyTarget: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Temporary password</label>
              <div className="inline-edit">
                <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={{ flex: 1, width: 'auto' }} autoComplete="new-password" />
                <button type="button" className="icon-btn" onClick={() => setShowPw(s => !s)} title={showPw ? 'Hide' : 'Show'} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button type="button" className="btn-secondary btn-small" onClick={() => setForm({ ...form, password: generatePassword() })}>Generate</button>
              </div>
              <div className="loc" style={{ marginTop: 4 }}>At least 8 characters, with a letter and a number. The Staff ID is created automatically.</div>
            </div>
            {formError && <div className="login-error">{formError}</div>}
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Review</button>
            </div>
          </form>
        )}

        {step === 'review' && (
          <>
            <table className="review-table">
              <tbody>
                <tr><td>Name</td><td>{form.name.trim()}</td></tr>
                <tr><td>Mobile</td><td>{form.mobile}</td></tr>
                <tr><td>Email</td><td>{form.email.trim()}</td></tr>
                <tr><td>Region</td><td>{region}</td></tr>
                <tr><td>Daily call target</td><td>{form.dailyTarget}</td></tr>
                <tr><td>Staff ID</td><td>Created when you confirm</td></tr>
                <tr><td>Temporary password</td><td>{form.password}</td></tr>
              </tbody>
            </table>
            {formError && <div className="login-error">{formError}</div>}
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setStep('form')}>Back</button>
              <button type="button" className="btn-primary" onClick={confirmCreate} disabled={saving}>{saving ? 'Creating…' : 'Confirm & create Staff ID'}</button>
            </div>
          </>
        )}

        {step === 'done' && created && (
          <>
            <CredentialsCard
              account={created.account}
              password={created.password}
              onShared={() => patch(created.account, { detailsShared: true })}
              onToast={onToast}
            />
            <div className="modal-footer">
              <button type="button" className="btn-primary" onClick={() => setAddOpen(false)}>Done</button>
            </div>
          </>
        )}
      </Modal>

      {/* Reset password */}
      <Modal isOpen={resetFor !== null} onClose={() => setResetFor(null)} closeOnBackdrop={false} title={resetDone ? 'New password set' : `Reset password · ${resetFor?.name ?? ''}`}>
        {resetFor && !resetDone && (
          <>
            <p className="loc" style={{ marginBottom: 12 }}>
              The old password stops working. {resetFor.name.split(' ')[0]} will use the new one and must then set their own.
            </p>
            <div className="form-group">
              <label>New temporary password</label>
              <div className="inline-edit">
                <input type="text" value={resetPw} onChange={e => setResetPw(e.target.value)} style={{ flex: 1, width: 'auto' }} autoComplete="new-password" />
                <button type="button" className="btn-secondary btn-small" onClick={() => setResetPw(generatePassword())}>Generate</button>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setResetFor(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitReset}>Confirm reset</button>
            </div>
          </>
        )}
        {resetFor && resetDone && (
          <>
            <CredentialsCard account={resetFor} password={resetPw} onShared={() => patch(resetFor, { detailsShared: true })} onToast={onToast} />
            <div className="modal-footer">
              <button type="button" className="btn-primary" onClick={() => setResetFor(null)}>Done</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
