/**
 * Pure validation for a single MarksEntry before persistence. Every function
 * here is deterministic and side-effect-free — callable from the API, the
 * bulk-upsert loop, or a client-side preview before the PUT round-trip.
 */

export interface MarksEntryInput {
  studentId: string
  componentId?: string | null
  numericValue: number | null
  gradeValue?: string | null
  status: 'entered' | 'absent' | 'medical_leave' | 'not_applicable'
  remarks?: string | null
}

export interface ComponentRef {
  id: string
  name: string
  maxMarks: number
  gradeOnly: boolean
}

export interface SubjectConfigRef {
  id: string
  totalMarks: number
  passingPercentage: number
  gradeOnly: boolean
  components: ComponentRef[]
}

export type MarksValidationError =
  | { field: 'numericValue' | 'status' | 'gradeValue' | 'componentId'; message: string }
  | { field: 'general'; message: string }

/**
 * Validate one entry row against its subject config and component definitions.
 * Caller is responsible for first checking that the row is not locked
 * (lockedAt != null) — this function only validates the data shape.
 */
export function validateMarksEntry(
  entry: MarksEntryInput,
  config: SubjectConfigRef,
): MarksValidationError | null {
  // Resolve component if provided
  const component = entry.componentId
    ? (config.components.find((c) => c.id === entry.componentId) ?? null)
    : null

  // If config is grade-only and no specific component is referenced, only
  // gradeValue is accepted; numericValue must be null.
  if (config.gradeOnly && !component) {
    if (entry.numericValue !== null) {
      return { field: 'numericValue', message: 'Grade-only subject — numeric marks are not accepted.' }
    }
    if (entry.gradeValue !== undefined && entry.gradeValue !== null && typeof entry.gradeValue !== 'string') {
      return { field: 'gradeValue', message: 'Grade value must be a letter-grade code.' }
    }
    return null
  }

  // If we have a grade-only component, same rule — no numericValue, grade required.
  if (component?.gradeOnly) {
    if (entry.numericValue !== null) {
      return { field: 'numericValue', message: `"${component.name}" is grade-only — numeric marks are not accepted.` }
    }
    if (entry.gradeValue === undefined || entry.gradeValue === null || typeof entry.gradeValue !== 'string') {
      return { field: 'gradeValue', message: `"${component.name}" requires a grade code.` }
    }
    return null
  }

  // Non-grade component or config-level entry — validate numericValue.
  const maxMarks = component ? component.maxMarks : config.totalMarks

  const absentStatuses = new Set(['absent', 'medical_leave', 'not_applicable'])

  if (absentStatuses.has(entry.status)) {
    if (entry.numericValue !== null) {
      return {
        field: 'numericValue',
        message: `Status is "${entry.status}" — marks must be empty. To record marks, set status to "entered".`,
      }
    }
    return null
  }

  if (entry.numericValue === null || entry.numericValue === undefined) {
    // If status is 'entered' but no marks, it's still a valid draft state.
    // We don't enforce non-null until submission — that's an API-layer check.
    return null
  }

  if (!Number.isFinite(entry.numericValue) || entry.numericValue < 0) {
    return { field: 'numericValue', message: 'Marks cannot be negative.' }
  }

  if (entry.numericValue > maxMarks) {
    return {
      field: 'numericValue',
      message: `Marks (${entry.numericValue}) exceed maximum (${maxMarks}) for ${component ? `"${component.name}"` : 'this subject'}.`,
    }
  }

  return null
}

/**
 * Validate a batch of entries, returning only the first error per entry.
 * Entry order is preserved; `index` tells caller which row failed.
 */
export function validateMarksBatch(
  entries: MarksEntryInput[],
  configsByComponent: Map<string | '__config__', ComponentRef & { subjectConfig: SubjectConfigRef }>,
): { index: number; error: MarksValidationError }[] {
  const errors: { index: number; error: MarksValidationError }[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const key = entry.componentId ?? '__config__'
    const resolved = configsByComponent.get(key)
    if (!resolved) {
      errors.push({ index: i, error: { field: 'componentId', message: 'Unknown component.' } })
      continue
    }
    const err = validateMarksEntry(entry, resolved.subjectConfig)
    if (err) errors.push({ index: i, error: err })
  }
  return errors
}
