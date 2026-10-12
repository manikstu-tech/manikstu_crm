// Excel (.xlsx) and PDF export. The libraries are loaded only when someone exports,
// so they don't add to the page's initial load.

export type ExportFormat = 'excel' | 'pdf' | 'csv';

export interface ExportColumn {
  header: string;
  /** Excel column width in characters; also sets the column's share of the PDF page width. */
  width: number;
  /** Rupee amounts: a real number with ₹ format in Excel, "Rs. 1,250" in PDF (its built-in fonts have no ₹). */
  money?: boolean;
}

export interface ExportTable {
  filename: string; // without extension
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: (string | number | null)[][];
}

const BRAND_GREEN = '2D5016';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Workbook = import('exceljs').Workbook;

/** One formatted sheet (title, subtitle, header row, money columns, filters). */
function addSheet(wb: Workbook, { title, subtitle, columns, rows }: ExportTable, sheetName = title) {
  // Excel sheet names: max 31 characters, none of : \ / ? * [ ]
  const ws = wb.addWorksheet(sheetName.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31));

  // Title rows above the table
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: `FF${BRAND_GREEN}` } };
  if (subtitle) ws.addRow([subtitle]).font = { italic: true, color: { argb: 'FF6B6A5C' } };
  ws.addRow([]);

  const headerRow = ws.addRow(columns.map(c => c.header));
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_GREEN}` } };
    cell.alignment = { vertical: 'middle' };
  });
  rows.forEach(r => {
    const row = ws.addRow(r.map(v => v ?? ''));
    row.alignment = { vertical: 'top', wrapText: true };
  });

  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width;
    if (c.money) {
      col.eachCell((cell, rowNumber) => {
        if (rowNumber > headerRow.number) {
          cell.numFmt = '"₹"#,##,##0';
          cell.alignment = { vertical: 'top', horizontal: 'right' };
        }
      });
    }
  });
  ws.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: columns.length } };
  ws.views = [{ state: 'frozen', ySplit: headerRow.number }];
}

async function saveWorkbook(wb: Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}

export async function exportExcel(table: ExportTable) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Manikstu CRM';
  addSheet(wb, table);
  await saveWorkbook(wb, table.filename);
}

/** Several tables in one Excel file, one sheet each (sheet names given with each table). */
export async function exportWorkbook(filename: string, sheets: { name: string; table: ExportTable }[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Manikstu CRM';
  sheets.forEach(({ name, table }) => addSheet(wb, table, name));
  await saveWorkbook(wb, filename);
}

export async function exportPdf({ filename, title, subtitle, columns, rows }: ExportTable) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 36;
  const usable = doc.internal.pageSize.getWidth() - margin * 2;
  const totalWidth = columns.reduce((a, c) => a + c.width, 0);

  doc.setFontSize(15);
  doc.setTextColor(45, 80, 22);
  doc.text(title, margin, 40);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(107, 106, 92);
    doc.text(subtitle, margin, 56);
  }

  autoTable(doc, {
    startY: subtitle ? 68 : 56,
    margin: { left: margin, right: margin },
    head: [columns.map(c => c.header)],
    body: rows.map(r => r.map((v, i) => {
      if (v === null) return '';
      if (columns[i].money && typeof v === 'number') return `Rs. ${Math.round(v).toLocaleString('en-IN')}`;
      return String(v);
    })),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [45, 80, 22], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [253, 246, 236] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, {
      cellWidth: (c.width / totalWidth) * usable,
      halign: c.money ? 'right' : 'left',
    }])),
    didParseCell: data => {
      if (data.section === 'head' && columns[data.column.index]?.money) data.cell.styles.halign = 'right';
    },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(107, 106, 92);
      doc.text(`Manikstu Agri Network · page ${page}`, margin, doc.internal.pageSize.getHeight() - 16);
    },
  });

  doc.save(`${filename}.pdf`);
}

/** Plain CSV (opens in Excel / Sheets / anything). A BOM keeps UTF-8 names correct in Excel. */
export async function exportCsv({ filename, columns, rows }: ExportTable) {
  const cell = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(c => cell(c.header)).join(',')];
  rows.forEach(r => lines.push(r.map(cell).join(',')));
  const csv = '﻿' + lines.join('\r\n');
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

export function exportTable(format: ExportFormat, table: ExportTable) {
  if (format === 'excel') return exportExcel(table);
  if (format === 'csv') return exportCsv(table);
  return exportPdf(table);
}
