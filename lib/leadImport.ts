// Turn an uploaded Excel / CSV / PDF file into telecalling leads.
//
// readFileRows() gets a grid of text cells out of the file (browser only);
// parseLeadRows() and checkRows() turn that grid into lead candidates and are
// plain functions, so they work anywhere.

import { LEAD_SOURCES, TELECALLERS, TRACKER_PRODUCTS, VERTICALS } from '../data/managerDashboard';

export interface ImportCandidate {
  /** 1-based row / line number in the file, for pointing people at problems. */
  line: number;
  name: string;
  phone: string | null;
  verticalId: number | null;
  source: string | null;
  reason: string | null;
  callerId: number | null;
}

export type RowStatus = 'ready' | 'already-a-lead' | 'duplicate-in-file' | 'missing-phone' | 'invalid-phone' | 'missing-name';

export interface CheckedCandidate extends ImportCandidate {
  status: RowStatus;
}

export const STATUS_LABEL: Record<RowStatus, string> = {
  ready: 'Ready',
  'already-a-lead': 'Already a lead',
  'duplicate-in-file': 'Duplicate in file',
  'missing-phone': 'No phone number',
  'invalid-phone': 'Invalid phone',
  'missing-name': 'No name',
};

// ---- Field helpers ------------------------------------------------------------------------

const PHONE_IN_TEXT = /(?:\+?91[\s-]?|0)?([6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4})(?!\d)/;

/** Indian mobile number as 10 digits, or null. Accepts +91 / 0 prefixes, spaces and dashes. */
export function normalizePhone(text: string): string | null {
  let digits = text.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** Which product line a piece of text points at, if any. */
export function detectVertical(text: string): number | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (t.includes('insur') || t.includes('policy')) return 2;
  if (t.includes('goat bank') || /\bbank\b/.test(t) || t.includes('enrol')) return 3;
  const direct = VERTICALS.find(v => t.includes(v.name.toLowerCase()));
  if (direct) return direct.id;
  if (TRACKER_PRODUCTS.some(p => p.vertical_id === 1 && t.includes(p.name.toLowerCase().split(' ')[0]))) return 1;
  if (/(health|tatwa|syrup|tonic|block|lick|soap|deworm|feed|mineral|supplement|medicine)/.test(t)) return 1;
  return null;
}

function detectSource(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  return LEAD_SOURCES.find(s => t.includes(s.toLowerCase())) ?? null;
}

function detectCaller(text: string): number | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const active = TELECALLERS.filter(c => c.is_active);
  return (active.find(c => t.includes(c.name.toLowerCase())) ?? active.find(c => t.includes(c.name.split(' ')[0].toLowerCase())))?.id ?? null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const hasLetters = (s: string) => /[a-z]/i.test(s);

// ---- Rows → candidates --------------------------------------------------------------------

type Field = 'name' | 'phone' | 'product' | 'source' | 'reason' | 'caller';
const HEADER_WORDS: Record<Field, RegExp> = {
  phone: /(phone|mobile|contact\s*(no|number)|number|whatsapp|cell)/i,
  name: /(name|customer|farmer|lead|person)/i,
  product: /(product|vertical|interest|requirement|category|service)/i,
  source: /(source|channel)/i,
  reason: /(reason|remark|note|comment|purpose|query|issue)/i,
  caller: /(telecaller|assign|caller|staff|agent|owner)/i,
};

/** Find a header row (within the first 10) and which column holds each field. */
function findHeader(rows: string[][]): { index: number; cols: Partial<Record<Field, number>> } | null {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cols: Partial<Record<Field, number>> = {};
    rows[i].forEach((cell, c) => {
      const text = cell.trim();
      if (!text || text.length > 40 || normalizePhone(text)) return;
      // Order matters: "Contact number" is a phone column, "Customer name" is a name column.
      for (const f of ['phone', 'caller', 'source', 'reason', 'product', 'name'] as Field[]) {
        if (cols[f] === undefined && HEADER_WORDS[f].test(text)) { cols[f] = c; break; }
      }
    });
    if (cols.phone !== undefined && (cols.name !== undefined || Object.keys(cols).length >= 3)) return { index: i, cols };
  }
  return null;
}

/**
 * Turn a grid of cells into lead candidates. Uses the header row when there is one
 * (Name / Phone / Product / Source / Reason / Assign to, in any order and wording); otherwise
 * reads each line on its own, taking the phone number and the name written before it.
 */
export function parseLeadRows(rows: string[][]): ImportCandidate[] {
  const nonEmpty = rows.map((r, i) => ({ cells: r.map(c => clean(String(c ?? ''))), line: i + 1 })).filter(r => r.cells.some(Boolean));
  const header = findHeader(nonEmpty.map(r => r.cells));
  const out: ImportCandidate[] = [];

  if (header) {
    const { cols } = header;
    const headerText = nonEmpty[header.index].cells.join('|').toLowerCase();
    for (const { cells, line } of nonEmpty.slice(header.index + 1)) {
      if (cells.join('|').toLowerCase() === headerText) continue; // header repeated on a later PDF page
      const get = (f: Field) => (cols[f] !== undefined ? cells[cols[f]!] ?? '' : '');
      const phoneCell = get('phone') || cells.find(c => normalizePhone(c)) || '';
      if (!phoneCell && cells.filter(Boolean).length <= 1) continue; // titles, notes, page footers
      const name = get('name') || cells.find((c, i) => i !== cols.phone && hasLetters(c) && !normalizePhone(c)) || '';
      if (!name && !phoneCell) continue;
      out.push({
        line,
        name,
        phone: phoneCell ? normalizePhone(phoneCell) ?? `?${phoneCell}` : null,
        verticalId: detectVertical(get('product')) ?? detectVertical(cells.join(' ')),
        source: detectSource(get('source')),
        reason: get('reason') || null,
        callerId: detectCaller(get('caller')),
      });
    }
    return out;
  }

  // No header: read line by line (typical for PDFs and loose lists).
  for (const { cells, line } of nonEmpty) {
    const text = cells.join(' ');
    const m = text.match(PHONE_IN_TEXT);
    if (!m) continue; // lines without a phone number are titles, notes or page footers
    const phone = normalizePhone(m[1]);
    const before = text.slice(0, m.index).replace(/^\s*(?:\d+\s*[.)\-:]|#\d+|s\.?\s*no\.?\s*\d+)\s*/i, '');
    const nameCell = cells.find(c => hasLetters(c) && !PHONE_IN_TEXT.test(c) && !detectVertical(c) && !detectSource(c) && !detectCaller(c));
    const name = clean(before.replace(/[,|:;\-–]+\s*$/, '')) || nameCell || '';
    out.push({
      line,
      name: hasLetters(name) ? name : '',
      phone,
      verticalId: detectVertical(text),
      source: detectSource(text),
      reason: null,
      callerId: detectCaller(text.slice((m.index ?? 0) + m[0].length)),
    });
  }
  return out;
}

/** Mark each candidate ready, duplicate or broken. `existingPhones` are phones of leads already in the tracker. */
export function checkRows(candidates: ImportCandidate[], existingPhones: Set<string>): CheckedCandidate[] {
  const seen = new Set<string>();
  return candidates.map(c => {
    let status: RowStatus = 'ready';
    if (!c.name) status = 'missing-name';
    else if (!c.phone) status = 'missing-phone';
    else if (c.phone.startsWith('?')) status = 'invalid-phone';
    else if (existingPhones.has(c.phone)) status = 'already-a-lead';
    else if (seen.has(c.phone)) status = 'duplicate-in-file';
    if (c.phone && !c.phone.startsWith('?')) seen.add(c.phone);
    return { ...c, status };
  });
}

// ---- Reading files (browser) --------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readExcel(buffer: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  // First sheet that has any content
  const ws = wb.worksheets.find(s => s.actualRowCount > 0) ?? wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, row => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(row.getCell(c).text ?? '');
    rows.push(cells);
  });
  return rows;
}

/** Rebuild lines and columns from a PDF's positioned text. */
async function readPdf(buffer: ArrayBuffer): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const rows: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as { str: string; transform: number[]; width: number }[]).filter(i => i.str.trim());
    // Group by baseline (y), top to bottom, then left to right.
    const lines = new Map<number, typeof items>();
    for (const it of items) {
      const y = Math.round(it.transform[5] / 3) * 3;
      lines.set(y, [...(lines.get(y) ?? []), it]);
    }
    for (const y of Array.from(lines.keys()).sort((a, b) => b - a)) {
      const parts = lines.get(y)!.sort((a, b) => a.transform[4] - b.transform[4]);
      const cells: string[] = [];
      let lastEnd = -Infinity;
      for (const it of parts) {
        const x = it.transform[4];
        // A wide gap starts a new column; a small one is just a space inside the cell.
        if (x - lastEnd > 14 || cells.length === 0) cells.push(it.str);
        else cells[cells.length - 1] += (x - lastEnd > 1 ? ' ' : '') + it.str;
        lastEnd = x + it.width;
      }
      rows.push(cells);
    }
  }
  return rows;
}

export type ImportFileKind = 'excel' | 'csv' | 'pdf';

export function fileKind(name: string): ImportFileKind | null {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'xlsx' ? 'excel' : ext === 'csv' ? 'csv' : ext === 'pdf' ? 'pdf' : null;
}

/** Read an uploaded file into a grid of text cells. Throws a readable Error for unsupported files. */
export async function readFileRows(file: File): Promise<string[][]> {
  const kind = fileKind(file.name);
  if (!kind) {
    if (file.name.toLowerCase().endsWith('.xls')) throw new Error('Old .xls files aren’t supported. Open it in Excel and save as .xlsx, then try again.');
    throw new Error('Please upload an Excel (.xlsx), CSV or PDF file.');
  }
  if (kind === 'csv') return parseCsv(await file.text());
  const buffer = await file.arrayBuffer();
  return kind === 'excel' ? readExcel(buffer) : readPdf(buffer);
}

/** Download an Excel template with the columns the importer understands. */
export async function downloadLeadTemplate() {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Leads');
  ws.columns = [
    { header: 'Name', width: 24 },
    { header: 'Phone', width: 16 },
    { header: 'Product', width: 24 },
    { header: 'Source', width: 16 },
    { header: 'Assign to', width: 20 },
    { header: 'Reason', width: 36 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D5016' } };
  ws.addRow(['Ramesh Nayak', '9437012345', 'Goat Health Products', 'Village camp', '', 'Goats not eating, wants a tonic']);
  ws.addRow(['Sunita Behera', '9861234567', 'Goat Insurance', 'Referral', TELECALLERS.find(t => t.is_active)?.name ?? '', 'Wants to insure 10 goats']);
  const list = (values: string[]) => ({ type: 'list' as const, allowBlank: true, formulae: [`"${values.join(',')}"`] });
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`C${r}`).dataValidation = list(VERTICALS.map(v => v.name));
    ws.getCell(`D${r}`).dataValidation = list(LEAD_SOURCES);
    ws.getCell(`E${r}`).dataValidation = list(TELECALLERS.filter(t => t.is_active).map(t => t.name));
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lead-import-template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
