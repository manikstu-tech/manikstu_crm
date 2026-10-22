import React from 'react';
import { IndianRupee, Package, ShoppingCart, Truck, Wallet } from 'lucide-react';
import type { CatalogProduct } from '../../data/catalogProducts';
import { LOW_STOCK_LEVEL } from '../../data/stockLevels';
import { TODAY } from '../../data/today';
import { MONTH, ORDER_CHIP, rupees, rupeesShort, shortDate } from '../../lib/format';
import HBarList from '../HBarList';
import { ManualStageAction, ORDER_STATUS_LABEL, SellerOrder, ShipmentDetails, counts, nextManualStep, nextPayoutDate, stockLevels } from './sellerData';

interface Props {
  orders: SellerOrder[];
  products: CatalogProduct[];
  onNavigate: (page: string) => void;
  shipmentDetails: Record<number, ShipmentDetails>;
  onAdvanceStage: (orderId: number, action: ManualStageAction) => void;
  onOpenConfirm: (orderId: number) => void;
}

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function SellerOverview({ orders, products, onNavigate, shipmentDetails, onAdvanceStage, onOpenConfirm }: Props) {
  const month = orders.filter(o => o.order.created_at.startsWith(MONTH) && counts(o));
  const monthGross = month.reduce((s, o) => s + o.gross, 0);
  const monthUnits = month.reduce((s, o) => s + o.units, 0);
  const toShip = orders.filter(o => o.order.status === 'pending' || o.order.status === 'confirmed');
  const due = orders.filter(o => o.payout === 'Due').reduce((s, o) => s + o.net, 0);

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(`${TODAY}T00:00:00`);
    d.setDate(d.getDate() - (29 - i));
    const key = dateKey(d);
    const rows = orders.filter(o => o.order.created_at.startsWith(key) && counts(o));
    return { key, gross: rows.reduce((s, o) => s + o.gross, 0), count: rows.length };
  });
  const maxDay = Math.max(1, ...days.map(d => d.gross));
  const total30 = days.reduce((s, d) => s + d.gross, 0);
  const avg30 = Math.round(total30 / 30);
  const bestDay = days.reduce((a, b) => (b.gross > a.gross ? b : a), days[0]);
  const today = days.find(d => d.key === TODAY) ?? { gross: 0, count: 0 };

  const byProduct = products
    .map(p => {
      const lines = month.flatMap(o => o.items.filter(i => i.product_name === p.name));
      return { p, revenue: lines.reduce((s, i) => s + i.price * i.quantity, 0), units: lines.reduce((s, i) => s + i.quantity, 0) };
    })
    .filter(r => r.units > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // Judged on what can still be sold (the shelf minus unshipped orders), as the website does.
  const lowStock = stockLevels(products.filter(p => p.is_active), orders)
    .filter(r => r.status !== 'in')
    .sort((a, b) => a.available - b.available);

  return (
    <>
      <div className="seller-kpis">
        <div className="stat-tile accent">
          <IndianRupee className="stat-icon" size={22} />
          <div className="num">{rupeesShort(monthGross)}</div>
          {today.gross > 0 && <small>+{rupeesShort(today.gross)} today</small>}
          <div className="label">Sales · this month</div>
        </div>
        <div className="stat-tile">
          <ShoppingCart className="stat-icon" size={22} />
          <div className="num">{month.length}</div>
          <div className="label">Orders · this month</div>
        </div>
        <div className="stat-tile">
          <Package className="stat-icon" size={22} />
          <div className="num">{monthUnits}</div>
          <div className="label">Units sold · this month</div>
        </div>
        <div className="stat-tile">
          <Truck className="stat-icon" size={22} />
          <div className="num">{toShip.length}</div>
          {toShip.length > 0 && <small className="warn">need action</small>}
          <div className="label">Orders to confirm or ship</div>
        </div>
        <div className="stat-tile">
          <Wallet className="stat-icon" size={22} />
          <div className="num">{rupeesShort(due)}</div>
          <small>due {shortDate(nextPayoutDate())}</small>
          <div className="label">Payout due</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>My sales · last 30 days</h2>
          <span className="panel-meta">{rupees(total30)} total · before commission</span>
        </div>
        <div className="trend-facts">
          <div><span className="k"><i className="swatch" />Daily average</span><span className="v">{rupees(avg30)}</span></div>
          <div><span className="k">Best day</span><span className="v">{rupees(bestDay.gross)} <small>on {shortDate(bestDay.key)}</small></span></div>
          <div><span className="k"><i className="swatch now" />Today so far</span><span className="v">{rupees(today.gross)} <small>{today.count} {today.count === 1 ? 'order' : 'orders'}</small></span></div>
        </div>
        <div className="bar-chart dense" role="img" aria-label="Daily sales for the last 30 days">
          {days.map((d, i) => (
            <div key={d.key} className="bc-col" data-tip={`${shortDate(d.key)} · ${rupees(d.gross)} · ${d.count} orders`}>
              <div className={`bc-bar ${d.key === TODAY ? 'now' : ''}`} style={{ height: `${(d.gross / maxDay) * 100}%` }} />
              <div className="bc-label">{i % 5 === 4 || d.key === TODAY ? shortDate(d.key) : ' '}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid equal-2">
        <div className="panel">
          <div className="panel-head"><h2>Top products</h2><span className="panel-meta">This month</span></div>
          {byProduct.length === 0 ? (
            <div className="loc">No sales yet this month.</div>
          ) : (
            <HBarList rows={byProduct.map(r => ({ key: String(r.p.id), label: r.p.name, value: r.revenue, display: rupeesShort(r.revenue), tip: `${r.p.name}: ${rupees(r.revenue)} · ${r.units} units` }))} />
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Low stock</h2>
            <button className="link link-btn" onClick={() => onNavigate('stock')}>View stock</button>
          </div>
          {lowStock.length === 0 ? (
            <div className="loc">All active products have at least {LOW_STOCK_LEVEL} units available.</div>
          ) : (
            <ul className="lead-list">
              {lowStock.map(({ p, available, status }) => (
                <li key={p.id}>
                  <div><div className="name">{p.name}</div><div className="action">{p.size} · {p.category}</div></div>
                  <span className={`chip ${status === 'out' ? 'pending' : 'transit'}`}>{status === 'out' ? 'Out of stock' : `${available} left`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Orders to confirm or ship</h2>
          <button className="link link-btn" onClick={() => onNavigate('orders')}>All orders</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>My items</th><th className="num-col">Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {toShip.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 0' }}>Nothing waiting. Every order is shipped.</td></tr>
              )}
              {toShip.slice(0, 6).map(o => {
                const step = nextManualStep(o.order, shipmentDetails[o.order.id]);
                return (
                  <tr key={o.order.id}>
                    <td className="cust">{o.order.order_number}</td>
                    <td>{shortDate(o.order.created_at)}</td>
                    <td>{o.order.customer_name}<div className="loc">{o.order.city}</div></td>
                    <td>{o.items.map(i => `${i.product_name} × ${i.quantity}`).join(', ')}</td>
                    <td className="num-col strong">{rupees(o.gross)}</td>
                    <td><span className={`chip ${ORDER_CHIP[o.order.status]}`}>{ORDER_STATUS_LABEL[o.order.status]}</span></td>
                    <td>
                      <div className="row-actions">
                        {o.order.status === 'pending' && (
                          <button className="btn-primary btn-small" onClick={() => onOpenConfirm(o.order.id)}>Confirm</button>
                        )}
                        {step && (
                          <>
                            <button className="btn-secondary btn-small" onClick={() => onOpenConfirm(o.order.id)}>View</button>
                            <button className="btn-primary btn-small" onClick={() => onAdvanceStage(o.order.id, step.action)}>{step.label}</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
