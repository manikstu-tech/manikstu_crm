import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { SALES_ORDERS, SalesOrder, TELECALLERS, TODAY, WebEnquiry } from '../../data/managerDashboard';
import { Complaint } from '../../data/complaints';
import { rupees, shortDate, shortDateTime } from '../../lib/format';
import { ExportFormat, ExportTable, exportTable, exportWorkbook } from '../../lib/export';
import { districtFor, stateFor } from '../../lib/regions';
import ExportMenu from '../ExportMenu';
import { allExecMetrics } from '../views/telecallingMetrics';
import { PRIORITY_LABEL, STATUS_LABEL as COMPLAINT_STATUS, assigneeName, deadlineText } from './complaintsUtil';
import { STOCK_LABEL, stockRows } from './inventoryUtil';
import { STAGE_LABEL, trackingFor } from './orderTracking';
import DateRangeSelect from '../DateRangeSelect';
import {
  PERIOD_LABEL, Period, TeamData, callerName, fmtDuration, inPeriod, isOpenLead, isOverdue, lastCallFor, productName, productOf, stageName, verticalName,
} from './tcData';

interface Report {
  key: string;
  group: 'Team' | 'Sales & orders' | 'Support';
  title: string;
  description: string;
  /** Uses the period filter (otherwise it's a snapshot of now). */
  periodic: boolean;
  /** Uses the executive filter. */
  perExecutive: boolean;
  table: ExportTable;
}

interface Props {
  data: TeamData;
  /** Orders to report on: the live ones from the CRM when connected, otherwise the offline sample. */
  orders?: SalesOrder[];
  complaints: Complaint[];
  enquiries: WebEnquiry[];
  headName: string;
  onToast: (message: string) => void;
}

/** Every telecalling report in one place, each downloadable as Excel or PDF, or all together. */
export default function TeamReports({ data, orders: orderList = SALES_ORDERS, complaints, enquiries, headName, onToast }: Props) {
  const [period, setPeriod] = useState<Period>('month');
  const [caller, setCaller] = useState<number | 'all'>('all');
  const mine = (id: number | null) => caller === 'all' || id === caller;
  const scope = `${PERIOD_LABEL[period]}${caller === 'all' ? '' : ` · ${callerName(caller)}`}`;
  const stamp = `exported ${shortDate(TODAY)}`;
  const file = (name: string) => `${name}-${period}${caller === 'all' ? '' : `-${callerName(caller).split(' ')[0].toLowerCase()}`}-${TODAY}`;

  const reports: Report[] = useMemo(() => {
    const leadOf = (id: number) => data.leads.find(l => l.id === id);
    const tracked = orderList.map(o => ({ o, t: trackingFor(o) }));

    // ---- Team -------------------------------------------------------------------------
    const perf = allExecMetrics(data, period).filter(m => mine(m.t.id));
    const calls = data.activities.filter(a => inPeriod(a.created_at, period) && mine(a.caller_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const leads = data.leads.filter(l => mine(l.assigned_to)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const followups = data.followups.filter(f => mine(f.caller_id) && (f.status !== 'done' ? true : inPeriod(f.completed_at ?? f.due_at, period)))
      .sort((a, b) => a.due_at.localeCompare(b.due_at));

    // ---- Sales & orders ---------------------------------------------------------------
    const sales = data.sales.filter(s => inPeriod(s.sold_at, period) && mine(s.caller_id)).sort((a, b) => b.sold_at.localeCompare(a.sold_at));
    const orders = tracked.filter(({ o }) => inPeriod(o.created_at, period) && (caller === 'all' || o.caller_id === caller));
    const districts = Array.from(orders.reduce((m, { o }) => {
      const key = `${stateFor(o.state, o.pincode)}|${districtFor(o.state, o.pincode, o.city)}`;
      const r = m.get(key) ?? { orders: 0, revenue: 0, farmers: new Set<string>(), delivered: 0, cod: 0 };
      r.orders++;
      if (o.status !== 'cancelled') r.revenue += o.total;
      r.farmers.add(o.phone);
      if (o.status === 'delivered') r.delivered++;
      if (o.payment_method === 'COD' && o.payment_status === 'unpaid' && o.status !== 'cancelled') r.cod += o.total;
      return m.set(key, r);
    }, new Map<string, { orders: number; revenue: number; farmers: Set<string>; delivered: number; cod: number }>()))
      .sort((a, b) => b[1].revenue - a[1].revenue);
    const stock = stockRows(tracked, complaints);

    // ---- Support ----------------------------------------------------------------------
    const comps = complaints.filter(c => inPeriod(c.created_at, period) && (caller === 'all' || c.assigned_to === caller))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const enqs = enquiries.filter(e => inPeriod(e.created_at, period)).sort((a, b) => b.created_at.localeCompare(a.created_at));

    return [
      {
        key: 'performance', group: 'Team', title: 'Team performance', periodic: true, perExecutive: true,
        description: 'One row per executive: calls, connect rate, talk time, leads, follow-ups, sales, revenue and conversion.',
        table: {
          filename: file('team-performance'), title: 'Team performance', subtitle: `${scope} · ${stamp}`,
          columns: [
            { header: 'Executive', width: 18 }, { header: 'Region', width: 12 }, { header: 'Status', width: 9 }, { header: 'Calls', width: 7 },
            { header: 'Connected', width: 9 }, { header: 'Connect %', width: 9 }, { header: 'Avg talk', width: 9 }, { header: 'Leads called', width: 9 },
            { header: 'Open leads', width: 9 }, { header: 'Overdue follow-ups', width: 10 }, { header: 'Follow-ups kept %', width: 10 },
            { header: 'Sales', width: 7 }, { header: 'Revenue', width: 11, money: true }, { header: 'Conversion %', width: 10 },
          ],
          rows: perf.map(m => [
            m.t.name, m.t.region, m.t.is_active ? 'Active' : 'Inactive', m.calls, m.connected, m.connectRate, fmtDuration(m.avgTalkSec),
            m.leadsWorked, m.openLeads, m.overdue, m.keptRate ?? '—', m.sales, m.revenue, m.conversion,
          ]),
        },
      },
      {
        key: 'calls', group: 'Team', title: 'Call log', periodic: true, perExecutive: true,
        description: 'Every call: when, who called, which lead, outcome, talk time, status after the call and the note.',
        table: {
          filename: file('call-log'), title: 'Call log', subtitle: `${scope} · ${calls.length} calls · ${stamp}`,
          columns: [
            { header: 'When', width: 14 }, { header: 'Executive', width: 16 }, { header: 'Lead', width: 18 }, { header: 'Phone', width: 12 },
            { header: 'Outcome', width: 12 }, { header: 'Talk time', width: 9 }, { header: 'Status after call', width: 14 }, { header: 'Note', width: 34 },
          ],
          rows: calls.map(a => {
            const l = leadOf(a.lead_id);
            return [shortDateTime(a.created_at), callerName(a.caller_id), l?.customer_name ?? '—', l?.phone ?? '', a.outcome,
              fmtDuration(a.duration_sec), a.stage_id ? stageName(a.stage_id) : '', a.note];
          }),
        },
      },
      {
        key: 'leads', group: 'Team', title: 'Leads', periodic: false, perExecutive: true,
        description: 'Every lead as of now: product line, status, who has it, source, last call and next follow-up.',
        table: {
          filename: file('leads'), title: 'Leads', subtitle: `${caller === 'all' ? 'All executives' : callerName(caller)} · ${leads.length} leads · as of ${stamp}`,
          columns: [
            { header: 'Lead', width: 18 }, { header: 'Phone', width: 12 }, { header: 'Product line', width: 18 }, { header: 'Status', width: 12 },
            { header: 'Open', width: 6 }, { header: 'Assigned to', width: 16 }, { header: 'Source', width: 12 }, { header: 'Added', width: 10 },
            { header: 'Last call', width: 14 }, { header: 'Last outcome', width: 12 }, { header: 'Next follow-up', width: 13 },
          ],
          rows: leads.map(l => {
            const last = lastCallFor(l.id, data.activities);
            const next = data.followups.filter(f => f.lead_id === l.id && f.status !== 'done').sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
            return [l.customer_name, l.phone, verticalName(l.vertical_id), stageName(l.stage_id), isOpenLead(l) ? 'Yes' : 'No',
              callerName(l.assigned_to), l.source, shortDate(l.created_at), last ? shortDateTime(last.created_at) : 'Never',
              last?.outcome ?? '', next ? shortDate(next.due_at) : ''];
          }),
        },
      },
      {
        key: 'followups', group: 'Team', title: 'Follow-ups', periodic: true, perExecutive: true,
        description: 'All pending and overdue callbacks, plus the ones done in the period.',
        table: {
          filename: file('follow-ups'), title: 'Follow-ups', subtitle: `${scope} · ${followups.length} follow-ups · ${stamp}`,
          columns: [
            { header: 'Due', width: 12 }, { header: 'Executive', width: 16 }, { header: 'Lead', width: 18 }, { header: 'Phone', width: 12 },
            { header: 'Reason', width: 28 }, { header: 'Status', width: 10 }, { header: 'Done on', width: 13 },
          ],
          rows: followups.map(f => {
            const l = leadOf(f.lead_id);
            return [shortDateTime(f.due_at), callerName(f.caller_id), l?.customer_name ?? '—', l?.phone ?? '', f.note,
              f.status === 'done' ? 'Done' : isOverdue(f) ? 'Overdue' : 'Pending', f.completed_at ? shortDateTime(f.completed_at) : ''];
          }),
        },
      },
      {
        key: 'sales', group: 'Sales & orders', title: 'Telecalling sales', periodic: true, perExecutive: true,
        description: 'Sales made by the telecalling team: date, executive, customer, product, quantity and amount.',
        table: {
          filename: file('telecalling-sales'), title: 'Telecalling sales',
          subtitle: `${scope} · ${sales.length} sales · ${rupees(sales.reduce((a, s) => a + s.amount, 0))} · ${stamp}`,
          columns: [
            { header: 'Date', width: 10 }, { header: 'Executive', width: 16 }, { header: 'Customer', width: 18 }, { header: 'Product', width: 22 },
            { header: 'Product line', width: 18 }, { header: 'Qty', width: 6 }, { header: 'Amount', width: 11, money: true },
          ],
          rows: sales.map(s => [shortDate(s.sold_at), callerName(s.caller_id), s.customer_name, productName(s.product_id),
            verticalName(productOf(s.product_id)?.vertical_id ?? 0), s.quantity, s.amount]),
        },
      },
      {
        key: 'orders', group: 'Sales & orders', title: 'Orders & tracking', periodic: true, perExecutive: true,
        description: 'Orders placed in the period with products, payment, delivery stage, courier and tracking number.',
        table: {
          filename: file('orders-tracking'), title: 'Orders & tracking', subtitle: `${scope} · ${orders.length} orders · ${stamp}`,
          columns: [
            { header: 'Order', width: 12 }, { header: 'Date', width: 10 }, { header: 'Customer', width: 18 }, { header: 'Phone', width: 12 },
            { header: 'Town', width: 12 }, { header: 'Products', width: 28 }, { header: 'Sold by', width: 14 }, { header: 'Amount', width: 10, money: true },
            { header: 'Payment', width: 13 }, { header: 'Delivery', width: 13 }, { header: 'Courier', width: 10 }, { header: 'AWB', width: 15 },
          ],
          rows: orders.map(({ o, t }) => [
            o.order_number, shortDate(o.created_at), o.customer_name, o.phone, o.city, o.items.map(i => `${i.product_name} × ${i.quantity}`).join(', '),
            o.caller_id === null ? 'Website' : callerName(o.caller_id), o.total, `${o.payment_method} · ${o.payment_status}`,
            `${STAGE_LABEL[t.stage]}${t.delayed ? ' (late)' : ''}`, t.courier ?? '', t.awb ?? '',
          ]),
        },
      },
      {
        key: 'regional', group: 'Sales & orders', title: 'Regional summary', periodic: true, perExecutive: true,
        description: 'Orders by state and district: orders, revenue, farmers, delivered and cash still to collect.',
        table: {
          filename: file('regional-summary'), title: 'Regional summary', subtitle: `${scope} · ${districts.length} districts · district from PIN code · ${stamp}`,
          columns: [
            { header: 'State', width: 14 }, { header: 'District / town', width: 16 }, { header: 'Orders', width: 8 }, { header: 'Revenue', width: 11, money: true },
            { header: 'Farmers', width: 8 }, { header: 'Delivered', width: 9 }, { header: 'COD to collect', width: 12, money: true },
          ],
          rows: districts.map(([key, r]) => {
            const [state, district] = key.split('|');
            return [state, district, r.orders, r.revenue, r.farmers.size, r.delivered, r.cod];
          }),
        },
      },
      {
        key: 'stock', group: 'Sales & orders', title: 'Stock', periodic: false, perExecutive: false,
        description: 'Every product as of now: in stock, reserved, available, sold in 30 days, days left and orders waiting.',
        table: {
          filename: `stock-${TODAY}`, title: 'Stock', subtitle: `${stock.length} products · as of ${stamp}`,
          columns: [
            { header: 'Product', width: 22 }, { header: 'Size', width: 9 }, { header: 'Price', width: 9, money: true }, { header: 'In stock', width: 8 },
            { header: 'Reserved', width: 8 }, { header: 'Available', width: 9 }, { header: 'Sold 30d', width: 8 }, { header: 'Days left', width: 9 },
            { header: 'Status', width: 11 }, { header: 'Orders waiting', width: 10 },
          ],
          rows: stock.map(r => [r.p.name, r.p.size, r.p.price, r.stock, r.reserved, r.available, r.sold30,
            r.daysLeft === null ? 'not selling' : r.daysLeft, STOCK_LABEL[r.status], r.waiting.length]),
        },
      },
      {
        key: 'complaints', group: 'Support', title: 'Complaints', periodic: true, perExecutive: true,
        description: 'Complaints raised in the period: customer, issue, priority, status, who has it, deadline and resolution.',
        table: {
          filename: file('complaints'), title: 'Complaints', subtitle: `${scope} · ${comps.length} complaints · ${stamp}`,
          columns: [
            { header: 'Ticket', width: 11 }, { header: 'Raised', width: 13 }, { header: 'Customer', width: 18 }, { header: 'Phone', width: 12 },
            { header: 'Order', width: 12 }, { header: 'Category', width: 16 }, { header: 'Issue', width: 30 }, { header: 'Priority', width: 9 },
            { header: 'Status', width: 12 }, { header: 'Assigned to', width: 16 }, { header: 'Deadline', width: 14 }, { header: 'Resolution', width: 14 },
            { header: 'Refund', width: 10, money: true },
          ],
          rows: comps.map(c => [
            c.ticket, shortDateTime(c.created_at), c.customer_name, c.phone, c.order_number ?? '', c.category, c.description,
            PRIORITY_LABEL[c.priority], COMPLAINT_STATUS[c.status], assigneeName(c.assigned_to, headName), deadlineText(c).text,
            c.resolution_type ?? '', c.refund_amount,
          ]),
        },
      },
      {
        key: 'enquiries', group: 'Support', title: 'Website enquiries', periodic: true, perExecutive: false,
        description: 'Enquiries received in the period: contact, type, message, status, reply and the lead / caller it went to.',
        table: {
          filename: `enquiries-${period}-${TODAY}`, title: 'Website enquiries', subtitle: `${PERIOD_LABEL[period]} · ${enqs.length} enquiries · ${stamp}`,
          columns: [
            { header: 'Received', width: 14 }, { header: 'Name', width: 18 }, { header: 'Email', width: 24 }, { header: 'Phone', width: 12 },
            { header: 'Type', width: 11 }, { header: 'Message', width: 40 }, { header: 'Status', width: 10 }, { header: 'Replied', width: 13 },
            { header: 'Lead / caller', width: 18 },
          ],
          rows: enqs.map(e => {
            const lead = (e.lead_id !== null ? leadOf(e.lead_id) : undefined) ?? (e.phone ? data.leads.find(l => l.phone === e.phone) : undefined);
            return [shortDateTime(e.created_at), e.name, e.email, e.phone ?? '', e.type, e.message, e.status,
              e.replied_at ? shortDateTime(e.replied_at) : '', lead ? `#${lead.id} · ${callerName(lead.assigned_to)}` : ''];
          }),
        },
      },
    ];
  }, [data, orderList, complaints, enquiries, period, caller, headName]);

  const download = async (r: Report, format: ExportFormat) => {
    if (r.table.rows.length === 0) { onToast(`Nothing in "${r.title}" for these filters`); return; }
    try {
      await exportTable(format, r.table);
      onToast(`${r.title} downloaded as ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } catch {
      onToast('Download failed. Please try again.');
    }
  };

  const downloadAll = async () => {
    try {
      await exportWorkbook(file('telecalling-reports'), reports.filter(r => r.table.rows.length > 0).map(r => ({ name: r.title, table: r.table })));
      onToast('All reports downloaded as one Excel file (one sheet per report)');
    } catch {
      onToast('Download failed. Please try again.');
    }
  };

  return (
    <>
      <div className="page-toolbar reports-toolbar">
        <div className="filters date-chips">
          {(['today', '7d', 'month'] as Period[]).map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
          ))}
        </div>
        {/* Phones: the period buttons become a single calendar dropdown. */}
        <DateRangeSelect phoneOnly className="toolbar-date" label="Period" value={period} onChange={p => setPeriod(p)}
          options={(['today', '7d', 'month'] as Period[]).map(p => ({ value: p, label: PERIOD_LABEL[p] }))} />
        <div className="toolbar-actions">
          <select className="filter-select" value={caller} onChange={e => setCaller(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Executive">
            <option value="all">All executives</option>
            {TELECALLERS.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? '' : ' (inactive)'}</option>)}
          </select>
          <button className="btn-primary download-all" onClick={downloadAll}><Download size={15} /> Download all (Excel)</button>
        </div>
      </div>

      {/* Same card design as the manager's Reports & Analytics page */}
      <div className="report-grid">
        {reports.map(r => (
          <div key={r.key} className="report-card">
            <h3>{r.title}</h3>
            <div className="rdesc">{r.description}</div>
            <div className="rmeta">
              <ExportMenu onExport={format => download(r, format)} label="Download" />
              <span className="rgen">
                {r.table.rows.length} {r.table.rows.length === 1 ? 'row' : 'rows'} · {r.periodic ? PERIOD_LABEL[period].toLowerCase() : 'as of now'}
                {caller !== 'all' && !r.perExecutive ? ' · whole team' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="panel-note" style={{ marginTop: 16 }}>
        Generated from live dashboard data. Each report downloads as Excel or PDF with the filters above; &quot;Download all&quot; gives one Excel file with a sheet per report.
      </div>
    </>
  );
}
