import React, { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { LEAD_SOURCES, TELECALLERS, VERTICALS, TrackerLead } from '../../data/managerDashboard';
import {
  CheckedCandidate,
  STATUS_LABEL,
  checkRows,
  downloadLeadTemplate,
  fileKind,
  parseLeadRows,
  readFileRows,
} from '../../lib/leadImport';
import { isOpenLead, verticalName } from './tcData';

/** A lead ready to be created: everything except the id, which the dashboard assigns. */
export type NewLead = Omit<TrackerLead, 'id' | 'stage_id' | 'created_at' | 'updated_at'>;

const IMPORTED_SOURCE = 'Imported file';

interface Props {
  leads: TrackerLead[];
  onCreate: (leads: NewLead[]) => void;
  onClose: () => void;
}

export default function ImportLeads({ leads, onCreate, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CheckedCandidate[] | null>(null);
  const [defaultVertical, setDefaultVertical] = useState<number>(VERTICALS[0].id);
  const [defaultSource, setDefaultSource] = useState<string>(IMPORTED_SOURCE);
  // Imports land unassigned by default: they wait in the Follow-up pool until the
  // head hands them out. 'auto' spreads by workload; a number assigns to that executive.
  const [assign, setAssign] = useState<'unassigned' | 'auto' | number>('unassigned');

  const handleFile = async (file: File) => {
    setError(null);
    setRows(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const grid = await readFileRows(file);
      const candidates = parseLeadRows(grid);
      if (candidates.length === 0) {
        throw new Error(
          fileKind(file.name) === 'pdf'
            ? 'No names with phone numbers were found in this PDF. Scanned (photo) PDFs can’t be read; use the Excel template instead.'
            : 'No leads were found. Make sure the file has a Name and a Phone column (download the template to see the layout).',
        );
      }
      setRows(checkRows(candidates, new Set(leads.map(l => l.phone))));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file couldn’t be read.');
      setFileName(null);
    } finally {
      setBusy(false);
    }
  };

  // Who each ready row goes to: named telecaller, the one chosen above, or auto (fewest open leads first).
  const planned = useMemo(() => {
    if (!rows) return [];
    const active = TELECALLERS.filter(t => t.is_active);
    const load = new Map(active.map(t => [t.id, leads.filter(l => l.assigned_to === t.id && isOpenLead(l)).length]));
    return rows.map(r => {
      if (r.status !== 'ready') return { row: r, callerId: null as number | null };
      // A telecaller named in the file always wins; otherwise unassigned (0), the
      // chosen executive, or auto-spread by workload.
      let callerId = r.callerId ?? (assign === 'unassigned' ? 0 : assign === 'auto' ? null : assign);
      if (callerId === null) {
        callerId = Array.from(load.entries()).sort((a, b) => a[1] - b[1])[0][0];
      }
      if (callerId !== 0) load.set(callerId, (load.get(callerId) ?? 0) + 1);
      return { row: r, callerId };
    });
  }, [rows, leads, assign]);

  const ready = planned.filter(p => p.row.status === 'ready');
  const problems = planned.filter(p => p.row.status !== 'ready');
  const perCaller = Array.from(ready.reduce((m, p) => m.set(p.callerId!, (m.get(p.callerId!) ?? 0) + 1), new Map<number, number>()));

  const create = () => {
    onCreate(ready.map(({ row, callerId }) => ({
      vertical_id: row.verticalId ?? defaultVertical,
      assigned_to: callerId!,
      customer_name: row.name,
      phone: row.phone!,
      source: row.source ?? defaultSource,
      reason: row.reason,
    })));
  };

  const callerName = (id: number | null) => (id === 0 ? 'Unassigned' : TELECALLERS.find(t => t.id === id)?.name ?? '—');

  return (
    <div className="import-leads">
      {!rows && (
        <>
          <div
            className={`drop-zone ${dragging ? 'dragging' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          >
            <Upload size={28} />
            <div className="drop-title">{busy ? `Reading ${fileName}…` : 'Drop an Excel, CSV or PDF file here'}</div>
            <div className="loc">or click to choose a file</div>
            <div className="drop-kinds">
              <span><FileSpreadsheet size={14} /> .xlsx</span>
              <span><FileSpreadsheet size={14} /> .csv</span>
              <span><FileText size={14} /> .pdf</span>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </div>
          {error && <div className="inline-alert" style={{ marginTop: 12 }}>{error}</div>}
          <div className="import-help">
            <p>
              Each row needs a <strong>name</strong> and a <strong>10-digit mobile number</strong>. Product, source, reason and telecaller are optional:
              column names can be in any order (e.g. “Farmer name”, “Mobile”, “Interested in”, “Assign to”).
            </p>
            <p>PDFs must contain real text, like a table exported from Excel or this app. Scanned photos of paper lists can’t be read.</p>
            <button className="btn-secondary btn-small" onClick={() => downloadLeadTemplate()}>
              <Download size={14} /> Download Excel template
            </button>
          </div>
        </>
      )}

      {rows && (
        <>
          <div className="import-summary">
            <span className="loc">{fileName}</span>
            <span className="chip delivered">{ready.length} ready</span>
            {problems.length > 0 && <span className="chip pending">{problems.length} skipped</span>}
            <button className="link-btn clear-alert" onClick={() => { setRows(null); setFileName(null); }}>Choose another file</button>
          </div>

          <div className="form-row three">
            <div className="form-group">
              <label>Product, if the file doesn’t say</label>
              <select value={defaultVertical} onChange={e => setDefaultVertical(Number(e.target.value))}>
                {VERTICALS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Source, if the file doesn’t say</label>
              <select value={defaultSource} onChange={e => setDefaultSource(e.target.value)}>
                <option value={IMPORTED_SOURCE}>{IMPORTED_SOURCE}</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Assign to</label>
              <select value={assign} onChange={e => setAssign(e.target.value === 'auto' || e.target.value === 'unassigned' ? e.target.value : Number(e.target.value))}>
                <option value="unassigned">Leave unassigned (waits in Follow-up)</option>
                <option value="auto">Auto: spread by workload</option>
                {TELECALLERS.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          {ready.length > 0 && (
            <div className="loc" style={{ marginBottom: 10 }}>
              Goes to: {perCaller.map(([id, n]) => `${callerName(id)} (${n})`).join(', ')}. A telecaller named in the file always gets that row.
            </div>
          )}

          <div className="table-wrap import-table">
            <table>
              <thead>
                <tr><th>Row</th><th>Name</th><th>Phone</th><th>Product</th><th>Source</th><th>Reason</th><th>Assign to</th><th>Status</th></tr>
              </thead>
              <tbody>
                {planned.map(({ row, callerId }) => (
                  <tr key={row.line} className={row.status === 'ready' ? undefined : 'row-skipped'}>
                    <td>{row.line}</td>
                    <td className="cust">{row.name || <span className="text-warn">—</span>}</td>
                    <td>{row.phone ? row.phone.replace(/^\?/, '') : '—'}</td>
                    <td>{row.verticalId ? verticalName(row.verticalId) : <span className="loc">{verticalName(defaultVertical)}</span>}</td>
                    <td>{row.source ?? <span className="loc">{defaultSource}</span>}</td>
                    <td>{row.reason ? <div className="lead-reason" title={row.reason}>{row.reason}</div> : <span className="loc">—</span>}</td>
                    <td>{row.status === 'ready' ? callerName(callerId) : '—'}</td>
                    <td><span className={`chip ${row.status === 'ready' ? 'delivered' : row.status.startsWith('already') || row.status.startsWith('duplicate') ? 'muted' : 'pending'}`}>{STATUS_LABEL[row.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="loc" style={{ marginTop: 8 }}>
            Grey product and source text are the defaults above. Skipped rows won’t be created: fix them in the file and import again.
          </div>
        </>
      )}

      <div className="modal-footer" style={{ marginTop: 16 }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        {rows && (
          <button type="button" className="btn-primary" disabled={ready.length === 0} onClick={create}>
            Create {ready.length} lead{ready.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  );
}
