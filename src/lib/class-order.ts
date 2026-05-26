type ClassLike = {
  name?: string | null
}

const EARLY_CLASS_RANKS: Array<{ patterns: RegExp[]; rank: number }> = [
  { rank: 1, patterns: [/^play\s*(group|school)?$/i, /^pg$/i] },
  { rank: 2, patterns: [/^pre[\s-]*nursery$/i, /^pre[\s-]*nursary$/i] },
  { rank: 3, patterns: [/^nursery$/i, /^nursary$/i] },
  { rank: 4, patterns: [/^lkg$/i, /^lower\s*kg$/i, /^lower\s*kindergarten$/i, /^jr\.?\s*kg$/i, /^junior\s*kg$/i] },
  { rank: 5, patterns: [/^ukg$/i, /^upper\s*kg$/i, /^upper\s*kindergarten$/i, /^sr\.?\s*kg$/i, /^senior\s*kg$/i] },
]

function normalizeClassName(name: string | null | undefined) {
  return (name || '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function getClassSortRank(name: string | null | undefined) {
  const normalized = normalizeClassName(name)
  const compact = normalized.replace(/[._]/g, ' ')

  for (const entry of EARLY_CLASS_RANKS) {
    if (entry.patterns.some((pattern) => pattern.test(compact))) {
      return { group: 0, rank: entry.rank, label: normalized.toLowerCase() }
    }
  }

  const numberedMatch = compact.match(/^(?:class|grade|std|standard)?\s*([0-9]{1,2})(?:st|nd|rd|th)?$/i)
    || compact.match(/^(?:class|grade|std|standard)\s*[-:]?\s*([0-9]{1,2})(?:st|nd|rd|th)?$/i)

  if (numberedMatch) {
    return { group: 1, rank: Number(numberedMatch[1]), label: normalized.toLowerCase() }
  }

  return { group: 2, rank: Number.MAX_SAFE_INTEGER, label: normalized.toLowerCase() }
}

export function compareClassNames(a: string | null | undefined, b: string | null | undefined) {
  const left = getClassSortRank(a)
  const right = getClassSortRank(b)

  if (left.group !== right.group) return left.group - right.group
  if (left.rank !== right.rank) return left.rank - right.rank
  return left.label.localeCompare(right.label, 'en', { numeric: true, sensitivity: 'base' })
}

export function sortClassesByNaturalOrder<T extends ClassLike>(classes: T[]) {
  return [...classes].sort((a, b) => compareClassNames(a.name, b.name))
}
