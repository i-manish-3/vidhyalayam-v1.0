interface PrintableTeacher {
  firstName?: string | null
  lastName?: string | null
}

interface PrintableSubject {
  name?: string | null
}

interface PrintableSection {
  name?: string | null
  class?: { name?: string | null } | null
}

export interface PrintableTimetableEntry {
  day: string
  period: number
  teacherId?: string | null
  subject?: PrintableSubject | null
  teacher?: PrintableTeacher | null
  section?: PrintableSection | null
}

export interface PrintablePeriodConfig {
  period: number
  startTime: string
  endTime: string
  label: string
  isBreak?: boolean
}

interface PrintTimetableOptions {
  title: string
  subtitle?: string
  days: string[]
  entries: PrintableTimetableEntry[]
  periodConfigs: PrintablePeriodConfig[]
  currentTeacherId?: string | null
  showSection?: boolean
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function teacherName(entry: PrintableTimetableEntry, currentTeacherId?: string | null): string {
  if (entry.teacherId && currentTeacherId && entry.teacherId === currentTeacherId) return 'You'
  const name = [entry.teacher?.firstName, entry.teacher?.lastName].filter(Boolean).join(' ').trim()
  return name || '-'
}

function sectionName(entry: PrintableTimetableEntry): string {
  return [entry.section?.class?.name, entry.section?.name].filter(Boolean).join(' - ')
}

export function openTimetablePrint(options: PrintTimetableOptions): void {
  const fallbackPeriods = [...new Set(options.entries.map((entry) => entry.period))]
    .sort((a, b) => a - b)
    .map((period) => ({
      period,
      startTime: '',
      endTime: '',
      label: `P${period}`,
    }))
  const sortedPeriods = (options.periodConfigs.length > 0 ? options.periodConfigs : fallbackPeriods)
    .sort((a, b) => a.period - b.period)
  const generatedAt = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const rows = sortedPeriods.map((period) => {
    if (period.isBreak) {
      return `
        <tr>
          <th class="period">${escapeHtml(period.label)}<br><span>${escapeHtml(period.startTime)} - ${escapeHtml(period.endTime)}</span></th>
          <td class="break" colspan="${options.days.length}">${escapeHtml(period.label)} · ${escapeHtml(period.startTime)} - ${escapeHtml(period.endTime)}</td>
        </tr>`
    }

    const cells = options.days.map((day) => {
      const entry = options.entries.find((item) => item.day === day && item.period === period.period)
      if (!entry) return '<td class="empty">-</td>'
      const section = options.showSection ? sectionName(entry) : ''
      return `
        <td>
          <div class="subject">${escapeHtml(entry.subject?.name || 'Subject')}</div>
          <div class="teacher">${escapeHtml(teacherName(entry, options.currentTeacherId))}</div>
          ${section ? `<div class="section">${escapeHtml(section)}</div>` : ''}
        </td>`
    }).join('')

    return `
      <tr>
        <th class="period">${escapeHtml(period.label)}<br><span>${escapeHtml(period.startTime)} - ${escapeHtml(period.endTime)}</span></th>
        ${cells}
      </tr>`
  }).join('')

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, sans-serif; background: #fff; }
    .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; padding: 12px; background: #fff; border-bottom: 1px solid #e5e7eb; }
    button { border: 0; border-radius: 8px; background: #111827; color: #fff; padding: 9px 18px; font-weight: 700; cursor: pointer; }
    .sheet { padding: 18px; }
    .header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; border-bottom: 2px solid #111827; padding-bottom: 10px; }
    h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .subtitle { margin-top: 4px; color: #4b5563; font-size: 12px; }
    .generated { color: #6b7280; font-size: 11px; text-align: right; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 7px; vertical-align: top; }
    thead th { background: #f3f4f6; font-size: 12px; text-align: center; }
    .period { width: 92px; background: #f9fafb; text-align: center; font-size: 11px; }
    .period span { color: #6b7280; font-size: 9px; font-weight: 500; }
    td { min-height: 56px; font-size: 11px; }
    .subject { font-weight: 700; }
    .teacher, .section { margin-top: 3px; color: #4b5563; font-size: 10px; }
    .section { color: #6b7280; }
    .empty { color: #9ca3af; text-align: center; vertical-align: middle; }
    .break { background: #fff7ed; color: #c2410c; text-align: center; font-weight: 700; }
    @media print {
      .toolbar { display: none; }
      .sheet { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
  <main class="sheet">
    <section class="header">
      <div>
        <h1>${escapeHtml(options.title)}</h1>
        ${options.subtitle ? `<div class="subtitle">${escapeHtml(options.subtitle)}</div>` : ''}
      </div>
      <div class="generated">Generated<br>${escapeHtml(generatedAt)}</div>
    </section>
    <table>
      <thead>
        <tr>
          <th class="period">Period</th>
          ${options.days.map((day) => `<th>${escapeHtml(day)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
  <script>window.setTimeout(function(){ window.print(); }, 250);</script>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=1200,height=800')
  if (!printWindow) {
    window.print()
    return
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}
