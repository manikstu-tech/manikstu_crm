import React, { useState } from 'react';
import { Customer } from '../../data/initialData';
import CardTable from '../CardTable';

interface CustomersViewProps {
  customers: Customer[];
  onSelectCustomer: (cust: Customer) => void;
  onOpenAddCustomerModal: () => void;
  initialQuery?: string;
}

export default function CustomersView({
  customers,
  onSelectCustomer,
  onOpenAddCustomerModal,
  initialQuery
}: CustomersViewProps) {
  const [filter, setFilter] = useState<string>('All');
  const [query, setQuery] = useState(initialQuery ?? '');
  const filters = ['All', 'Active', 'New', 'Inactive'];

  const q = query.trim().toLowerCase();
  const filteredCustomers = customers.filter((c) => {
    if (filter !== 'All' && c.status.toLowerCase() !== filter.toLowerCase()) return false;
    if (q && ![c.name, c.phone, c.location].some(v => v.toLowerCase().includes(q))) return false;
    return true;
  });

  const getCount = (st: string) => {
    if (st === 'All') return customers.length;
    return customers.filter((c) => c.status.toLowerCase() === st.toLowerCase()).length;
  };

  const newCount = customers.filter(c => c.status === 'New').length;
  const repeatBuyers = customers.filter(c => c.ordersCount > 1).length;
  const totalOrders = customers.reduce((a, c) => a + c.ordersCount, 0);
  const totalValue = customers.reduce((a, c) => a + c.lifetimeValue, 0);
  const avgOrderValue = totalOrders === 0 ? 0 : Math.round(totalValue / totalOrders);

  return (
    <>
      <div className="scoreboard">
        <div className="score">
          <div className="num">{customers.length.toLocaleString()}</div>
          <div className="label">Total Farmers</div>
        </div>
        <div className="score">
          <div className="num">{newCount}</div>
          <div className="label">New This Month</div>
        </div>
        <div className="score">
          <div className="num">{repeatBuyers}</div>
          <div className="label">Repeat Buyers</div>
        </div>
        <div className="score">
          <div className="num">₹{avgOrderValue.toLocaleString()}</div>
          <div className="label">Avg. Order Value</div>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="filters date-chips">
          {filters.map((f) => (
            <button
              key={f}
              className={`filter-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f} ({getCount(f)})
            </button>
          ))}
        </div>
        {/* Phones: the status filters become one dropdown. */}
        <select className="filter-select phone-select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Customer status">
          {filters.map(f => <option key={f} value={f}>{f} ({getCount(f)})</option>)}
        </select>
        <button className="btn-primary" onClick={onOpenAddCustomerModal}>
          + Add Farmer Profile
        </button>
      </div>

      <div className="filter-row">
        <input
          className="filter-input"
          type="search"
          placeholder="Search farmer name, phone, location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="panel">
        <CardTable>
          <table>
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Location</th>
                <th>Total Orders</th>
                <th>Lifetime Value</th>
                <th>Last Order</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 0' }}>
                    No farmers match these filters.
                  </td>
                </tr>
              )}
              {filteredCustomers.map((cust) => (
                <tr key={cust.id}>
                  <td className="cust">
                    {cust.name}
                    <div className="loc">{cust.phone}</div>
                  </td>
                  <td>{cust.location}</td>
                  <td style={{ fontWeight: 600 }}>{cust.ordersCount}</td>
                  <td style={{ fontWeight: 600 }}>₹{cust.lifetimeValue.toLocaleString()}</td>
                  <td style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>{cust.lastOrder}</td>
                  <td>
                    <span className={`chip ${
                      cust.status === 'Active' ? 'delivered' :
                      cust.status === 'New' ? 'transit' : 'pending'
                    }`}>
                      {cust.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="view-btn"
                      title="View Farm Details"
                      onClick={() => onSelectCustomer(cust)}
                    >
                      👁
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
      </div>
    </>
  );
}
