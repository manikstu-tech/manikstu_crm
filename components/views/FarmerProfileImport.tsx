import React, { useState } from 'react';
import { FileSpreadsheet, FileText, Upload } from 'lucide-react';
import Modal from '../Modal';
import { FarmerProfilePatch, saveFarmerProfile } from '../../lib/farmerProfile';
import { fileKind, readFileRows } from '../../lib/leadImport';

interface ParsedRow extends FarmerProfilePatch {
  rowName: string;
}

const HEADERS: Record<string, string[]> = {
  phone: ['phone', 'mobile', 'phone number', 'number'],
  name: ['name', 'farmer', 'customer', 'farmer / customer'],
  cows: ['cows', 'cow'],
  buffaloes: ['buffaloes', 'buffalo'],
  goats: ['goats', 'goat'],
  sheep: ['sheep'],
  poultry: ['poultry', 'hens', 'chicken'],
  land: ['land', 'land holding', 'landholding', 'acres'],
  crops: ['crops', 'crop'],
};

/** Map a parsed grid (from Excel / CSV / PDF or a paste) to farmer profiles, by header. */
function gridToProfiles(grid: string[][]): { rows: ParsedRow[]; skipped: number } {
  const nonEmpty = grid.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
  // Find the header row: the first (within the first 10) that has a phone-like column.
  let headerIdx = -1;
  let col: Record<string, number> = {};
  for (let i = 0; i < Math.min(10, nonEmpty.length); i++) {
    const lower = nonEmpty[i].map(c => c.toLowerCase());
    const c: Record<string, number> = {};
    for (const [field, names] of Object.entries(HEADERS)) c[field] = lower.findIndex(h => names.includes(h));
    if (c.phone >= 0) { headerIdx = i; col = c; break; }
  }
  if (headerIdx < 0) return { rows: [], skipped: 0 };

  let skipped = 0;
  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < nonEmpty.length; i++) {
    const cells = nonEmpty[i];
    const get = (j: number) => (j >= 0 ? (cells[j] ?? '') : '');
    const num = (j: number) => (j >= 0 ? Math.max(0, Math.round(Number(cells[j]) || 0)) : 0);
    const phone = get(col.phone).replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone)) { skipped++; continue; }
    rows.push({
      phone,
      rowName: get(col.name) || phone,
      name: get(col.name) || undefined,
      landHolding: get(col.land) || undefined,
      crops: get(col.crops) ? get(col.crops).split(/[;|]/).map(s => s.trim()).filter(Boolean) : undefined,
      livestock: { cows: num(col.cows), buffaloes: num(col.buffaloes), goats: num(col.goats), sheep: num(col.sheep), poultry: num(col.poultry) },
    });
  }
  return { rows, skipped };
}

const pasteToGrid = (text: string): string[][] =>
  text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(',').map(c => c.trim()));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}

/** Bring in farmer profiles (land + crops + livestock) from Excel / CSV / PDF, matched by phone. */
export default function FarmerProfileImport({ isOpen, onClose, onToast }: Props) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (grid: string[][], label: string) => {
    const { rows: r, skipped: s } = gridToProfiles(grid);
    setRows(r);
    setSkipped(s);
    setSource(label);
    if (r.length === 0) {
      setError(label.endsWith('.pdf')
        ? 'No farmer rows were found in this PDF. Scanned (photo) PDFs can’t be read — use the Excel or CSV template.'
        : 'No valid rows found. The first row must be a header with at least a "phone" column.');
    } else {
      setError(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!fileKind(file.name)) { setError('Please upload an Excel (.xlsx), CSV or PDF file.'); return; }
    try {
      const grid = await readFileRows(file);
      setText('');
      apply(grid, file.name);
    } catch (e) {
      setRows([]); setSkipped(0);
      setError(e instanceof Error ? e.message : 'This file couldn’t be read.');
    }
  };

  const onPaste = (value: string) => {
    setText(value);
    apply(pasteToGrid(value), 'pasted');
  };

  const run = async () => {
    if (rows.length === 0 || busy) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await saveFarmerProfile({ phone: r.phone, name: r.name, landHolding: r.landHolding, crops: r.crops, livestock: r.livestock });
        ok++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    onToast(`${ok} farmer profile${ok === 1 ? '' : 's'} imported${failed ? `, ${failed} failed` : ''}`);
    setText(''); setRows([]); setSkipped(0); setSource('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import farmer profiles" wide>
      <div className="import-card-icon" style={{ marginBottom: 12 }}><FileSpreadsheet size={26} /></div>
      <p className="loc" style={{ marginBottom: 8 }}>
        Import farmer profiles — land, crops and animal counts — from an <strong>Excel (.xlsx)</strong>, <strong>CSV</strong> or
        <strong> PDF</strong> file, matched to farmers by phone. An unknown phone creates a new farmer profile.
      </p>
      <p className="loc" style={{ marginBottom: 12 }}>
        The file needs a header row with columns (any order): <strong>phone, name, cows, buffaloes, goats, sheep, poultry, land, crops</strong>.
        Put several crops in one cell separated by <strong>;</strong> (e.g. <code>Paddy;Vegetables</code>). PDFs must contain real text (a table exported from Excel), not a scanned photo.
      </p>

      <div className="import-formats" style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 12.5, color: 'var(--ink-soft)' }}>
        <span><FileSpreadsheet size={14} /> .xlsx</span>
        <span><FileSpreadsheet size={14} /> .csv</span>
        <span><FileText size={14} /> .pdf</span>
      </div>

      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="btn-secondary btn-small" style={{ cursor: 'pointer', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Upload size={15} /> Choose a file
          <input
            type="file"
            accept=".xlsx,.csv,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; onFile(f); e.target.value = ''; }}
          />
        </label>
        {source && source !== 'pasted' && <span className="loc" style={{ marginLeft: 10 }}>Loaded {source}</span>}
      </div>

      <div className="loc" style={{ marginBottom: 6 }}>…or paste CSV rows:</div>
      <textarea
        className="filter-select"
        style={{ width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12.5, padding: 10 }}
        placeholder={'phone,name,cows,buffaloes,goats,sheep,poultry,land,crops\n9437199201,Snehalata Behera,4,1,12,34,20,3 acres,Paddy;Vegetables'}
        value={text}
        onChange={e => onPaste(e.target.value)}
      />

      {error && <div className="loc" style={{ color: 'var(--danger, #b4461f)', marginTop: 10 }}>{error}</div>}

      <div className="lf-foot" style={{ marginTop: 14 }}>
        <span className="loc">{rows.length} ready{skipped > 0 ? ` · ${skipped} skipped (bad phone)` : ''}</span>
        <button className="btn-primary btn-small" disabled={busy || rows.length === 0} onClick={run}>
          {busy ? 'Importing…' : `Import ${rows.length} profile${rows.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  );
}
