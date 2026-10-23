'use client';

// Building blocks of the seller phone app. Styling: app/seller/seller-app.css (sx-* classes).

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Loader2, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CatalogProduct } from '../../../data/catalogProducts';
import type { OrderStatus } from '../../../data/managerDashboard';
import { AppLink, useSheetHistory } from '../app/nav';

/* ---------- Status chips ---------- */

export type Tone = 'new' | 'confirmed' | 'packed' | 'transit' | 'delivered' | 'muted' | 'late' | 'warn' | 'info' | 'success' | 'danger';

export function Chip({ tone = 'muted', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return <span className={`sx-chip sx-chip-${tone}`} title={title}>{children}</span>;
}

export const ORDER_TONE: Record<OrderStatus, Tone> = {
  pending: 'new',
  confirmed: 'confirmed',
  ready_for_dispatch: 'packed',
  shipped: 'transit',
  delivered: 'delivered',
  rejected: 'muted',
  cancelled: 'muted',
};

/* ---------- Buttons ---------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'danger-solid' | 'ghost' | 'soft';
  size?: 'md' | 'sm' | 'lg';
  block?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
};

export function Btn({ variant = 'primary', size = 'md', block, busy, icon: Icon, children, className = '', disabled, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={`sx-btn sx-btn-${variant} sx-btn-${size} ${block ? 'sx-btn-block' : ''} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Loader2 className="sx-spin" size={16} aria-hidden /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} aria-hidden /> : null}
      <span>{children}</span>
    </button>
  );
}

/** A button-styled link to a seller screen. */
export function BtnLink({ href, variant = 'secondary', size = 'md', block, icon: Icon, children }: { href: string; variant?: BtnProps['variant']; size?: BtnProps['size']; block?: boolean; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <AppLink href={href} className={`sx-btn sx-btn-${variant} sx-btn-${size} ${block ? 'sx-btn-block' : ''}`}>
      {Icon && <Icon size={size === 'sm' ? 15 : 17} aria-hidden />}
      <span>{children}</span>
    </AppLink>
  );
}

/* ---------- Layout ---------- */

export function Card({ children, className = '', as: As = 'section', ...rest }: { children: React.ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return <As className={`sx-card ${className}`} {...rest}>{children}</As>;
}

export function SectionHead({ title, meta, action, id }: { title: string; meta?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="sx-section-head">
      <div>
        <h2 id={id}>{title}</h2>
        {meta && <div className="sx-section-meta">{meta}</div>}
      </div>
      {action}
    </div>
  );
}

export function PageIntro({ children }: { children: React.ReactNode }) {
  return <p className="sx-page-intro">{children}</p>;
}

/* ---------- Filter chips ---------- */

export interface SegOption<K extends string> { key: K; label: string; count?: number; tone?: 'warn' }

export function Segmented<K extends string>({ options, value, onChange, label }: { options: SegOption<K>[]; value: K; onChange: (k: K) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the chosen chip in view when the row scrolls sideways.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  return (
    <div className="sx-seg" role="group" aria-label={label} ref={ref}>
      {options.map(o => (
        <button key={o.key} type="button" className={`sx-seg-btn ${o.tone === 'warn' && o.count ? 'sx-seg-warn' : ''}`} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
          {o.count !== undefined && <span className="sx-seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Search ---------- */

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const id = useId();
  return (
    <form className="sx-search" role="search" onSubmit={e => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }}>
      <label htmlFor={id} className="sx-visually-hidden">{label}</label>
      <Search size={18} aria-hidden className="sx-search-icon" />
      <input id={id} type="search" enterKeyHint="search" autoComplete="off" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      {value && (
        <button type="button" className="sx-search-clear" onClick={() => onChange('')} aria-label="Clear search"><X size={16} aria-hidden /></button>
      )}
    </form>
  );
}

/* ---------- Empty / info states ---------- */

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="sx-empty" role="status">
      <span className="sx-empty-icon" aria-hidden><Icon size={26} /></span>
      <p className="sx-empty-title">{title}</p>
      {children && <p className="sx-empty-text">{children}</p>}
      {action && <div className="sx-empty-action">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', icon: Icon, children, action }: { tone?: 'info' | 'warn' | 'danger' | 'success'; icon?: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`sx-notice sx-notice-${tone}`}>
      {Icon && <Icon size={18} aria-hidden className="sx-notice-icon" />}
      <div className="sx-notice-body">{children}</div>
      {action}
    </div>
  );
}

/* ---------- Metric tiles ---------- */

export function Metric({ icon: Icon, label, value, sub, tone, href, onClick, pressed }: {
  icon?: LucideIcon; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'warn' | 'danger' | 'good';
  href?: string; onClick?: () => void; pressed?: boolean;
}) {
  const body = (
    <>
      {Icon && <Icon size={18} aria-hidden className="sx-metric-icon" />}
      <span className="sx-metric-value">{value}</span>
      <span className="sx-metric-label">{label}</span>
      {sub && <span className={`sx-metric-sub ${tone ? `sx-tone-${tone}` : ''}`}>{sub}</span>}
    </>
  );
  if (href) return <AppLink href={href} className="sx-metric sx-metric-link">{body}</AppLink>;
  if (onClick) return <button type="button" className="sx-metric sx-metric-link" aria-pressed={pressed} onClick={onClick}>{body}</button>;
  return <div className="sx-metric">{body}</div>;
}

/* ---------- Lists ---------- */

export function ListRow({ icon: Icon, label, sub, href, onClick, badge, danger, trailing }: {
  icon?: LucideIcon; label: string; sub?: React.ReactNode; href?: string; onClick?: () => void; badge?: number; danger?: boolean; trailing?: React.ReactNode;
}) {
  const inner = (
    <>
      {Icon && <span className={`sx-row-icon ${danger ? 'sx-row-icon-danger' : ''}`} aria-hidden><Icon size={19} /></span>}
      <span className="sx-row-text">
        <span className="sx-row-label">{label}</span>
        {sub && <span className="sx-row-sub">{sub}</span>}
      </span>
      {badge !== undefined && badge > 0 && <span className="sx-badge" aria-label={`${badge} new`}>{badge}</span>}
      {trailing ?? ((href || onClick) && !danger ? <ChevronRight size={18} aria-hidden className="sx-row-chev" /> : null)}
    </>
  );
  if (href) return <AppLink href={href} className={`sx-row ${danger ? 'sx-row-danger' : ''}`}>{inner}</AppLink>;
  if (onClick) return <button type="button" className={`sx-row ${danger ? 'sx-row-danger' : ''}`} onClick={onClick}>{inner}</button>;
  return <div className="sx-row">{inner}</div>;
}

/* ---------- Product picture ---------- */

export function ProductThumb({ product, name, size = 48 }: { product?: CatalogProduct | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = product?.image || product?.images?.[0] || '';
  const style = { width: size, height: size };
  if (!src || broken) {
    return <span className="sx-thumb sx-thumb-ph" style={style} aria-hidden>{name.trim().charAt(0).toUpperCase() || '?'}</span>;
  }
  return <img className="sx-thumb" style={style} src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

/* ---------- Relative time ---------- */

export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function agoText(ms: number | null, now: number): string {
  if (ms === null) return 'not yet';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

/* ---------- Bottom sheet ---------- */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open sheets, newest last: only the top one answers Escape and keeps Tab inside it.
const sheetStack: string[] = [];

/**
 * A dialog that slides up from the bottom. Focus stays inside it, Escape and the back button close it,
 * the page behind does not scroll, and it moves above the on-screen keyboard.
 */
export function Sheet({ open, onClose, title, children, footer, full, busy, describedBy, initialFocus }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Take (nearly) the whole screen, for long forms. */
  full?: boolean;
  /** While saving, the sheet cannot be dismissed. */
  busy?: boolean;
  describedBy?: string;
  /** CSS selector of the element to focus first (default: the first field, else the sheet). */
  initialFocus?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const requestClose = () => { if (!busyRef.current) onCloseRef.current(); };

  useEffect(() => setMounted(true), []);
  useSheetHistory(open, () => onCloseRef.current());

  // Focus in, focus trap, Escape, scroll lock, restore focus.
  useLayoutEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = (initialFocus && panel?.querySelector<HTMLElement>(initialFocus)) || panel?.querySelector<HTMLElement>('input:not([readonly]):not([type="hidden"]):not([type="file"]), textarea, select');
    // Don't pop the keyboard up uninvited on touch screens: focus the dialog itself there.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    (first && !coarse ? first : panel)?.focus({ preventScroll: true });

    sheetStack.push(titleId);
    // Tell the app a sheet opened, so a message about an earlier action doesn't sit over it.
    window.dispatchEvent(new Event('sx-sheet-open'));
    const html = document.documentElement;
    html.classList.add('sx-locked');

    const onKey = (e: KeyboardEvent) => {
      if (sheetStack[sheetStack.length - 1] !== titleId) return;
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); return; }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === panel)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey, true);

    // Keep the sheet above the on-screen keyboard (iOS does not resize the layout viewport).
    const vv = window.visualViewport;
    const onViewport = () => {
      if (!vv || !panel) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      panel.style.setProperty('--sx-kb', `${inset}px`);
    };
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    onViewport();

    return () => {
      document.removeEventListener('keydown', onKey, true);
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      const at = sheetStack.lastIndexOf(titleId);
      if (at >= 0) sheetStack.splice(at, 1);
      if (sheetStack.length === 0) html.classList.remove('sx-locked');
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !mounted) return null;
  return createPortal(
    <div className="sx sx-sheet-layer">
      <div className="sx-sheet-backdrop" onClick={requestClose} aria-hidden />
      <div
        ref={panelRef}
        className={`sx-sheet ${full ? 'sx-sheet-full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        <div className="sx-sheet-grip" aria-hidden />
        <div className="sx-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="sx-icon-btn" onClick={requestClose} aria-label="Close" disabled={busy}><X size={20} aria-hidden /></button>
        </div>
        <div className="sx-sheet-body">{children}</div>
        {footer && <div className="sx-sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** "Are you sure?" sheet for important or destructive steps. */
export function ConfirmSheet({ open, title, message, confirmLabel, danger, busy, onConfirm, onClose, children }: {
  open: boolean; title: string; message: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void; children?: React.ReactNode;
}) {
  const msgId = useId();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      busy={busy}
      describedBy={msgId}
      footer={
        <div className="sx-actions">
          <Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant={danger ? 'danger-solid' : 'primary'} onClick={onConfirm} busy={busy}>{confirmLabel}</Btn>
        </div>
      }
    >
      <div id={msgId} className="sx-confirm-msg">{message}</div>
      {children}
    </Sheet>
  );
}

/* ---------- Misc ---------- */

export function KeyVal({ k, v, strong }: { k: React.ReactNode; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`sx-kv ${strong ? 'sx-kv-strong' : ''}`}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Shows `count` items of a long list, with a button for more. */
export function useShowMore<T>(items: T[], step = 20, resetKey?: unknown): { shown: T[]; more: React.ReactNode } {
  const [limit, setLimit] = useState(step);
  useEffect(() => setLimit(step), [resetKey, step]);
  const shown = items.slice(0, limit);
  const more = items.length > limit ? (
    <div className="sx-more">
      <Btn variant="secondary" block onClick={() => setLimit(l => l + step)}>Show more ({items.length - limit} left)</Btn>
    </div>
  ) : null;
  return { shown, more };
}
