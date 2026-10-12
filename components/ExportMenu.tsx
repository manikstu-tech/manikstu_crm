import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import type { ExportFormat } from '../lib/export';

interface ExportMenuProps {
  onExport: (format: ExportFormat) => Promise<void>;
  label?: string;
  small?: boolean;
  /** Which formats to offer. Defaults to Excel + PDF. */
  formats?: ExportFormat[];
}

const FORMAT_LABEL: Record<ExportFormat, string> = { excel: 'Excel (.xlsx)', csv: 'CSV (.csv)', pdf: 'PDF' };

/** "Export ▾" button with a menu of file formats. */
export default function ExportMenu({ onExport, label = 'Export', small = false, formats = ['excel', 'pdf'] }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(true);
    try {
      await onExport(format);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-menu" ref={ref}>
      <button
        className={`btn-secondary ${small ? 'btn-small' : ''}`}
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? 'Preparing…' : label} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="export-options" role="menu">
          {formats.map(f => (
            <button key={f} role="menuitem" onClick={() => run(f)}>
              {f === 'pdf' ? <FileText size={16} /> : <FileSpreadsheet size={16} />} {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
