const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

export interface AcademicYearOption {
  value: string
  label: string
}

export interface AcademicYear {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  isActive: boolean
}

export function getCurrentAcademicYear() {
  const today = new Date()
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return `${startYear}-${startYear + 1}`
}

export function toAcademicYearOptions(
  years: Array<string | null | undefined>,
  fallbackYear?: string | null
): AcademicYearOption[] {
  const normalized = new Set<string>()

  years.forEach((value) => {
    const year = value?.trim()
    if (year && ACADEMIC_YEAR_PATTERN.test(year)) {
      normalized.add(year)
    }
  })

  const fallback = fallbackYear?.trim() || getCurrentAcademicYear()
  if (normalized.size === 0 && ACADEMIC_YEAR_PATTERN.test(fallback)) {
    normalized.add(fallback)
  }

  return Array.from(normalized)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: value }))
}
