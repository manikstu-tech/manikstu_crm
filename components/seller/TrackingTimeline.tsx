import React from 'react';
import { shortDate, shortDateTime } from '../../lib/format';
import { STAGE_FLOW, STAGE_LABEL, TrackStage, Tracking, stageIndex } from '../telecaller/orderTracking';

const lastAt = (t: Tracking, stage: TrackStage) => t.events.find(e => e.stage === stage)?.at ?? null;

/**
 * An order's delivery progress and tracking history, as the seller sees it on Tracking. Read-only: it shows the
 * Tracking it is given (see sellerTrackingFor, which uses only the order's recorded status changes and the courier
 * details the seller entered), so the Sales page's View details shows exactly what the seller's page shows.
 */
export default function TrackingTimeline({ tracking: t, courierMissing }: {
  tracking: Tracking;
  /** What to say when no courier is recorded ("Not shipped yet", "Courier not recorded"). */
  courierMissing: string;
}) {
  const reached = stageIndex(t.stage);
  return (
    <>
      {t.stage !== 'cancelled' && (
        <section className="od-section">
          <div className="od-label">Delivery tracking</div>
          <div className="od-row">
            <div><div className="loc">Courier</div>{t.courier ?? courierMissing}{t.awb && <div className="loc">AWB {t.awb}</div>}</div>
            <div>
              <div className="loc">{t.stage === 'delivered' ? 'Delivered' : t.expectedIsEstimate ? 'Estimated delivery' : 'Expected delivery'}</div>
              <span className={t.delayed ? 'text-warn' : undefined}>
                {t.stage === 'delivered' ? shortDateTime(lastAt(t, 'delivered')!) : t.expected_at ? shortDate(t.expected_at) : '—'}
                {t.delayed && ' · late'}
              </span>
            </div>
          </div>
          <div className="step-track">
            {STAGE_FLOW.map((s, i) => (
              <div key={s} className={`step ${i < reached ? 'done' : i === reached ? 'now' : ''}`}>
                <span className="step-dot" />
                <span className="step-name">{STAGE_LABEL[s]}</span>
                <span className="step-time">{lastAt(t, s) ? shortDate(lastAt(t, s)!) : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="od-section">
        <div className="od-label">Tracking history</div>
        <ul className="track-timeline">
          {[...t.events].reverse().map((e, i) => (
            <li key={i}>
              <div className="tt-title">{e.text}</div>
              <div className="tt-time">{shortDateTime(e.at)} · {e.place}</div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
