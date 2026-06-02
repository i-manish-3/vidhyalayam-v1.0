/**
 * Pure conflict detection for exam schedule rows. Used by both the schedule
 * APIs and the schedule UI's "preview conflicts" affordance.
 *
 * Conflict rules (within a single school):
 * 1. Two rows for the same exam cannot share (classId, sectionId|null, subjectId).
 *    This is also enforced by the unique index — we surface it earlier for UX.
 * 2. Two rows on the same (classId, sectionId, examDate) cannot overlap in time
 *    unless they are the SAME subject (which already collapses under rule 1).
 *    A section with `sectionId: null` (i.e. "all sections of class") conflicts
 *    with any section-scoped row on the same class+date.
 * 3. A single invigilator cannot proctor two rows whose [start, end] intervals
 *    overlap on the same date.
 */

export interface ScheduleRow {
  id?: string
  classId: string
  sectionId: string | null
  subjectId: string
  examDate: Date | string
  startTime: string // "HH:MM"
  endTime: string // "HH:MM"
  invigilatorId?: string | null
}

export interface ScheduleConflict {
  reason:
    | 'duplicate_subject'
    | 'time_overlap'
    | 'invigilator_double_booked'
  message: string
  rowAId?: string
  rowBId?: string
  rowAIndex?: number
  rowBIndex?: number
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/

export function minutesOfDay(hhmm: string): number {
  const m = TIME_RE.exec(hhmm)
  if (!m) throw new Error(`Invalid time "${hhmm}". Expected HH:MM.`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error(`Invalid time "${hhmm}". Hours 0-23, minutes 0-59.`)
  }
  return h * 60 + min
}

function dateKey(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d)
  // Drop the time portion — schedule conflicts are per-day.
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
}

function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1]
}

function classSectionMatches(a: ScheduleRow, b: ScheduleRow): boolean {
  if (a.classId !== b.classId) return false
  // null sectionId means "all sections of class" — it conflicts with everything
  // on that class.
  if (a.sectionId === null || b.sectionId === null) return true
  return a.sectionId === b.sectionId
}

/**
 * Inspect a candidate set of rows for internal conflicts. Returns the FIRST
 * detected conflict per pair so callers can iterate without quadratic noise.
 */
export function detectScheduleConflicts(rows: ReadonlyArray<ScheduleRow>): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = []
  const normalized = rows.map((r) => ({
    row: r,
    interval: [minutesOfDay(r.startTime), minutesOfDay(r.endTime)] as [number, number],
    dKey: dateKey(r.examDate),
  }))

  for (let i = 0; i < normalized.length; i++) {
    const a = normalized[i]
    if (a.interval[1] <= a.interval[0]) {
      conflicts.push({
        reason: 'time_overlap',
        message: `Row ${i + 1}: end time must be after start time.`,
        rowAIndex: i,
      })
      continue
    }

    for (let j = i + 1; j < normalized.length; j++) {
      const b = normalized[j]
      if (a.dKey !== b.dKey) continue

      // Rule 1: same class/section/subject duplicate.
      if (classSectionMatches(a.row, b.row) && a.row.subjectId === b.row.subjectId) {
        conflicts.push({
          reason: 'duplicate_subject',
          message: 'Two schedule rows share the same class, section, and subject on the same day.',
          rowAIndex: i,
          rowBIndex: j,
          rowAId: a.row.id,
          rowBId: b.row.id,
        })
        continue
      }

      // Rule 2: same class+section, different subjects, overlapping time.
      if (
        classSectionMatches(a.row, b.row) &&
        intervalsOverlap(a.interval, b.interval)
      ) {
        conflicts.push({
          reason: 'time_overlap',
          message:
            'Two subjects scheduled for the same class/section overlap in time. Stagger their windows.',
          rowAIndex: i,
          rowBIndex: j,
          rowAId: a.row.id,
          rowBId: b.row.id,
        })
        continue
      }

      // Rule 3: same invigilator, overlapping time on same day.
      if (
        a.row.invigilatorId &&
        b.row.invigilatorId &&
        a.row.invigilatorId === b.row.invigilatorId &&
        intervalsOverlap(a.interval, b.interval)
      ) {
        conflicts.push({
          reason: 'invigilator_double_booked',
          message: 'The same invigilator is assigned to two overlapping slots.',
          rowAIndex: i,
          rowBIndex: j,
          rowAId: a.row.id,
          rowBId: b.row.id,
        })
      }
    }
  }

  return conflicts
}

/**
 * Compare a candidate row against existing persisted rows (e.g. fetched from the
 * DB). Returns conflicts the candidate would introduce. `existing` should NOT
 * include the candidate itself when it is an update — filter by id first.
 */
export function detectConflictsAgainst(
  candidate: ScheduleRow,
  existing: ReadonlyArray<ScheduleRow>,
): ScheduleConflict[] {
  return detectScheduleConflicts([candidate, ...existing]).filter(
    (c) => c.rowAIndex === 0 || c.rowBIndex === 0,
  )
}
