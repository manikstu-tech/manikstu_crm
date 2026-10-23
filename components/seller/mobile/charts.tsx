'use client';

// Small, dependency-free charts for the phone app. Each has a text summary for screen readers.

import React, { useMemo, useRef, useState } from 'react';

export interface BarPoint {
  key: string;
  /** Axis label (shown for some bars). */
  label: string;
  value: number;
  /** Text for the reading line when this bar is picked. */
  detail: string;
}

/**
 * Vertical bars (a day or week each). Tap or drag across the chart, or use the arrow keys,
 * to read a bar; the reading line above the chart says its value.
 */
export function BarChart({ points, highlightKey, ariaLabel, height = 128, labelEvery = 5, formatMax }: {
  points: BarPoint[];
  /** Bar drawn in the accent colour (e.g. today). */
  highlightKey?: string;
  ariaLabel: string;
  height?: number;
  labelEvery?: number;
  formatMax?: (n: number) => string;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const defaultIdx = Math.max(0, highlightKey ? points.findIndex(p => p.key === highlightKey) : points.length - 1);
  const [sel, setSel] = useState<number | null>(null);
  const idx = sel ?? defaultIdx;
  const max = Math.max(1, ...points.map(p => p.value));
  const pick = (clientX: number) => {
    const el = plotRef.current;
    if (!el || points.length === 0) return;
    const r = el.getBoundingClientRect();
    const i = Math.min(points.length - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * points.length)));
    setSel(i);
  };
  const current = points[idx];

  return (
    <figure className="sx-chart">
      <figcaption className="sx-chart-reading" aria-live="polite">{current ? current.detail : 'No data'}</figcaption>
      <div className="sx-chart-wrap">
        {formatMax && <span className="sx-chart-max" aria-hidden>{formatMax(max)}</span>}
        <div
          ref={plotRef}
          className="sx-chart-plot"
          style={{ height }}
          role="group"
          aria-label={`${ariaLabel}. Use the left and right arrow keys to read each bar.`}
          tabIndex={0}
          onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); pick(e.clientX); }}
          onPointerMove={e => { if (e.buttons > 0 || e.pointerType === 'mouse') pick(e.clientX); }}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); setSel(Math.max(0, idx - 1)); }
            if (e.key === 'ArrowRight') { e.preventDefault(); setSel(Math.min(points.length - 1, idx + 1)); }
            if (e.key === 'Home') { e.preventDefault(); setSel(0); }
            if (e.key === 'End') { e.preventDefault(); setSel(points.length - 1); }
          }}
        >
          {points.map((p, i) => (
            <span key={p.key} className={`sx-bar ${p.key === highlightKey ? 'sx-bar-now' : ''} ${i === idx ? 'sx-bar-sel' : ''}`}>
              <span style={{ height: `${p.value > 0 ? Math.max(3, (p.value / max) * 100) : 0}%` }} />
            </span>
          ))}
        </div>
        <div className="sx-chart-x" aria-hidden>
          {points.map((p, i) => (
            <span key={p.key}>{i % labelEvery === labelEvery - 1 || i === points.length - 1 || p.key === highlightKey ? p.label : ''}</span>
          ))}
        </div>
      </div>
      {/* A table ignores the 1px hidden box, so the wrapper is what hides it. */}
      <div className="sx-visually-hidden">
        <table>
          <caption>{ariaLabel}</caption>
          <tbody>{points.map(p => <tr key={p.key}><td>{p.detail}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}

/** Decorative mini bars (the figures are given in words next to them). */
export function Spark({ values, highlightLast = true }: { values: number[]; highlightLast?: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <span className="sx-spark" aria-hidden>
      {values.map((v, i) => (
        <span key={i} className={highlightLast && i === values.length - 1 ? 'sx-spark-now' : ''} style={{ height: `${v > 0 ? Math.max(8, (v / max) * 100) : 4}%` }} />
      ))}
    </span>
  );
}

export interface HBarRow {
  key: string;
  label: string;
  value: number;
  display: string;
  sub?: string;
  lead?: React.ReactNode;
}

/** Horizontal bars, largest first. With onSelect each row is a button (e.g. filter by district). */
export function HBars({ rows, onSelect, selectedKey, ariaLabel }: { rows: HBarRow[]; onSelect?: (key: string) => void; selectedKey?: string; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ul className="sx-hbars" aria-label={ariaLabel}>
      {rows.map(r => {
        const body = (
          <>
            {r.lead}
            <span className="sx-hbar-main">
              <span className="sx-hbar-top">
                <span className="sx-hbar-label">{r.label}</span>
                <span className="sx-hbar-value">{r.display}</span>
              </span>
              <span className="sx-hbar-track" aria-hidden><span style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></span>
              {r.sub && <span className="sx-hbar-sub">{r.sub}</span>}
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {onSelect ? (
              <button type="button" className={`sx-hbar ${selectedKey === r.key ? 'sx-hbar-selected' : ''}`} aria-pressed={selectedKey === r.key} onClick={() => onSelect(r.key)}>{body}</button>
            ) : (
              <div className="sx-hbar">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface StackPart { key: string; label: string; value: number; tone: 'forest' | 'leaf' | 'amber' | 'coral' | 'muted' | 'sage' }

/** One bar split into parts (e.g. orders by status), with a legend. */
export function StackBar({ parts, ariaLabel }: { parts: StackPart[]; ariaLabel: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = useMemo(() => parts.filter(p => p.value > 0), [parts]);
  return (
    <div className="sx-stack">
      <div className="sx-stack-bar" role="img" aria-label={`${ariaLabel}: ${shown.map(p => `${p.label} ${p.value}`).join(', ') || 'none'}`}>
        {total === 0 ? <span className="sx-stack-empty" /> : shown.map(p => <span key={p.key} className={`sx-stack-${p.tone}`} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="sx-legend">
        {parts.map(p => (
          <li key={p.key}><i className={`sx-stack-${p.tone}`} aria-hidden />{p.label}<strong>{p.value}</strong></li>
        ))}
      </ul>
    </div>
  );
}
