import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { LEAD_SOURCES, NAME_MISSING, TELECALLERS, VERTICALS, TrackerLead } from '../../data/managerDashboard';
import {
  CheckedCandidate,
  STATUS_LABEL,
  checkRows,
  downloadLeadTemplate,
  fileKind,
  isDuplicateStatus,
  parseLeadRows,
  readFileRows,
} from '../../lib/leadImport';
import type { ImportSummary } from '../../lib/useTracker';
import { isOpenLead, verticalName } from './tcData';
import CardTable from '../CardTable';

/** A lead ready to be created: everything except the id, which the dashboard assigns. `line` is its row in the file. */
export type NewLead = Omit<TrackerLead, 'id' | 'stage_id' | 'created_at' | 'updated_at'> & { line?: number };

/** What saving the import did: the server's error, or what it saved and skipped. */
export interface ImportOutcome {
  error: string | null;
  summary: ImportSummary | null;
}

const IMPORTED_SOURCE = 'Imported file';

interface Props {
  leads: TrackerLead[];
  /** Saves the ready rows; resolves to the server's error, or to what was saved. */
  onCreate: (leads: NewLead[]) => Promise<ImportOutcome>;
  onClose: () => void;
  /** After the result is read: show the imported leads (e.g. switch to New imports). */
  onDone: () => void;
}

/** The import result, as the four counts the plan asks for, with the rows behind each. */
interface ImportResult {
  imported: number;
  nameMissing: number;
  duplicates: { row: number; message: string }[];
  skipped: { row: number; message: string }[];
  /** Rows the server refused while saving (normally none: the preview runs the same checks). */
  failed: { row: number; message: string }[];
}

export default function ImportLeads({ leads, onCreate, onClose, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CheckedCandidate[] | null>(null);
  const [defaultVertical, setDefaultVertical] = useState<number>(VERTICALS[0].id);
  const [defaultSource, setDefaultSource] = useState<string>(IMPORTED_SOURCE);
  // Imports land unassigned by default: they wait in the Follow-up pool until the
  // head hands them out. 'auto' spreads by workload; a number assigns to that executive.
  const [assign, setAssign] = useState<'unassigned' | 'auto' | number>('unassigned');

  const handleFile = async (file: File) => {
    setError(null);
    setSaveError(null);
    setRows(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const grid = await readFileRows(file);
      const candidates = parseLeadRows(grid);
      if (candidates.length === 0) {
        throw new Error(
          fileKind(file.name) === 'pdf'
            ? 'No phone numbers were found in this PDF. Scanned (photo) PDFs can’t be read; use the Excel template instead.'
            : 'No leads were found. Make sure the file has a Phone column (download the template to see the layout).',
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
  const readyNameless = ready.filter(p => p.row.nameMissing).length;
  const duplicates = planned.filter(p => isDuplicateStatus(p.row.status));
  const skipped = planned.filter(p => p.row.status !== 'ready' && !isDuplicateStatus(p.row.status));
  const perCaller = Array.from(ready.reduce((m, p) => m.set(p.callerId!, (m.get(p.callerId!) ?? 0) + 1), new Map<number, number>()));

  const describe = (r: CheckedCandidate) => ({ row: r.line, message: `Row ${r.line}${r.phone && !r.phone.startsWith('?') ? ` (${r.phone})` : ''}: ${r.problem ?? STATUS_LABEL[r.status].toLowerCase()}` });

  const create = async () => {
    setSaving(true);
    setSaveError(null);
    const outcome = await onCreate(ready.map(({ row, callerId }) => ({
      line: row.line,
      vertical_id: row.verticalId ?? defaultVertical,
      assigned_to: callerId!,
      customer_name: row.name,
      phone: row.phone!,
      source: row.source ?? defaultSource,
      reason: row.reason,
    })));
    setSaving(false);
    if (outcome.error) {
      setSaveError(outcome.error);
      return;
    }
    // Rows found in the preview plus any the server skipped because someone added the number meanwhile.
    const serverDuplicates = outcome.summary?.duplicates ?? [];
    const savedNameless = outcome.summary ? outcome.summary.name_missing : readyNameless;
    setResult({
      imported: outcome.summary?.imported ?? ready.length,
      nameMissing: savedNameless,
      duplicates: [...duplicates.map(p => describe(p.row)), ...serverDuplicates],
      skipped: skipped.map(p => describe(p.row)),
      failed: outcome.summary?.failed ?? [],
    });
  };

  const callerName = (id: number | null) => (id === 0 ? 'Unassigned' : TELECALLERS.find(t => t.id === id)?.name ?? '—');

  if (result) {
    return (
      <div className="import-leads">
        <div className="import-result" role="status">
          <CheckCircle2 size={28} aria-hidden />
          <div>
            <strong>Import finished{fileName ? ` · ${fileName}` : ''}</strong>
            <div className="loc">{result.failed.length ? `${result.failed.length} row${result.failed.length === 1 ? ' was' : 's were'} refused while saving; the other rows were saved.` : 'Every valid row was saved.'}</div>
          </div>
        </div>
        <div className="import-counts">
          <div className="import-count good"><span className="n">{result.imported}</span><span>Imported</span>
            {result.nameMissing > 0 && <small>{result.nameMissing} with Name Missing</small>}</div>
          <div className="import-count"><span className="n">{result.duplicates.length}</span><span>Duplicates</span><small>already leads or repeated in the file</small></div>
          <div className="import-count"><span className="n">{result.skipped.length}</span><span>Skipped</span><small>no valid mobile, or a name or reason to fix</small></div>
          <div className={`import-count ${result.failed.length ? 'bad' : ''}`}><span className="n">{result.failed.length}</span><span>Failed</span><small>refused while saving</small></div>
        </div>
        {[...result.duplicates, ...result.skipped, ...result.failed].length > 0 && (
          <details className="import-details" open={result.failed.length > 0}>
            <summary>Show the rows that were not imported</summary>
            <ul>{[...result.duplicates, ...result.skipped, ...result.failed].sort((a, b) => a.row - b.row).map(r => <li key={`${r.row}-${r.message}`}>{r.message}</li>)}</ul>
          </details>
        )}
        {result.nameMissing > 0 && (
          <p className="loc">Leads with Name Missing are marked Incomplete. Use Edit on Leads &amp; Assignment to add the names.</p>
        )}
        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button type="button" className="btn-primary" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

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
              Each row needs a <strong>10-digit mobile number</strong>. A row without a name is still imported as <strong>{NAME_MISSING}</strong> (marked Incomplete) so you can add the name later.
              A name, when given, must be 2–80 characters with letters (“N/A”, “-” or “unknown” count as no name); a reason can be up to 500 characters.
              Product, source, reason and telecaller are optional: column names can be in any order (e.g. “Farmer name”, “Mobile”, “Interested in”, “Assign to”).
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
            {readyNameless > 0 && <span className="chip pending">{readyNameless} name missing</span>}
            {duplicates.length > 0 && <span className="chip muted">{duplicates.length} duplicate{duplicates.length === 1 ? '' : 's'}</span>}
            {skipped.length > 0 && <span className="chip pending">{skipped.length} skipped</span>}
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

          <CardTable className="import-table" titleCol={1}>
            <table>
              <thead>
                <tr><th>Row</th><th>Name</th><th>Phone</th><th>Product</th><th>Source</th><th>Reason</th><th>Assign to</th><th>Status</th></tr>
              </thead>
              <tbody>
                {planned.map(({ row, callerId }) => (
                  <tr key={row.line} className={row.status === 'ready' ? undefined : 'row-skipped'}>
                    <td>{row.line}</td>
                    <td className="cust">{row.name || <span className="chip pending">{NAME_MISSING}</span>}</td>
                    <td>{row.phone ? row.phone.replace(/^\?/, '') : '—'}</td>
                    <td>{row.verticalId ? verticalName(row.verticalId) : <span className="loc">{verticalName(defaultVertical)}</span>}</td>
                    <td>{row.source ?? <span className="loc">{defaultSource}</span>}</td>
                    <td>{row.reason ? <div className="lead-reason" title={row.reason}>{row.reason}</div> : <span className="loc">—</span>}</td>
                    <td>{row.status === 'ready' ? callerName(callerId) : '—'}</td>
                    <td>
                      <span className={`chip ${row.status === 'ready' ? 'delivered' : isDuplicateStatus(row.status) ? 'muted' : 'pending'}`}>{STATUS_LABEL[row.status]}</span>
                      {row.problem && <div className="loc text-warn">{row.problem}</div>}
                      {row.status === 'ready' && row.nameMissing && <div className="loc">Incomplete</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTable>
          <div className="loc" style={{ marginTop: 8 }}>
            Grey product and source text are the defaults above. Duplicates and skipped rows won’t be created: fix them in the file and import again.
          </div>
        </>
      )}

      {saveError && <div className="inline-alert" role="alert" style={{ marginTop: 12 }}>{saveError}</div>}

      <div className="modal-footer" style={{ marginTop: 16 }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        {rows && (
          <button type="button" className="btn-primary" disabled={ready.length === 0 || saving} onClick={create}>
            {saving ? 'Creating…' : `Create ${ready.length} lead${ready.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  );
}
