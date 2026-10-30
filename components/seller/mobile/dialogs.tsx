'use client';

// Sheets the phone app opens over any screen: confirm an order (courier + tracking number),
// restock, add / edit a product, and the "are you sure?" steps for reject / ship / deliver.

import React, { useState } from 'react';
import { Minus, PackagePlus, Plus, Truck } from 'lucide-react';
import { rupees } from '../../../lib/format';
import { BUS_NAME_MAX, BUS_NUMBER_MAX, COURIERS, courierProblems, needsTracking } from '../../../lib/couriers';
import ProductForm from '../ProductForm';
import { restockProblem, useSeller } from '../app/SellerProvider';
import type { ManualStageAction } from '../sellerData';
import { Btn, Chip, ConfirmSheet, KeyVal, Notice, ProductThumb, Sheet } from './ui';


/** Button text for each next step, short enough for half-width phone buttons. */
export const STEP_SHORT: Record<ManualStageAction, string> = {
  packed: 'Mark packed',
  shipped: 'Mark shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Mark delivered',
};

export function ConfirmOrderSheet() {
  const { confirmCard: c, confirmOrder: order, closeConfirmCard, setConfirmField, saveConfirmCard, myOrders } = useSeller();
  const open = !!(c && order);
  const pending = order?.status === 'pending';
  const mine = order ? myOrders.find(o => o.order.id === order.id) : null;
  const formId = 'sx-confirm-form';
  return (
    <Sheet
      open={open}
      onClose={closeConfirmCard}
      title={pending ? 'Confirm order' : 'Courier details'}
      busy={c?.busy}
      footer={
        <div className="sx-actions">
          <Btn variant="secondary" onClick={closeConfirmCard} disabled={c?.busy}>Cancel</Btn>
          <Btn type="submit" form={formId} busy={c?.busy}>{pending ? 'Confirm order' : 'Save'}</Btn>
        </div>
      }
    >
      {c && order && (
        <form id={formId} onSubmit={e => { e.preventDefault(); void saveConfirmCard(); }} noValidate className="sx-form">
          <div className="sx-sheet-order">
            <strong>{order.order_number}</strong>
            <span>{order.customer_name} · {order.city}</span>
            {mine && <span>{mine.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ')} · {rupees(mine.gross)}</span>}
          </div>
          <p className="sx-hint">
            {!needsTracking(c.courierCode)
              ? 'Sent by bus: no tracking number is needed. Add the bus name and number if you have them.'
              : pending ? 'Add the courier and its tracking number to confirm this order.' : 'The courier and tracking number for this order.'}
          </p>
          {(() => {
            const p = c.checked ? courierProblems(c) : { courier: null, otherName: null, trackingNo: null };
            return (
              <>
                <div className="sx-field">
                  <label htmlFor="sx-courier">Courier name</label>
                  <select id="sx-courier" value={c.courierCode} disabled={c.busy} aria-invalid={!!p.courier}
                    onChange={e => setConfirmField('courierCode', e.target.value)}>
                    <option value="" disabled>Select a courier</option>
                    {COURIERS.map(x => <option key={x.code} value={x.code}>{x.label}</option>)}
                  </select>
                  {p.courier && <p className="sx-form-error" role="alert">{p.courier}</p>}
                </div>
                {c.courierCode === 'other' && (
                  <div className="sx-field">
                    <label htmlFor="sx-other-courier">Other Courier Name</label>
                    <input id="sx-other-courier" type="text" required autoComplete="off" maxLength={80} placeholder="Enter courier name" value={c.otherName}
                      disabled={c.busy} aria-invalid={!!p.otherName} onChange={e => setConfirmField('otherName', e.target.value)} />
                    {p.otherName && <p className="sx-form-error" role="alert">{p.otherName}</p>}
                  </div>
                )}
                {c.courierCode === 'bus' && (
                  // Bus only, both optional: highlighted so the seller notices them, never an error when empty.
                  <div className="bus-fields" role="group" aria-label="Bus details (optional)">
                    <div className="sx-field">
                      <label htmlFor="sx-bus-name">Bus Name <span className="optional-tag">Optional</span></label>
                      <input id="sx-bus-name" type="text" autoComplete="off" maxLength={BUS_NAME_MAX} placeholder="Enter bus operator or bus service name"
                        value={c.busName} disabled={c.busy} onChange={e => setConfirmField('busName', e.target.value)} />
                    </div>
                    <div className="sx-field">
                      <label htmlFor="sx-bus-number">Bus Number <span className="optional-tag">Optional</span></label>
                      <input id="sx-bus-number" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={BUS_NUMBER_MAX}
                        placeholder="Enter bus number" value={c.busNumber} disabled={c.busy} onChange={e => setConfirmField('busNumber', e.target.value)} />
                    </div>
                  </div>
                )}
                {/* No tracking number for Bus: the field is not shown at all. */}
                {needsTracking(c.courierCode) && (
                  <div className="sx-field">
                    <label htmlFor="sx-awb">Tracking / AWB Number</label>
                    <input id="sx-awb" type="text" required autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40}
                      placeholder="Enter tracking or AWB number" value={c.trackingNo}
                      disabled={c.busy} aria-invalid={!!p.trackingNo} onChange={e => setConfirmField('trackingNo', e.target.value)} />
                    {p.trackingNo && <p className="sx-form-error" role="alert">{p.trackingNo}</p>}
                  </div>
                )}
              </>
            );
          })()}
          {c.error && <p className="sx-form-error" role="alert">{c.error}</p>}
        </form>
      )}
    </Sheet>
  );
}

export function RestockSheet() {
  const { restock: r, closeRestock, setRestockField, saveRestock, stock } = useSeller();
  const formId = 'sx-restock-form';
  const units = r ? Number(r.units) || 0 : 0;
  const level = r ? stock.find(s => s.p.id === r.product.id) : null;
  const bump = (n: number) => r && setRestockField('units', String(Math.max(1, units + n)));
  const problem = r ? restockProblem(r.units) : null;
  return (
    <Sheet
      open={!!r}
      onClose={closeRestock}
      title="Restock"
      initialFocus="#sx-rs-units"
      footer={
        <div className="sx-actions">
          <Btn variant="secondary" onClick={closeRestock}>Cancel</Btn>
          <Btn type="submit" form={formId} icon={PackagePlus}>Add to stock</Btn>
        </div>
      }
    >
      {r && (
        <form id={formId} onSubmit={e => { e.preventDefault(); void saveRestock(); }} noValidate className="sx-form">
          <div className="sx-sheet-product">
            <ProductThumb product={r.product} name={r.product.name} size={56} />
            <div>
              <strong>{r.product.name}</strong>
              <span>{r.product.size}{r.product.price ? ` · ${rupees(r.product.price)}` : ''}</span>
              <span>In stock now: <b>{r.product.stock_quantity}</b>{level ? ` · ${level.available} available to sell` : ''}</span>
            </div>
          </div>
          <div className="sx-field">
            <label htmlFor="sx-rs-units">Units received</label>
            <div className="sx-stepper">
              <button type="button" className="sx-icon-btn sx-stepper-btn" onClick={() => bump(-1)} aria-label="One less" disabled={units <= 1}><Minus size={18} aria-hidden /></button>
              <input id="sx-rs-units" type="text" inputMode="numeric" pattern="[0-9]*" value={r.units} aria-invalid={!!r.error} aria-describedby={r.error ? 'sx-rs-err' : undefined}
                onChange={e => setRestockField('units', e.target.value.replace(/[^\d]/g, ''))} />
              <button type="button" className="sx-icon-btn sx-stepper-btn" onClick={() => bump(1)} aria-label="One more"><Plus size={18} aria-hidden /></button>
            </div>
            <div className="sx-quick" role="group" aria-label="Quick amounts">
              {r.suggested > 0 && <button type="button" className="sx-quick-chip" onClick={() => setRestockField('units', String(r.suggested))}>Suggested {r.suggested}</button>}
              {[10, 25, 50, 100].map(n => <button key={n} type="button" className="sx-quick-chip" onClick={() => setRestockField('units', String(n))}>{n}</button>)}
            </div>
            {r.error && <p id="sx-rs-err" className="sx-field-error" role="alert">{r.error}</p>}
          </div>
          <div className="sx-field">
            <label htmlFor="sx-rs-note">Batch / note <span className="sx-hint-inline">optional</span></label>
            <input id="sx-rs-note" type="text" placeholder="e.g. Batch 24-09, invoice 1182" value={r.note} onChange={e => setRestockField('note', e.target.value)} />
          </div>
          <div className="sx-total">New stock <strong>{problem ? '—' : r.product.stock_quantity + units} units</strong></div>
        </form>
      )}
    </Sheet>
  );
}

export function ProductFormSheet() {
  const { productForm: f, closeProductForm } = useSeller();
  const editing = f?.editingId !== null && f?.editingId !== undefined;
  return (
    <Sheet
      open={!!f}
      onClose={closeProductForm}
      title={editing ? `Edit ${f?.draft.name ?? 'product'}` : 'Add a product'}
      full
      busy={f?.busy}
      footer={
        <div className="sx-actions">
          <Btn variant="secondary" onClick={closeProductForm} disabled={f?.busy}>Cancel</Btn>
          <Btn type="submit" form="sx-product-form" busy={f?.busy}>{editing ? 'Save changes' : 'Add product'}</Btn>
        </div>
      }
    >
      <ProductForm variant="mobile" formId="sx-product-form" />
    </Sheet>
  );
}

/** Mark packed / out for delivery straight away; ask first for shipped and delivered (they move stock and money). */
export function useStageRunner() {
  const { advanceManualStage, myOrders, shipmentDetails, openConfirmCard } = useSeller();
  const [ask, setAsk] = useState<{ orderId: number; action: ManualStageAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);

  const run = async (orderId: number, action: ManualStageAction) => {
    if (action === 'shipped' || action === 'delivered') { setAsk({ orderId, action }); return; }
    setRunningId(orderId);
    await advanceManualStage(orderId, action, { navigate: false });
    setRunningId(null);
  };
  const confirm = async () => {
    if (!ask) return;
    setBusy(true);
    const ok = await advanceManualStage(ask.orderId, ask.action, { navigate: false });
    setBusy(false);
    if (ok) setAsk(null);
  };
  const o = ask ? myOrders.find(x => x.order.id === ask.orderId) : null;
  const details = ask ? shipmentDetails[ask.orderId] : undefined;
  const sheet = (
    <ConfirmSheet
      open={!!ask && !!o}
      onClose={() => setAsk(null)}
      onConfirm={() => void confirm()}
      busy={busy}
      title={ask?.action === 'shipped' ? 'Mark as shipped?' : 'Mark as delivered?'}
      confirmLabel={ask?.action === 'shipped' ? 'Mark shipped' : 'Mark delivered'}
      message={o && (ask?.action === 'shipped'
        ? <>Hand <strong>{o.order.order_number}</strong> to the courier. {o.units} unit{o.units === 1 ? '' : 's'} leave your stock, and every Manikstu dashboard shows it as shipped.</>
        : <>Confirm <strong>{o.order.order_number}</strong> reached {o.order.customer_name}. It then counts towards your payouts.</>)}
    >
      {o && (
        <dl className="sx-kvs">
          <KeyVal k="Customer" v={`${o.order.customer_name}, ${o.order.city}`} />
          <KeyVal k="Items" v={o.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ')} />
          <KeyVal k="Courier" v={details?.courier ? `${details.courier} · ${details.trackingNo}` : <span className="sx-muted">Not recorded</span>} />
          {o.order.payment_method === 'COD' && <KeyVal k="Payment" v={<Chip tone={o.order.payment_status === 'paid' ? 'success' : 'warn'}>COD · {o.order.payment_status}</Chip>} />}
        </dl>
      )}
      {o && ask?.action === 'shipped' && !details?.courier && (
        <Notice tone="warn" icon={Truck} action={<Btn size="sm" variant="secondary" onClick={() => { const id = o.order.id; setAsk(null); openConfirmCard(id); }}>Add</Btn>}>
          No courier or tracking number recorded for this order yet.
        </Notice>
      )}
    </ConfirmSheet>
  );
  return { run, sheet, runningId };
}

/** Reject a new order, after asking. */
export function useRejectRunner() {
  const { rejectOrder, myOrders } = useSeller();
  const [askId, setAskId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const o = askId !== null ? myOrders.find(x => x.order.id === askId) : null;
  const confirm = async () => {
    if (askId === null) return;
    setBusy(true);
    const ok = await rejectOrder(askId);
    setBusy(false);
    if (ok) setAskId(null);
  };
  const sheet = (
    <ConfirmSheet
      open={!!o}
      onClose={() => setAskId(null)}
      onConfirm={() => void confirm()}
      busy={busy}
      danger
      title="Reject this order?"
      confirmLabel="Reject order"
      message={o && <>The customer will be told <strong>{o.order.order_number}</strong> cannot be fulfilled. This can&apos;t be undone from the app.</>}
    >
      {o && (
        <dl className="sx-kvs">
          <KeyVal k="Customer" v={`${o.order.customer_name}, ${o.order.city}`} />
          <KeyVal k="Items" v={o.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ')} />
          <KeyVal k="Amount" v={rupees(o.gross)} />
        </dl>
      )}
    </ConfirmSheet>
  );
  return { ask: setAskId, sheet };
}
