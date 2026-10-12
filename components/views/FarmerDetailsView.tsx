import React, { useState } from 'react';
import { Customer } from '../../data/initialData';
import { SalesOrder } from '../../data/managerDashboard';
import { rupees, shortDate } from '../../lib/format';

interface FarmerDetailsViewProps {
  customer: Customer | null;
  orders: SalesOrder[];
  onBack: () => void;
  /** The head can capture and correct a farmer's animal counts and farm profile from the Regional report. */
  editable?: boolean;
  onSave?: (patch: {
    livestock?: Customer['livestock'];
    landHolding?: string;
    crops?: string[];
    farmingModel?: string;
    waterResource?: string;
    preferredLanguage?: string;
  }) => Promise<void>;
  backLabel?: string;
}

const ANIMALS: { key: keyof Customer['livestock']; icon: string; label: string }[] = [
  { key: 'cows', icon: '🐄', label: 'Cows' },
  { key: 'buffaloes', icon: '🐃', label: 'Buffaloes' },
  { key: 'goats', icon: '🐐', label: 'Goats' },
  { key: 'sheep', icon: '🐑', label: 'Sheep' },
  { key: 'poultry', icon: '🐔', label: 'Poultry' },
];

export default function FarmerDetailsView({ customer, orders, onBack, editable = false, onSave, backLabel = 'Back to customers' }: FarmerDetailsViewProps) {
  const current = customer || {
    id: 'C-001',
    name: 'Debasish Nayak',
    location: 'Cuttack',
    ordersCount: 14,
    lifetimeValue: 18600,
    lastOrder: '18 Sep',
    status: 'Active',
    phone: '98610 24810',
    landHolding: '4.5 acres',
    crops: ['Paddy', 'Vegetables'],
    livestock: { cows: 4, buffaloes: 2, goats: 8, sheep: 0, poultry: 25 }
  };

  const [live, setLive] = useState<Customer['livestock']>(current.livestock);
  const [savedLive, setSavedLive] = useState<Customer['livestock']>(current.livestock);
  const [saving, setSaving] = useState(false);
  const shownLive = editable ? live : current.livestock;
  const totalLivestock = Object.values(shownLive).reduce((a, b) => a + Number(b || 0), 0);
  const dirty = editable && JSON.stringify(live) !== JSON.stringify(savedLive);
  const saveLivestock = async () => {
    if (!onSave || saving || !dirty) return;
    setSaving(true);
    try { await onSave({ livestock: live }); setSavedLive(live); }
    catch { /* the parent surfaces the error; keep the edits so the user can retry */ }
    finally { setSaving(false); }
  };

  // Farm Profile: free-text fields the head can fill in from a call.
  const initFarm = {
    land: current.landHolding && current.landHolding !== '—' ? current.landHolding : '',
    crops: current.crops.join(', '),
    farmingModel: current.details?.farmingModel ?? '',
    waterResource: current.details?.waterResource ?? '',
    preferredLanguage: current.details?.preferredLanguage ?? '',
  };
  const [farm, setFarm] = useState(initFarm);
  const [savedFarm, setSavedFarm] = useState(initFarm);
  const [savingFarm, setSavingFarm] = useState(false);
  const setFarmField = (k: keyof typeof initFarm, v: string) => setFarm(prev => ({ ...prev, [k]: v }));
  const farmDirty = editable && JSON.stringify(farm) !== JSON.stringify(savedFarm);
  const saveFarm = async () => {
    if (!onSave || savingFarm || !farmDirty) return;
    setSavingFarm(true);
    try {
      await onSave({
        landHolding: farm.land.trim() || '—',
        crops: farm.crops.split(',').map(s => s.trim()).filter(Boolean),
        farmingModel: farm.farmingModel.trim(),
        waterResource: farm.waterResource.trim(),
        preferredLanguage: farm.preferredLanguage.trim(),
      });
      setSavedFarm(farm);
    } catch { /* the parent surfaces the error; keep the edits so the user can retry */ }
    finally { setSavingFarm(false); }
  };

  const digitsOnly = (v: string) => v.replace(/\D/g, '');
  const farmerOrders = orders
    .filter(o => digitsOnly(o.phone).slice(-10) === digitsOnly(current.phone).slice(-10))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <button className="back-link" onClick={onBack} style={{ background: 'none', border: 'none', padding: 0 }}>
        ← {backLabel}
      </button>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="track-head">
          <div>
            <div className="track-order-id">Farmer Profile · ID: {current.id}</div>
            <h2 style={{ margin: '2px 0 0' }}>{current.name}</h2>
            <div className="sub" style={{ marginTop: 4 }}>
              {current.location}, Odisha · {current.phone}
            </div>
          </div>
          <div className="track-amount">
            <span className={`chip ${current.status === 'Active' ? 'delivered' : 'pending'}`}>
              {current.status}
            </span>
            <div className="track-amt-num">₹{current.lifetimeValue.toLocaleString()}</div>
            <div className="sub" style={{ marginTop: 2 }}>Lifetime Value</div>
          </div>
        </div>
      </div>

      <div className="scoreboard">
        <div className="score">
          <div className="num">{current.ordersCount}</div>
          <div className="label">Total Orders</div>
        </div>
        <div className="score">
          <div className="num">{current.landHolding}</div>
          <div className="label">Land Holding</div>
        </div>
        <div className="score">
          <div className="num">{current.lastOrder}</div>
          <div className="label">Last Order</div>
        </div>
        <div className="score">
          <div className="num">Bore Well</div>
          <div className="label">Irrigation Type</div>
        </div>
      </div>

      {/* Livestock Breakdown */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Livestock Inventory</h2>
          {editable ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="link">{totalLivestock} animals</span>
              <button className="btn-primary btn-small" disabled={saving || !dirty} onClick={saveLivestock}>
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </button>
            </div>
          ) : (
            <span className="link">{totalLivestock} Animals Total</span>
          )}
        </div>
        <div className="livestock-grid">
          {ANIMALS.map(a => (
            <div className="livestock-item" key={a.key}>
              <div className="li-icon">{a.icon}</div>
              {editable ? (
                <input
                  className="li-input"
                  type="number"
                  min={0}
                  value={live[a.key]}
                  onChange={e => setLive(prev => ({ ...prev, [a.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                  aria-label={`${a.label} count`}
                />
              ) : (
                <div className="li-num">{current.livestock[a.key]}</div>
              )}
              <div className="li-label">{a.label}</div>
            </div>
          ))}
        </div>
        {editable && <div className="loc" style={{ marginTop: 10 }}>Type the counts from your call — e.g. 12 cows, 34 sheep — then Save. Stored on this farmer&apos;s profile.</div>}
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Farm Profile</h2>
            {editable && (
              <button className="btn-primary btn-small" disabled={savingFarm || !farmDirty} onClick={saveFarm}>
                {savingFarm ? 'Saving…' : farmDirty ? 'Save changes' : 'Saved'}
              </button>
            )}
          </div>
          <ul className="partner-list">
            <li>
              <div>
                <div className="pname">Primary Crops</div>
                <div className="ploc">Grown this Kharif season</div>
              </div>
              {editable
                ? <input className="farm-input" value={farm.crops} onChange={e => setFarmField('crops', e.target.value)} placeholder="e.g. Paddy, Vegetables" aria-label="Primary crops" />
                : <span className="track-val">{current.crops.length ? current.crops.join(', ') : '—'}</span>}
            </li>
            <li>
              <div>
                <div className="pname">Farming Model</div>
                <div className="ploc">Land utilization</div>
              </div>
              {editable
                ? <input className="farm-input" value={farm.farmingModel} onChange={e => setFarmField('farmingModel', e.target.value)} placeholder="e.g. Mixed Crop & Livestock" aria-label="Farming model" />
                : <span className="track-val">{current.details?.farmingModel || '—'}</span>}
            </li>
            <li>
              <div>
                <div className="pname">Land Area</div>
                <div className="ploc">Total holding size</div>
              </div>
              {editable
                ? <input className="farm-input" value={farm.land} onChange={e => setFarmField('land', e.target.value)} placeholder="e.g. 3 acres" aria-label="Land area" />
                : <span className="track-val">{current.landHolding}</span>}
            </li>
            <li>
              <div>
                <div className="pname">Water Resource</div>
                <div className="ploc">Irrigation source</div>
              </div>
              {editable
                ? <input className="farm-input" value={farm.waterResource} onChange={e => setFarmField('waterResource', e.target.value)} placeholder="e.g. Bore well & Rain-fed" aria-label="Water resource" />
                : <span className="track-val">{current.details?.waterResource || '—'}</span>}
            </li>
            <li>
              <div>
                <div className="pname">Preferred Language</div>
                <div className="ploc">Telecalling preference</div>
              </div>
              {editable
                ? <input className="farm-input" value={farm.preferredLanguage} onChange={e => setFarmField('preferredLanguage', e.target.value)} placeholder="e.g. Odia (Evening calls)" aria-label="Preferred language" />
                : <span className="track-val">{current.details?.preferredLanguage || '—'}</span>}
            </li>
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Recent Orders</h2>
            <span className="link">{farmerOrders.length} {farmerOrders.length === 1 ? 'order' : 'orders'}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Product</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {farmerOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '20px 0' }}>
                      No orders on file for this phone number yet.
                    </td>
                  </tr>
                ) : farmerOrders.slice(0, 6).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.order_number}</td>
                    <td>
                      {o.items[0]?.product_name ?? '—'}
                      {o.items.length > 1 && ` +${o.items.length - 1} more`}
                    </td>
                    <td>{rupees(o.total)}</td>
                    <td>{shortDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
