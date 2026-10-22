import React, { useState } from 'react';

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  display: string;
  /** Neutral fill, for an "Other" bucket. */
  other?: boolean;
}

// Categorical slots in fixed order (brand leaf, gold, blue, rust, violet, aqua); checked for
// colour-blind separation with the slices wrapping round the circle. Max 6 slices.
const SLOTS = ['#174B32', '#DCA72B', '#78A65A', '#2A78D6', '#A6532E', '#8A7FD0']; // brand Forest, Harvest Gold, Leaf Green first
const OTHER = '#B9B4A2';
const R = 80;

const point = (angle: number) => [100 + R * Math.sin(angle), 100 - R * Math.cos(angle)];

/** Pie chart with a legend that carries each slice's name, value and share. */
export default function PieChart({ slices, label }: { slices: PieSlice[]; label: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const colored = slices.filter(s => !s.other);
  const fill = (s: PieSlice) => (s.other ? OTHER : SLOTS[colored.indexOf(s) % SLOTS.length]);
  const share = (s: PieSlice) => `${Math.round((s.value / total) * 100)}%`;

  let start = 0;
  const arcs = slices.map(s => {
    const sweep = (s.value / total) * 2 * Math.PI;
    const [x1, y1] = point(start);
    const [x2, y2] = point(start + sweep);
    const d = sweep >= 2 * Math.PI - 1e-6
      ? `M100 ${100 - R} A${R} ${R} 0 1 1 99.99 ${100 - R} Z`
      : `M100 100 L${x1} ${y1} A${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
    start += sweep;
    return { s, d };
  });

  return (
    <div className="pie-chart">
      <svg viewBox="0 0 200 200" role="img" aria-label={label}>
        {arcs.map(({ s, d }) => (
          <path
            key={s.key}
            d={d}
            fill={fill(s)}
            className={hover && hover !== s.key ? 'dim' : ''}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${s.label}: ${s.display} (${share(s)})`}</title>
          </path>
        ))}
      </svg>
      <ul className="pie-legend">
        {slices.map(s => (
          <li
            key={s.key}
            className={hover === s.key ? 'active' : ''}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="pie-swatch" style={{ background: fill(s) }} />
            <span className="pie-name">{s.label}</span>
            <span className="pie-value">{s.display}</span>
            <span className="pie-share">{share(s)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
