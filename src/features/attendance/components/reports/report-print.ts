import { buildPrintHeaderHtml, type SchoolForPrintHeader } from '@/lib/print-header'

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface PrintReportOptions {
  school: SchoolForPrintHeader | null
  title: string
  // Lines shown under the title (e.g. "Class 10-A · 01 May 2026 – 27 May 2026").
  meta?: string[]
  // Tabular content. Provide columns + rows for a table-based report.
  columns?: string[]
  rows?: (string | number | null | undefined)[][]
  // Alternative raw HTML body (e.g. the calendar grid) — used when the report
  // isn't a simple table. Ignored if columns/rows are provided.
  bodyHtml?: string
}

function buildTableHtml(columns: string[], rows: (string | number | null | undefined)[][]): string {
  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

// Opens a new window with a self-contained, print-styled HTML document and
// triggers the browser print dialog (Save as PDF). Mirrors the fee-receipt
// print path. Returns false if the popup was blocked.
export function printReport(options: PrintReportOptions): boolean {
  const { school, title, meta = [], columns, rows, bodyHtml } = options

  const headerHtml = buildPrintHeaderHtml(school, { fallbackToAutoHeader: true })
  const metaHtml = meta.filter(Boolean).map((m) => `<p class="meta">${escapeHtml(m)}</p>`).join('')
  const printedOn = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  })

  const content =
    columns && rows
      ? buildTableHtml(columns, rows)
      : bodyHtml || ''

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 0; font-size: 12px; }
  .report-title { text-align: center; font-size: 16px; font-weight: bold; margin: 14px 0 4px; }
  .meta { text-align: center; font-size: 11px; margin: 1px 0; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; font-size: 11px; }
  th { background: #f0f0f0; font-weight: bold; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 12px; }
  .cal-head { text-align: center; font-weight: bold; font-size: 11px; padding: 4px 0; }
  .cal-cell { border: 1px solid #ccc; min-height: 54px; padding: 4px; font-size: 10px; }
  .cal-cell .day { font-weight: bold; }
  .cal-cell .st { display: inline-block; margin-top: 4px; padding: 1px 5px; border-radius: 3px; font-size: 9px; }
  .printed-on { margin-top: 18px; text-align: right; font-size: 10px; color: #777; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  ${headerHtml}
  <div class="report-title">${escapeHtml(title)}</div>
  ${metaHtml}
  ${content}
  <div class="printed-on">Generated on ${escapeHtml(printedOn)}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  // Give the new document a tick to lay out before invoking print.
  win.onload = () => {
    win.focus()
    win.print()
  }
  // Fallback for browsers that don't fire onload on document.write.
  setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      /* window may already be closed */
    }
  }, 400)
  return true
}
