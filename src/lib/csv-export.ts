/**
 * Client-side CSV export. Builds a quoted CSV from headers + rows and triggers a
 * browser download. Shared by every fee report so escaping and download behaviour
 * stay consistent.
 */

type Cell = string | number | null | undefined

function escapeCell(c: Cell): string {
  let s = c === null || c === undefined ? '' : String(c)
  // Neutralise spreadsheet formula injection: a cell starting with = + - @ (or a
  // control char) is executed as a formula by Excel/Calc even when quoted.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function buildCsv(headers: string[], rows: Cell[][], preamble?: string[][]): string {
  const lines: string[] = []
  if (preamble) {
    for (const pre of preamble) lines.push(pre.map(escapeCell).join(','))
    lines.push('')
  }
  lines.push(headers.map(escapeCell).join(','))
  for (const row of rows) lines.push(row.map(escapeCell).join(','))
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel reads UTF-8 (₹ etc.) correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Convenience: build + download in one call. */
export function exportCsv(
  filename: string,
  headers: string[],
  rows: Cell[][],
  preamble?: string[][],
): void {
  downloadCsv(filename, buildCsv(headers, rows, preamble))
}
