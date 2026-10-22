import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { CUSTOMER_RESPONSES, CallOutcome, CustomerResponse, Followup, LeadActivity, STAGES, Telecaller, TrackerLead, WebEnquiry, isWonStage } from '../../data/managerDashboard';
import { ago, rupees, shortDateTime } from '../../lib/format';
import Modal from '../Modal';
import { StatusChip } from '../telecaller/shared';
import { OUTCOMES, stageName, stagesFor, verticalName } from '../telecaller/tcData';
import type { CallForm } from './CallDeskView';
import { OUTCOME_COLORS } from './queue';
import { fillScript, scriptFor } from './scripts';

/** One orderable product: the price is the catalogue's, the caller only picks the product and a quantity. */
/** stock: units that can still be sold (absent in the offline demo). An order beyond it is a back-order the seller sees as waiting for stock. */
export interface CatalogItem { id: number; name: string; price: number; size?: string | null; stock?: number; stock_status?: 'in' | 'low' | 'out' }

const stockNote = (c: CatalogItem) =>
  c.stock === undefined ? '' : c.stock_status === 'out' ? ' · out of stock' : c.stock_status === 'low' ? ` · ${c.stock} left` : '';

export interface CallTarget {
  lead: TrackerLead;
  followup?: Followup;
}

interface Props {
  target: CallTarget;
  me: Telecaller;
  history: LeadActivity[];
  /** The website enquiry this lead came from, so the customer's own words are in front of the caller. */
  enquiry?: WebEnquiry;
  /** What can be ordered, and at what price (the live catalogue), for taking an order on the call. */
  catalog: CatalogItem[];
  initialForm: CallForm;
  onSave: (outcome: CallOutcome, form: CallForm, durationSec: number | null) => void;
  onClose: () => void;
}

const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** Opens the phone dialer for a number (tel: link), without leaving the page. */
export function dial(phone: string) {
  const a = document.createElement('a');
  a.href = `tel:+91${phone}`;
  a.click();
}

/**
 * Calling window for the Call desk page: the call starts as soon as it opens
 * (dialer + timer), and the outcome is logged here without leaving the page.
 */
export default function CallModal({ target, me, history, enquiry, catalog, initialForm, onSave, onClose }: Props) {
  const { lead, followup } = target;
  const script = scriptFor(lead.vertical_id);
  const [form, setForm] = useState<CallForm>(initialForm);
  const patch = (p: Partial<CallForm>) => setForm(f => ({ ...f, ...p }));
  const [formError, setFormError] = useState<string | null>(null);

  const orderPatch = (p: Partial<CallForm['order']>) => setForm(f => ({ ...f, order: { ...f.order, ...p } }));
  const ordering = form.customerResponse === 'Placed order';
  const chosen = catalog.find(c => c.id === form.order.productId);
  const qty = Math.max(0, Math.floor(Number(form.order.quantity) || 0));
  const amount = chosen ? chosen.price * qty : 0;
  /** Picking "Placed order" also moves the lead to its Won stage (the caller can still change it). */
  const pickResponse = (r: CustomerResponse | '') => {
    const won = r === 'Placed order' ? STAGES.filter(s => s.vertical_id === lead.vertical_id).find(s => isWonStage(s)) : undefined;
    patch({ customerResponse: r, ...(won ? { stageId: won.id } : {}) });
    setFormError(null);
  };

  /** Saving the call submits the call report, so the customer's response must be filled in when they were reached. */
  const save = (o: CallOutcome) => {
    let response = form.customerResponse;
    if (!response && o === 'Not interested') response = 'Not interested';
    if (!response && o === 'Connected') {
      setFormError('Pick the customer’s response to submit the call report.');
      return;
    }
    // The customer ordered on the call: the order must say what, how many and where to deliver, or it cannot go forward.
    if (o === 'Connected' && response === 'Placed order') {
      const ord = form.order;
      const problem =
        !chosen ? 'Choose the product the customer ordered.'
        : qty < 1 ? 'Enter how many the customer wants.'
        : ord.address.trim().length < 5 ? 'Enter the delivery address.'
        : !ord.city.trim() ? 'Enter the city or village for delivery.'
        : !/^\d{6}$/.test(ord.pincode.trim()) ? 'Enter the 6-digit PIN code.'
        : null;
      if (problem) {
        setFormError(problem);
        return;
      }
    }
    setFormError(null);
    onSave(o, { ...form, customerResponse: response }, o === 'Connected' ? elapsedSec : null);
  };

  // The call is already started by the click that opened this window.
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const live = endedAt === null;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  const elapsedSec = Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000));

  const redial = () => {
    dial(lead.phone);
    setStartedAt(Date.now());
    setNow(Date.now());
    setEndedAt(null);
  };

  const close = () => {
    if (live && !window.confirm('The call is still running. Close without saving it?')) return;
    onClose();
  };

  return (
    <Modal isOpen onClose={close} title={`Calling ${lead.customer_name}`} wide closeOnBackdrop={false}>
      <div className="ce-modal-lead">
        {followup && <span className="chip transit">Callback</span>}
        <div className="ce-modal-phone">+91 {lead.phone}</div>
        <div className="ce-modal-meta">
          {verticalName(lead.vertical_id)} · {stageName(lead.stage_id)} · Source: {lead.source} · Added {ago(lead.created_at)}
        </div>
        {followup && <div className="ce-reason">Callback reason: {followup.note}</div>}
        {enquiry && (
          <div className="ce-reason" style={{ marginTop: 8 }}>
            <strong>Website enquiry ({enquiry.type}):</strong> “{enquiry.message}”
            {enquiry.email ? <div className="loc">{enquiry.email}</div> : null}
          </div>
        )}
      </div>

      <div className={`ce-callbar ${live ? 'live' : ''}`}>
        <div className={`ce-timer ${live ? 'live' : ''}`}>
          {live && <span className="ce-live-dot" />}{clock(elapsedSec)}
        </div>
        <span className="ce-call-status">{live ? 'Call in progress · dialled on your phone app' : 'Call ended · pick an outcome below'}</span>
        {live ? (
          <button className="btn-secondary" onClick={() => setEndedAt(Date.now())}><PhoneOff size={15} /> End call</button>
        ) : (
          <button className="call-btn ce-dial" onClick={redial}><Phone size={15} /> Call again</button>
        )}
      </div>

      <div className="ce-body">
        <div className="ce-script">
          <div className="ce-label">Script</div>
          <p className="ce-opening">“{fillScript(script.opening, lead.customer_name, me.name)}”</p>
          <ul>
            {script.points.map(p => <li key={p}>{p}</li>)}
          </ul>
          <p className="loc">Close: “{fillScript(script.close, lead.customer_name, me.name)}”</p>
        </div>
        <div className="ce-history">
          <div className="ce-label">Previous calls</div>
          {history.length === 0 ? (
            <div className="loc">First call to this customer.</div>
          ) : (
            <ul className="ce-history-list">
              {history.slice(0, 4).map(a => (
                <li key={a.id}>
                  <StatusChip status={a.outcome} />
                  <span>{a.note}</span>
                  <span className="loc">{shortDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="ce-log">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="cm-stage">Stage after this call</label>
            <select id="cm-stage" value={form.stageId} onChange={e => patch({ stageId: Number(e.target.value) })}>
              {stagesFor(lead.vertical_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="cm-response">Customer response <span className="loc">(call report · required if connected)</span></label>
            <select id="cm-response" value={form.customerResponse} onChange={e => pickResponse(e.target.value as CustomerResponse | '')}>
              <option value="">Choose what the customer said…</option>
              {CUSTOMER_RESPONSES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        {ordering && (
          <div className="ce-order" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', margin: '4px 0 14px', background: 'rgba(74, 140, 63, 0.05)' }}>
            <div className="ce-label">Order taken on this call · goes to the seller to confirm</div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cm-product">Product</label>
                <select id="cm-product" value={form.order.productId} onChange={e => orderPatch({ productId: e.target.value === '' ? '' : Number(e.target.value) })}>
                  <option value="">{catalog.length === 0 ? 'Loading products…' : 'Choose the product…'}</option>
                  {catalog.map(c => <option key={c.id} value={c.id}>{c.name}{c.size ? ` · ${c.size}` : ''} — {rupees(c.price)}{stockNote(c)}</option>)}
                </select>
                {chosen && chosen.stock !== undefined && qty > chosen.stock && (
                  <div className="loc text-warn" style={{ marginTop: 4 }}>
                    {chosen.stock === 0 ? 'Out of stock' : `Only ${chosen.stock} in stock`}: the seller will see this as waiting for stock.
                  </div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="cm-qty">Quantity</label>
                <input id="cm-qty" type="number" min={1} max={1000} inputMode="numeric" value={form.order.quantity} onChange={e => orderPatch({ quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="cm-amount">Amount</label>
                <input id="cm-amount" type="text" readOnly value={chosen && qty > 0 ? rupees(amount) : '—'} aria-label="Order amount (price × quantity)" style={{ fontWeight: 700 }} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="cm-address">Delivery address</label>
              <input id="cm-address" type="text" placeholder="House / plot, street, village" value={form.order.address} onChange={e => orderPatch({ address: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cm-city">City / village</label>
                <input id="cm-city" type="text" value={form.order.city} onChange={e => orderPatch({ city: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="cm-state">State</label>
                <input id="cm-state" type="text" value={form.order.state} onChange={e => orderPatch({ state: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="cm-pin">PIN code</label>
                <input id="cm-pin" type="text" inputMode="numeric" maxLength={6} placeholder="6 digits" value={form.order.pincode} onChange={e => orderPatch({ pincode: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="form-group">
                <label htmlFor="cm-pay">Payment</label>
                <select id="cm-pay" value={form.order.paymentMethod} onChange={e => orderPatch({ paymentMethod: e.target.value as 'COD' | 'UPI' })}>
                  <option value="COD">Cash on delivery</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>
            </div>
            <div className="loc">Customer: {lead.customer_name} · +91 {lead.phone}. Saving the call places the order and records the sale.</div>
          </div>
        )}
        <div className="form-group">
          <label htmlFor="cm-note">Remarks</label>
          <input id="cm-note" type="text" placeholder="What was discussed, next step…" value={form.note} onChange={e => patch({ note: e.target.value })} />
        </div>

        <label className="check-filter" style={{ marginBottom: 10, display: 'flex' }}>
          <input type="checkbox" checked={form.scheduleNext} onChange={e => patch({ scheduleNext: e.target.checked })} />
          Follow-up needed: schedule a callback
        </label>
        {form.scheduleNext && (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cm-next-date">Date</label>
              <input id="cm-next-date" type="date" value={form.nextDate} onChange={e => patch({ nextDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="cm-next-note">Reason</label>
              <input id="cm-next-note" type="text" placeholder="e.g. Confirm quantity" value={form.nextNote} onChange={e => patch({ nextNote: e.target.value })} />
            </div>
          </div>
        )}

        {formError && <div className="inline-alert" role="alert" style={{ marginBottom: 10 }}>{formError}</div>}
        <div className="ce-label">Call status · saves the call and submits the report</div>
        <div className="ce-outcomes">
          {OUTCOMES.map(o => (
            <button
              key={o}
              className="ce-outcome"
              style={{ borderColor: OUTCOME_COLORS[o] }}
              onClick={() => save(o)}
            >
              <span className="dot3" style={{ background: OUTCOME_COLORS[o] }} />
              {o}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
