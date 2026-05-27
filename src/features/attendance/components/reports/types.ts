import type { SchoolForPrintHeader } from '@/lib/print-header'

export interface ClassOption { id: string; name: string }
export interface SectionOption { id: string; name: string; classId: string }

// Filters owned by the parent page and shared across report tabs.
export interface SharedReportProps {
  academicYear: string
  school: SchoolForPrintHeader | null
  classes: ClassOption[]
  sections: SectionOption[]
  dateFrom: string
  dateTo: string
  classId: string
  sectionId: string
}

export function formatRangeLabel(dateFrom: string, dateTo: string): string {
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`
}

export function classSectionLabel(
  classes: ClassOption[],
  sections: SectionOption[],
  classId: string,
  sectionId: string,
): string {
  const cls = classes.find((c) => c.id === classId)?.name
  const sec = sections.find((s) => s.id === sectionId)?.name
  if (!cls) return 'All classes'
  return sec ? `${cls} — ${sec}` : cls
}

// Triggers a CSV download from a report API endpoint with the given params.
export async function downloadReportCsv(
  endpoint: string,
  params: Record<string, string>,
  filename: string,
): Promise<void> {
  const qs = new URLSearchParams({ ...params, format: 'csv' })
  const res = await fetch(`${endpoint}?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Export failed: ${res.status}`)
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
