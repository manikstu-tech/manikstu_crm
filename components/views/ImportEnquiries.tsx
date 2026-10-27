import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { EnquiryType, TELECALLERS, WebEnquiry } from '../../data/managerDashboard';
import { fileKind, readFileRows } from '../../lib/leadImport';
import { ENQUIRY_ROW_LABEL, EnquiryCandidate, downloadEnquiryTemplate, parseEnquiryRows, toNewEnquiries } from '../../lib/enquiryImport';
import type { NewEnquiryData } from '../../lib/trackerOps';
import { shortDateTime } from '../../lib/format';
import Modal from '../Modal';
import CardTable from '../CardTable';

const TYPES: EnquiryType[] = ['sales', 'partnership', 'career', 'general'];

interface Props {
  existing: WebEnquiry[];
  /** Save the enquiries; assignSalesTo = a caller for the sales ones, or null. Resolves true when saved. */
  onImport: (enquiries: NewEnquiryData[], assignSalesTo: number | null) => Promise<boolean>;
  onClose: () => void;
}

/** Import enquiries from Excel / CSV / PDF, with the type worked out from each message. */
export default function ImportEnquiries({ existing, onImport, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<EnquiryCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [assignSales, setAssignSales] = useState(false);
  const active = TELECALLERS.filter(t => t.is_active);
  const [salesCaller, setSalesCaller] = useState<number>(active[0]?.id ?? 0);

  const read = async (file: File) => {
    setError(null);
    setRows(null);
    setPicked(new Set());
    setFileName(file.name);
    setBusy(true);
    try {
      const found = parseEnquiryRows(await readFileRows(file), existing);
      if (found.length === 0) {
        throw new Error(fileKind(file.name) === 'pdf'
          ? 'No enquiries with a phone number or email were found in this PDF. Scanned (photo) PDFs can’t be read; use the Excel template instead.'
          : 'No enquiries were found. Make sure the file has Name, Phone / Email and Message columns (download the template to see the layout).');
      }
      setRows(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file couldn’t be read.');
      setFileName(null);
    } finally {
      setBusy(false);
    }
  };

  const setType = (lines: number[], type: EnquiryType) =>
    setRows(prev => prev && prev.map(r => (lines.includes(r.line) ? { ...r, type, typeReason: 'set by you' } : r)));

  const ready = rows?.filter(r => r.status === 'ready') ?? [];
  const skipped = (rows?.length ?? 0) - ready.length;
  const count = (t: EnquiryType) => ready.filter(r => r.type === t).length;
  const readySales = count('sales');

  const save = async () => {
    setSaving(true);
    const ok = await onImport(toNewEnquiries(ready), assignSales && readySales > 0 ? salesCaller : null);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="Import enquiries from Excel or PDF" wide closeOnBackdrop={false}>
      <div className="import-leads">
        {!rows && (
          <>
            <div
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => input.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) read(f); }}
            >
              <Upload size={26} />
              <div className="drop-title">{busy ? `Reading ${fileName}…` : 'Drop an Excel, CSV or PDF file here'}</div>
              <div className="loc">or click to choose a file</div>
              <div className="drop-kinds">
                <span><FileSpreadsheet size={14} /> .xlsx / .csv</span>
                <span><FileText size={14} /> .pdf</span>
              </div>
              <input ref={input} type="file" accept=".xlsx,.csv,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
            </div>
            {error && <div className="inline-alert" style={{ marginTop: 12 }}>{error}</div>}
            <div className="import-help">
              <div>
                Columns: <strong>Name</strong>, <strong>Phone</strong> and / or <strong>Email</strong>, <strong>Message</strong>, and optionally
                <strong> Date received</strong> and <strong>Type</strong>. Headings can be worded your way (Mobile, Query, Remarks…).
                The <strong>type</strong> (sales, partnership, career, general) is worked out from each message; you can change it before importing.
              </div>
              <button className="btn-secondary btn-small" onClick={() => downloadEnquiryTemplate()}><Download size={14} /> Template</button>
            </div>
          </>
        )}

        {rows && (
          <>
            <div className="import-summary">
              <span className="loc">{fileName}</span>
              <span className="chip delivered">{ready.length} ready</span>
              {skipped > 0 && <span className="chip pending">{skipped} skipped</span>}
              <span className="loc">{TYPES.map(t => `${count(t)} ${t}`).join(' · ')}</span>
              <button className="link-btn clear-alert" onClick={() => { setRows(null); setFileName(null); }}>Choose another file</button>
            </div>

            {picked.size > 0 && (
              <div className="bulk-bar">
                <strong>{picked.size} selected</strong>
                <span className="loc">Set type:</span>
                {TYPES.map(t => (
                  <button key={t} className="btn-secondary btn-small" onClick={() => { setType(Array.from(picked), t); setPicked(new Set()); }}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
                <button className="link-btn" onClick={() => setPicked(new Set())}>Clear</button>
              </div>
            )}

            <CardTable className="import-table" titleCol={2} chipCol={6}>
              <table>
                <thead>
                  <tr><th></th><th>Row</th><th>From</th><th>Message</th><th>Type</th><th>Received</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.line} className={r.status === 'ready' ? undefined : 'row-skipped'}>
                      <td>
                        {r.status === 'ready' && (
                          <input type="checkbox" checked={picked.has(r.line)} aria-label={`Select row ${r.line}`}
                            onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r.line)) n.delete(r.line); else n.add(r.line); return n; })} />
                        )}
                      </td>
                      <td className="loc">{r.line}</td>
                      <td className="cust">{r.name}<div className="loc">{[r.phone, r.email].filter(Boolean).join(' · ') || '—'}</div></td>
                      <td className="enq-message"><span>{r.message || '—'}</span></td>
                      <td>
                        <select className="filter-select type-select" value={r.type} disabled={r.status !== 'ready'} onChange={e => setType([r.line], e.target.value as EnquiryType)} aria-label={`Type for row ${r.line}`}>
                          {TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                        </select>
                        <div className="loc">{r.typeReason || 'no clear words · general'}</div>
                      </td>
                      <td className="loc">{r.createdAt ? shortDateTime(r.createdAt) : 'now'}</td>
                      <td><span className={`chip ${r.status === 'ready' ? 'delivered' : r.status.startsWith('duplicate') ? 'muted' : 'pending'}`}>{ENQUIRY_ROW_LABEL[r.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardTable>

            {readySales > 0 && (
              <label className="check-line" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={assignSales} onChange={e => setAssignSales(e.target.checked)} />
                Assign the {readySales} sales {readySales === 1 ? 'enquiry' : 'enquiries'} to
                <select className="filter-select" value={salesCaller} disabled={!assignSales} onChange={e => setSalesCaller(Number(e.target.value))} aria-label="Caller for sales enquiries">
                  {active.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                right away (they become that caller&apos;s leads)
              </label>
            )}
          </>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          {rows && (
            <button type="button" className="btn-primary" disabled={ready.length === 0 || saving} onClick={save}>
              {saving ? 'Importing…' : `Import ${ready.length} ${ready.length === 1 ? 'enquiry' : 'enquiries'}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
