import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import type { CallStatus, CommunicationStatus, SalesOrder } from '../../data/managerDashboard';
import { ORDER_CHIP, rupees, shortDateTime } from '../../lib/format';
import Modal from '../Modal';
import CardTable from '../CardTable';

// Orders the seller has confirmed, for the telecalling team to phone the customer about. Used by the
// telecalling head and the calling executives. Reads and writes the CRM backend through /api/orders.

const COMM_LABEL: Record<CommunicationStatus, string> = {
  not_contacted: 'Not called yet', contacted: 'Contacted', follow_up: 'Follow-up', unreachable: 'Unreachable', resolved: 'Resolved',
};
const COMM_CHIP: Record<CommunicationStatus, string> = {
  not_contacted: 'pending', contacted: 'delivered', follow_up: 'transit', unreachable: 'muted', resolved: 'delivered',
};
const CALL_OPTIONS: { value: CallStatus; label: string }[] = [
  { value: 'connected', label: 'Connected — spoke to the customer' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'busy', label: 'Line busy' },
  { value: 'switched_off', label: 'Phone switched off' },
  { value: 'callback_requested', label: 'Customer asked for a callback' },
  { value: 'wrong_number', label: 'Wrong number' },
];
const CALL_LABEL = Object.fromEntries(CALL_OPTIONS.map(o => [o.value, o.label])) as Record<CallStatus, string>;
const REFRESH_MS = 15000;

const orderDay = (s: string) => s.slice(0, 10);

export default function OrderFollowUp({ searchQuery = '', onToast }: { searchQuery?: string; onToast: (message: string) => void }) {
  const [orders, setOrders] = useState<SalesOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommunicationStatus | 'all'>('all');
  const [openId, setOpenId] = useState<number | null>(null);

  // Call form
  const [callStatus, setCallStatus] = useState<CallStatus>('connected');
  const [remarks, setRemarks] = useState('');
  const [followup, setFollowup] = useState('');
  const [resolved, setResolved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not load orders.');
        return;
      }
      setOrders(body.data as SalesOrder[]);
      setError(null);
    } catch {
      setError('Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders?.length ?? 0 };
    for (const o of orders ?? []) c[o.communication_status ?? 'not_contacted'] = (c[o.communication_status ?? 'not_contacted'] ?? 0) + 1;
    return c;
  }, [orders]);

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (orders ?? []).filter(o => {
      if (filter !== 'all' && (o.communication_status ?? 'not_contacted') !== filter) return false;
      return !q || [o.order_number, o.customer_name, o.phone, o.city].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }, [orders, filter, searchQuery]);

  const open = orders?.find(o => o.id === openId) ?? null;

  const openOrder = (o: SalesOrder) => {
    setOpenId(o.id);
    setCallStatus('connected');
    setRemarks('');
    setFollowup('');
    setResolved(false);
    setFormError(null);
  };

  const save = async () => {
    if (!open) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/orders/${open.id}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_status: callStatus,
          remarks: remarks.trim() || null,
          followup_at: followup || null,
          ...(resolved ? { communication_status: 'resolved' } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body.error ?? 'Could not save the call.');
        return;
      }
      const updated = body.data as SalesOrder;
      setOrders(list => (list ?? []).map(o => (o.id === updated.id ? updated : o)));
      setOpenId(null);
      onToast(`Call saved for ${updated.order_number}`);
    } catch {
      setFormError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !orders) {
    return <div className="panel"><div className="panel-note" style={{ margin: 16 }}>{error}</div></div>;
  }
  if (!orders) return <div className="panel"><div className="panel-note" style={{ margin: 16 }}>Loading orders…</div></div>;

  return (
    <>
      <div className="filter-row one-line oc-filters">
        <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value as CommunicationStatus | 'all')} aria-label="Call status">
          <option value="all">All orders ({counts.all})</option>
          {(Object.keys(COMM_LABEL) as CommunicationStatus[]).map(k => (
            <option key={k} value={k}>{COMM_LABEL[k]} ({counts[k] ?? 0})</option>
          ))}
        </select>
        <button className="btn-secondary btn-small" onClick={load}>Refresh</button>
      </div>
      {error && <div className="filter-note">{error} Showing the last loaded list.</div>}

      <div className="panel">
        <CardTable>
          <table className="orders-table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Items</th><th className="num-col">Total</th><th>Order status</th><th>Calls</th><th>Action</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 0' }}>
                  {orders.length === 0 ? 'No confirmed orders yet. They appear here once a seller confirms them.' : 'No orders match.'}
                </td></tr>
              )}
              {rows.map(o => {
                const comm = o.communication_status ?? 'not_contacted';
                return (
                  <tr key={o.id}>
                    <td>
                      <button className="link-btn order-no" onClick={() => openOrder(o)}>{o.order_number}</button>
                      <div className="loc">{shortDateTime(o.created_at)}</div>
                    </td>
                    <td className="cust">
                      {o.customer_name}
                      <div className="loc">{o.phone} · {o.city}</div>
                    </td>
                    <td>
                      {o.items[0]?.product_name}{o.items.length > 1 && <span className="more-items"> +{o.items.length - 1} more</span>}
                    </td>
                    <td className="num-col strong">{rupees(o.total)}</td>
                    <td><span className={`chip ${ORDER_CHIP[o.status]}`}>{o.stage_label ?? o.status}</span></td>
                    <td>
                      <span className={`chip ${COMM_CHIP[comm]}`}>{COMM_LABEL[comm]}</span>
                      <div className="loc">
                        {o.calls?.length ? `${o.calls.length} ${o.calls.length === 1 ? 'call' : 'calls'}` : 'No calls'}
                        {o.next_followup_at ? ` · follow up ${shortDateTime(o.next_followup_at)}` : ''}
                      </div>
                    </td>
                    <td><button className="kanban-btn" onClick={() => openOrder(o)}>Call / update</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardTable>
      </div>

      <Modal isOpen={open !== null} onClose={() => setOpenId(null)} title={open ? `Order ${open.order_number}` : ''} closeOnBackdrop={false}>
        {open && (
          <>
            <div className="od-customer" style={{ marginBottom: 12 }}>
              <div>
                <div className="strong">{open.customer_name}</div>
                <div className="loc">{open.address}, {open.city}{open.state ? `, ${open.state}` : ''} {open.pincode}</div>
                <div className="loc">
                  {open.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ')} · {rupees(open.total)} · {open.payment_method} ({open.payment_status})
                </div>
              </div>
              <a className="call-btn" href={`tel:+91${open.phone}`}><Phone size={13} /> {open.phone}</a>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>How did the call go?</label>
                <select className="filter-select" value={callStatus} onChange={e => setCallStatus(e.target.value as CallStatus)}>
                  {CALL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Follow up on (optional)</label>
                <input type="datetime-local" value={followup} onChange={e => setFollowup(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Address confirmed, wants delivery after 5 pm…" />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
              <input type="checkbox" checked={resolved} onChange={e => setResolved(e.target.checked)} />
              Customer communication is complete (mark resolved)
            </label>
            {formError && <div className="filter-note" role="alert">{formError}</div>}
            <div className="modal-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', margin: '12px 0' }}>
              <button className="btn-secondary" onClick={() => setOpenId(null)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save call'}</button>
            </div>

            <div className="od-label">Order timeline &amp; calls</div>
            <ul className="track-timeline">
              {[...(open.activity ?? [])].reverse().map((a, i) => (
                <li key={i}>
                  <div className="tt-title">
                    {a.kind === 'call' ? CALL_LABEL[a.status as CallStatus] ?? a.status : (a.status === 'pending' ? 'Order placed' : a.status === 'ready_for_dispatch' ? 'Packed' : a.status.replace(/_/g, ' '))}
                  </div>
                  <div className="tt-time">{shortDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}{a.text ? ` · ${a.text}` : ''}</div>
                </li>
              ))}
            </ul>
            <div className="loc">Placed {orderDay(open.created_at)}</div>
          </>
        )}
      </Modal>
    </>
  );
}
