'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';

export type DateRangeOption<K extends string> = { value: K; label: string };

/**
 * Date range dropdown: a calendar icon, the chosen range and an arrow (styles in globals.css, `.date-select`).
 * Underneath it is a native select, so tapping anywhere on it opens the phone's own picker.
 *
 * phoneOnly: shown only on phones (768px and below), in place of a row of date buttons that is hidden there
 * (give that row the `date-chips` class). Desktop and tablets keep the buttons.
 */
export default function DateRangeSelect<K extends string>({ value, options, onChange, label = 'Date range', phoneOnly = false, className }: {
  value: K;
  options: DateRangeOption<K>[];
  onChange: (value: K) => void;
  label?: string;
  phoneOnly?: boolean;
  className?: string;
}) {
  return (
    <span className={['date-select', phoneOnly ? 'phone-only' : '', className ?? ''].filter(Boolean).join(' ')}>
      <CalendarDays size={18} className="date-select-icon" aria-hidden />
      <select value={value} onChange={e => onChange(e.target.value as K)} aria-label={label}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={18} className="date-select-caret" aria-hidden />
    </span>
  );
}
