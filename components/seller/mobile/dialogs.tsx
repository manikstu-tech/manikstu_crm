'use client';

// Sheets the phone app opens over any screen: confirm an order (courier + tracking number),
// restock, add / edit a product, and the "are you sure?" steps for reject / ship / deliver.

import React, { useState } from 'react';
import { Minus, PackagePlus, Plus, Truck } from 'lucide-react';
import { rupees } from '../../../lib/format';
import ProductForm from '../ProductForm';
import { restockProblem, useSeller } from '../app/SellerProvider';
import type { ManualStageAction } from '../sellerData';
import { Btn, Chip, ConfirmSheet, KeyVal, Notice, ProductThumb, Sheet } from './ui';

const COURIERS = ['India Post', 'Delhivery', 'DTDC', 'Ekart', 'Blue Dart', 'Own delivery'];

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
            {pending ? 'Add the courier and its tracking number to confirm this order.' : 'The courier and tracking number for this order.'}
          </p>
          <div className="sx-field">
            <label htmlFor="sx-courier">Courier name</label>
            <input id="sx-courier" type="text" required autoComplete="off" placeholder="e.g. India Post, Delhivery, DTDC" value={c.courier}
              aria-invalid={!!c.error && !c.courier.trim()} onChange={e => setConfirmField('courier', e.target.value)} />
            <div className="sx-quick" role="group" aria-label="Pick a courier">
              {COURIERS.map(name => (
                <button key={name} type="button" className="sx-quick-chip" aria-pressed={c.courier.trim() === name} onClick={() => setConfirmField('courier', name)}>{name}</button>
              ))}
            </div>
          </div>
          <div className="sx-field">
            <label htmlFor="sx-awb">Tracking / AWB number</label>
            <input id="sx-awb" type="text" required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Courier tracking number" value={c.trackingNo}
              aria-invalid={!!c.error && !c.trackingNo.trim()} onChange={e => setConfirmField('trackingNo', e.target.value)} />
          </div>
          <p className="sx-hint">Courier details stay on this device for now: the CRM doesn&apos;t store them yet.</p>
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
