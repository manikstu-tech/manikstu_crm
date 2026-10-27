'use client';

import { useEffect, useLayoutEffect, useRef, type HTMLAttributes } from 'react';

/**
 * A `.table-wrap` whose table is shown as a list of cards on phones (768px and below),
 * so wide tables no longer scroll sideways there.
 *
 * Above 768px nothing changes: this renders the same `<div className="table-wrap">`
 * with one extra class, and no styles apply to it. On phones (styles in globals.css,
 * under `.m-cards`) every row becomes a card in the style of the Telecalling Team
 * cards: the row's main cell is the card title, a status chip can sit in the top-right
 * corner, and every other cell is shown under its column name. The rows, buttons,
 * tick boxes and row taps are the table's own, so they keep working as on desktop.
 *
 * To do that, each cell is given its column name (`data-label`, copied from the
 * table header) and a role (`data-mc`), and both are kept up to date when rows change.
 */

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Column (0-based) used as the card title. Default: the first column that isn't a tick box or a rank. */
  titleCol?: number;
  /** Column shown in the card's top-right corner. Default: a Status/Stage column that holds only a chip. Pass -1 for none. */
  chipCol?: number;
  /** Columns given the whole card width, for long text. Columns with buttons and long text get it anyway. */
  wideCols?: number[];
};

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function CardTable({ titleCol, chipCol, wideCols, className, children, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const wideKey = wideCols?.join(',') ?? '';

  useIsoLayoutEffect(() => {
    const wrap = ref.current;
    if (!wrap) return;
    const opts: LabelOptions = { titleCol, chipCol, wideCols: wideKey ? wideKey.split(',').map(Number) : [] };
    const run = () => {
      const table = wrap.querySelector(':scope > table');
      if (table instanceof HTMLTableElement) labelTable(table, opts);
    };
    run();
    // Rows come and go with filters, paging and live updates: label the new cells too.
    // (Only attributes are written here, which this observer doesn't watch, so it can't loop.)
    const observer = new MutationObserver(run);
    observer.observe(wrap, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [titleCol, chipCol, wideKey]);

  return (
    <div ref={ref} className={className ? `table-wrap m-cards ${className}` : 'table-wrap m-cards'} {...rest}>
      {children}
    </div>
  );
}

type LabelOptions = { titleCol?: number; chipCol?: number; wideCols: number[] };
type Role = 'title' | 'chip' | 'check' | 'rank' | 'act' | 'wide' | 'num' | '';

const SORT_ARROWS = /[▾▴▲▼↑↓⇅]/g;
const NUMBER_LIKE = /^[-+₹%.,/\d\s]+$/;
/** A figure: an amount, a percentage or a short count. Not a phone number or an ID. */
const isFigure = (s: string) => s.length <= 14 && NUMBER_LIKE.test(s) && (/[₹%]/.test(s) || s.replace(/\D/g, '').length <= 6);
const CONTROLS = 'button, select, textarea, a[href], input:not([type="checkbox"])';
const CONTENT = 'input, button, select, textarea, a, img, svg, canvas';
/** Average text length above which a column gets the whole card width. */
const LONG_TEXT = 30;

const textOf = (el: Element) => (el.textContent ?? '').replace(SORT_ARROWS, '').replace(/\s+/g, ' ').trim();

function setAttr(el: Element, name: string, value: string | null) {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

function labelTable(table: HTMLTableElement, opts: LabelOptions) {
  // 1. Column names from the header. With grouped headers the lowest row wins.
  const labels: string[] = [];
  const headCells: HTMLTableCellElement[] = [];
  const head = table.tHead;
  if (head) {
    const taken: boolean[][] = [];
    Array.from(head.rows).forEach((tr, r) => {
      let c = 0;
      for (const th of Array.from(tr.cells)) {
        while (taken[r]?.[c]) c++;
        const name = textOf(th);
        for (let i = 0; i < Math.max(1, th.rowSpan); i++) {
          for (let j = 0; j < th.colSpan; j++) {
            (taken[r + i] ??= [])[c + j] = true;
            if (name || !labels[c + j]) labels[c + j] = name;
            headCells[c + j] = th;
          }
        }
        c += th.colSpan;
      }
    });
  }
  const columnCount = labels.length;

  // 2. Place every body cell in its column. Rows with a single cell (an empty-list
  //    message, a group heading) stay as they are instead of becoming cards.
  const columns: HTMLTableCellElement[][] = [];
  const rows: HTMLTableRowElement[] = [];
  for (const section of [...Array.from(table.tBodies), ...(table.tFoot ? [table.tFoot] : [])]) rows.push(...Array.from(section.rows));
  const cellColumn = new Map<HTMLTableCellElement, number>();
  for (const tr of rows) {
    const cells = Array.from(tr.cells);
    if (cells.length === 1 && columnCount > 1) {
      setAttr(tr, 'data-mc', 'plain');
      continue;
    }
    setAttr(tr, 'data-mc', null);
    let c = 0;
    for (const td of cells) {
      cellColumn.set(td, c);
      (columns[c] ??= []).push(td);
      c += td.colSpan;
    }
  }

  // 3. What each column holds.
  // A tick-box column: tick boxes and nothing else (rows that can't be ticked leave the cell empty).
  const isCheck = (c: number) => (columns[c] ?? []).some(td => td.querySelector('input[type="checkbox"]'))
    && columns[c].every(td => textOf(td) === '');
  const isRank = (c: number) => labels[c] === '#';
  let title = opts.titleCol ?? -1;
  if (title < 0) {
    for (let c = 0; c < columns.length; c++) {
      if (!isCheck(c) && !isRank(c)) { title = c; break; }
    }
  }
  let chip = opts.chipCol ?? -1;
  if (opts.chipCol === undefined) {
    chip = labels.findIndex((name, c) => {
      if (c === title || !/^(status|stage)$/i.test(name)) return false;
      const filled = (columns[c] ?? []).filter(td => textOf(td) !== '');
      return filled.length > 0 && filled.every(td => {
        const chipEl = td.querySelector('.chip');
        return chipEl !== null && textOf(chipEl) === textOf(td);
      });
    });
  }
  const roles: Role[] = [];
  for (let c = 0; c < Math.max(columns.length, columnCount); c++) {
    const cells = columns[c] ?? [];
    const filled = cells.map(textOf).filter(Boolean);
    const avgLength = filled.length ? filled.reduce((n, s) => n + s.length, 0) / filled.length : 0;
    const numeric = headCells[c]?.classList.contains('num-col')
      || (filled.length > 0 && filled.every(isFigure));
    roles[c] = c === title ? 'title'
      : c === chip ? 'chip'
      : isCheck(c) ? 'check'
      : isRank(c) ? 'rank'
      : cells.some(td => td.querySelector(CONTROLS)) ? 'act'
      : opts.wideCols.includes(c) || avgLength > LONG_TEXT ? 'wide'
      : numeric ? 'num'
      : '';
  }

  // 4. Write it onto the table, the cells and the header tools (sorting, select all).
  setAttr(table, 'data-mc-lead', roles.some(r => r === 'check' || r === 'rank') ? '' : null);
  setAttr(table, 'data-mc-chip', roles.includes('chip') ? '' : null);
  // Tables of figures show them three to a row, like the Telecalling Team cards.
  setAttr(table, 'data-mc-stats', roles.filter(r => r === 'num').length >= 3 ? '' : null);
  for (const [td, c] of Array.from(cellColumn)) {
    const role = roles[c] ?? '';
    const name = labels[c] ?? '';
    setAttr(td, 'data-label', role === 'act' && /^actions?$/i.test(name) ? '' : name);
    setAttr(td, 'data-mc', role || null);
    setAttr(td, 'data-mc-empty', textOf(td) === '' && !td.querySelector(CONTENT) ? '' : null);
  }
  if (head) {
    let tools: 'sort' | 'select' | null = null;
    for (const th of Array.from(head.querySelectorAll('th'))) {
      const sort = th.querySelector('button');
      const box = th.querySelector<HTMLInputElement>('input[type="checkbox"]');
      setAttr(th, 'data-mc-tool', sort || box ? '' : null);
      setAttr(th, 'data-mc-tool-label', box ? box.getAttribute('aria-label') ?? 'Select all' : null);
      if (sort) tools = 'sort';
      else if (box && !tools) tools = 'select';
    }
    setAttr(head, 'data-mc-tools', tools);
  }
}
