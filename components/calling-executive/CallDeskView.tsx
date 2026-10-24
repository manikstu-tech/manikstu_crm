import React, { useState } from 'react';
import { Phone } from 'lucide-react';
import { CALL_TARGET_DAILY, CallOutcome, CustomerResponse, Followup, LeadActivity, TODAY, Telecaller, TrackerLead } from '../../data/managerDashboard';
import { dayStart, pct, shortDateTime } from '../../lib/format';
import { fmtDuration, stageName, time12, verticalName } from '../telecaller/tcData';
import { QUEUE_CHIP, QueueItem } from './queue';

/** One product on a phone order. `key` keeps each row's own state when other rows are added or removed. */
export interface OrderLine {
  key: number;
  productId: number | '';
  quantity: string;
}

/** The order details typed in while the customer is still on the phone (text fields, checked before saving). */
export interface OrderForm {
  items: OrderLine[];
  address: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: 'COD' | 'UPI';
}

let nextLineKey = 1;
export const emptyOrderLine = (): OrderLine => ({ key: nextLineKey++, productId: '', quantity: '1' });

export const emptyOrderForm = (): OrderForm => ({ items: [emptyOrderLine()], address: '', city: '', state: 'Odisha', pincode: '', paymentMethod: 'COD' });

export interface CallForm {
  note: string;
  stageId: number;
  scheduleNext: boolean;
  nextDate: string;
  nextNote: string;
  /** What the customer said: part of the call report, required when the customer was reached. */
  customerResponse: CustomerResponse | '';
  /** Filled in when the customer response is "Placed order". */
  order: OrderForm;
}

interface Props {
  me: Telecaller;
  queue: QueueItem[];
  current: QueueItem | undefined;
  todayCalls: LeadActivity[];
  leadHistory: LeadActivity[];
  handledCount: number;
  callLive: boolean;
  callTimed: boolean;
  elapsedSec: number;
  form: CallForm;
  onFormChange: (patch: Partial<CallForm>) => void;
  onSelect: (leadId: number) => void;
  onStartCall: () => void;
  onEndCall: () => void;
  onSave: (outcome: CallOutcome) => void;
  onSkip: () => void;
  followups: Followup[];
  leads: TrackerLead[];
  onCallFollowup: (leadId: number, followupId: number) => void;
  onFollowupDone: (followupId: number) => void;
}

type FollowupTab = 'Overdue' | 'Due today' | 'Upcoming';
const FOLLOWUP_TABS: FollowupTab[] = ['Overdue', 'Due today', 'Upcoming'];
const FOLLOWUP_CHIP: Record<FollowupTab, string> = { Overdue: 'pending', 'Due today': 'transit', Upcoming: 'confirmed' };

const followupTabOf = (f: Followup): FollowupTab | null => {
  if (f.status === 'done') return null;
  if (f.status === 'missed' || dayStart(f.due_at) < dayStart(TODAY)) return 'Overdue';
  if (f.due_at.startsWith(TODAY)) return 'Due today';
  return 'Upcoming';
};

export default function CallDeskView({
  me,
  queue,
  current,
  todayCalls,
  leadHistory,
  handledCount,
  callLive,
  callTimed,
  elapsedSec,
  form,
  onFormChange,
  onSelect,
  onStartCall,
  onEndCall,
  onSave,
  onSkip,
  followups,
  leads,
  onCallFollowup,
  onFollowupDone,
}: Props) {
  const followupCounts = FOLLOWUP_TABS.reduce(
    (m, t) => ({ ...m, [t]: followups.filter(f => followupTabOf(f) === t).length }),
    {} as Record<FollowupTab, number>
  );
  const [followupTab, setFollowupTab] = useState<FollowupTab>(followupCounts.Overdue > 0 ? 'Overdue' : 'Due today');
  const followupRows = followups
    .filter(f => followupTabOf(f) === followupTab)
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  const leadOf = (id: number) => leads.find(l => l.id === id);

  const connected = todayCalls.filter(a => a.outcome === 'Connected').length;
  const talkSec = todayCalls.reduce((sum, a) => sum + (a.duration_sec ?? 0), 0);
  const remaining = Math.max(0, CALL_TARGET_DAILY - todayCalls.length);
  const onCall = callLive;

  return (
    <>
      <div className="scoreboard">
        <div className="score">
          <div className="num">{todayCalls.length}<small>/ {CALL_TARGET_DAILY}</small></div>
          <div className="label">Calls today · {remaining > 0 ? `${remaining} to go` : 'target reached'}</div>
        </div>
        <div className="score"><div className="num">{connected}</div><div className="label">Connected</div></div>
        <div className="score"><div className="num">{pct(connected, todayCalls.length)}%</div><div className="label">Connect rate</div></div>
        <div className="score"><div className="num">{fmtDuration(talkSec)}</div><div className="label">Talk time today</div></div>
        <div className="score"><div className="num">{handledCount}</div><div className="label">Done this session</div></div>
      </div>

      <div className="ce-desk">
        {/* Queue */}
        <div className="panel ce-queue">
          <div className="panel-head">
            <h2>Call queue</h2>
            <span className="panel-meta">{queue.length} to call</span>
          </div>
          {queue.length === 0 ? (
            <div className="loc">Queue is empty. Every lead due today has been called.</div>
          ) : (
            <ul className="ce-queue-list">
              {queue.map((item, i) => (
                <li key={item.lead.id}>
                  <button
                    className={`ce-queue-item ${current?.lead.id === item.lead.id ? 'active' : ''}`}
                    onClick={() => onSelect(item.lead.id)}
                    disabled={onCall}
                  >
                    <span className="ce-queue-pos">{i + 1}</span>
                    <span className="ce-queue-main">
                      <span className="name">{item.lead.customer_name}</span>
                      <span className="loc">{verticalName(item.lead.vertical_id)} · {stageName(item.lead.stage_id)}</span>
                    </span>
                    <span className={`chip ${QUEUE_CHIP[item.reason]}`}>{item.reason}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Follow-ups */}
        <div className="panel ce-queue">
          <div className="panel-head">
            <h2>Follow-ups</h2>
            <span className="panel-meta">{followupCounts.Overdue + followupCounts['Due today']} due</span>
          </div>
          <div className="filters ce-fu-tabs">
            {FOLLOWUP_TABS.map(t => (
              <button key={t} className={`filter-chip ${followupTab === t ? 'active' : ''}`} onClick={() => setFollowupTab(t)}>
                {t} ({followupCounts[t]})
              </button>
            ))}
          </div>
          {followupRows.length === 0 ? (
            <div className="loc">No {followupTab.toLowerCase()} follow-ups.</div>
          ) : (
            <ul className="ce-queue-list">
              {followupRows.map(f => {
                const lead = leadOf(f.lead_id);
                return (
                  <li key={f.id} className="ce-fu-item">
                    <div className="ce-queue-main">
                      <span className="name">{lead?.customer_name ?? '—'}</span>
                      <span className="loc">{f.note}</span>
                      <span className={`ce-fu-due ${followupTab === 'Overdue' ? 'text-warn' : ''}`}>
                        <span className={`chip ${FOLLOWUP_CHIP[followupTab]}`}>{f.status === 'missed' ? 'Missed' : followupTab}</span>
                        {f.due_at.startsWith(TODAY) ? `Today, ${time12(f.due_at)}` : shortDateTime(f.due_at).split(',')[0]}
                      </span>
                    </div>
                    {lead && (
                      <div className="row-actions ce-fu-actions">
                        <button className="call-btn" onClick={() => onCallFollowup(lead.id, f.id)}><Phone size={12} /> Call</button>
                        <button className="kanban-btn" onClick={() => onFollowupDone(f.id)}>Done</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
