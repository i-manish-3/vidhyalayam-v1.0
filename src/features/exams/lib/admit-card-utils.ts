/**
 * Shared helpers for admit-card generation, used by both the school and parent
 * generate routes so parsing rules stay in one place.
 */

const MAX_INSTRUCTION_LINES = 12

/**
 * Parse the school's `admitCardInstructions` JSON column into a clean string[]
 * (or undefined to fall back to the generator defaults). Defensive on the read
 * path: rejects non-arrays, keeps only non-empty strings, and caps the count so
 * a malformed/migrated row can't flood the card.
 */
export function parseAdmitCardInstructions(raw: string | null | undefined): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return undefined
    const lines = parsed
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, MAX_INSTRUCTION_LINES)
    return lines.length > 0 ? lines : undefined
  } catch {
    return undefined
  }
}
