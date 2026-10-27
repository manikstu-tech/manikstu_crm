import React from 'react';
import { Transaction } from '../../data/initialData';
import CardTable from '../CardTable';

interface MonetaryViewProps {
  transactions: Transaction[];
  onApproveTransaction: (txId: string) => void;
}

export default function MonetaryView({ transactions, onApproveTransaction }: MonetaryViewProps) {
  return (
    <>
      <div className="panel money" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Monetary Ledger & Escrow</h2>
          <span className="link">Kharif Season 2026</span>
        </div>
        <div className="money-grid">
          <div>
            <div className="m-num">₹18.6L</div>
            <div className="m-label">Gross Revenue (This Month)</div>
          </div>
          <div>
            <div className="m-num">₹2.1L</div>
            <div className="m-label">Pending Settlements</div>
          </div>
          <div>
            <div className="m-num">₹64K</div>
            <div className="m-label">Franchise Payouts Due</div>
          </div>
          <div>
            <div className="m-num">₹18K</div>
            <div className="m-label">Customer Refunds</div>
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Revenue Trend (Last 6 Months)</h2>
          </div>
          <div className="bar-chart">
            <div className="bc-col">
              <div className="bc-bar" style={{ height: '52%' }}></div>
              <div className="bc-label">Apr</div>
            </div>
            <div className="bc-col">
              <div className="bc-bar" style={{ height: '61%' }}></div>
              <div className="bc-label">May</div>
            </div>
            <div className="bc-col">
              <div className="bc-bar" style={{ height: '58%' }}></div>
              <div className="bc-label">Jun</div>
            </div>
            <div className="bc-col">
              <div className="bc-bar" style={{ height: '70%' }}></div>
              <div className="bc-label">Jul</div>
            </div>
            <div className="bc-col">
              <div className="bc-bar" style={{ height: '64%' }}></div>
              <div className="bc-label">Aug</div>
            </div>
            <div className="bc-col">
              <div className="bc-bar now" style={{ height: '86%' }}></div>
              <div className="bc-label">Sep</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Recent Transactions & Payouts</h2>
          </div>
          <CardTable>
            <table>
              <thead>
                <tr>
                  <th>Transaction Type</th>
                  <th>Party</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.type}</td>
                    <td style={{ fontWeight: 600 }}>{tx.party}</td>
                    <td style={{ fontWeight: 600 }}>₹{tx.amount.toLocaleString()}</td>
                    <td>
                      <span className={`chip ${
                        tx.status === 'Settled' ? 'delivered' :
                        tx.status === 'Processing' ? 'transit' : 'pending'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td>
                      {tx.status === 'Pending' ? (
                        <button
                          className="btn-primary"
                          style={{ padding: '3px 9px', fontSize: 11 }}
                          onClick={() => onApproveTransaction(tx.id)}
                        >
                          Approve Payout
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTable>
        </div>
      </div>
    </>
  );
}
