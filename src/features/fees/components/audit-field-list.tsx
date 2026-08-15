/**
 * FieldList Component
 *
 * Renders an object as a human-readable list of "label: value" rows.
 * Used by audit trail UI to display snapshots and metadata without raw JSON.
 *
 * Handles:
 * - camelCase → "Title Case" field labels (with ID, URL acronym fixes)
 * - Currency / date / boolean / null formatting from field name heuristics
 * - Hides noisy internal fields (id, schoolId, createdAt, etc.)
 */

import React from 'react'

interface FieldListProps {
  data: Record<string, any> | null | undefined
  /** Extra fields to hide on top of the default noise list */
  hideFields?: string[]
  /** Render label column wider/narrower; default 'auto' */
  labelWidth?: 'auto' | 'wide'
  /** Tone for the container */
  tone?: 'neutral' | 'positive' | 'negative'
  /** Optional per-field value resolver (e.g. map userId → user name). Return undefined to fall back to default rendering. */
  resolve?: (key: string, value: unknown) => React.ReactNode | undefined
}

const HIDDEN_FIELDS = new Set([
  'id',
  'schoolId',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'version',
  '_truncated',
  '_originalSize',
  '_summary',
])

const CURRENCY_FIELD_PATTERN = /^(amount|paidAmount|totalAmount|subtotal|discount|concession|scholarship|fine|balance|balanceAmount|previousBalance|debit|credit|lateFeeAmount|fee|fareAmount|cancelledAmount|totalRefundDue|grossSalary|netSalary|basicSalary|hra|da|ta|pf|esi|tax)$/i

const DATE_FIELD_PATTERN = /(date|at|from|to|expiresAt|issuedDate|voidedAt|lockedAt|effectiveFrom|effectiveTo|lastActiveAt)$/i

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export function FieldList({ data, hideFields = [], labelWidth = 'auto', tone = 'neutral', resolve }: FieldListProps) {
  if (!data || typeof data !== 'object') {
    return <div className="text-sm text-gray-500 italic">No details to show</div>
  }

  const hideSet = new Set([...HIDDEN_FIELDS, ...hideFields])
  const entries = Object.entries(data).filter(([key, value]) => {
    if (hideSet.has(key)) return false
    // Hide undefined values entirely — null is shown as "—"
    if (value === undefined) return false
    return true
  })

  if (entries.length === 0) {
    return <div className="text-sm text-gray-500 italic">No details to show</div>
  }

  const labelCol = labelWidth === 'wide' ? 'w-48' : 'w-36'
  const toneBg =
    tone === 'positive' ? 'bg-green-50/60 border-green-200'
    : tone === 'negative' ? 'bg-red-50/60 border-red-200'
    : 'bg-gray-50 border-gray-200'

  return (
    <dl className={`rounded-md border ${toneBg} divide-y divide-gray-200/70`}>
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-4 px-3 py-2">
          <dt className={`${labelCol} flex-shrink-0 text-xs font-medium text-gray-500 pt-0.5`}>
            {formatFieldLabel(key)}
          </dt>
          <dd className="flex-1 text-sm text-gray-900 min-w-0">
            {resolve
              ? resolve(key, value) ?? renderFieldValue(key, value)
              : renderFieldValue(key, value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Convert camelCase / snake_case to Title Case with smart acronym handling.
 * "paymentMethod" → "Payment Method"
 * "studentId" → "Student ID"
 * "ipAddress" → "IP Address"
 * "feeHeadName" → "Fee Head Name"
 */
export function formatFieldLabel(field: string): string {
  // snake_case → space
  const spaced = field
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()

  // Title case each word, but uppercase short common acronyms
  const acronyms = new Set(['ID', 'IP', 'URL', 'UA', 'AY', 'PEN', 'IFSC', 'TC', 'EWS', 'OBC', 'PF', 'ESI', 'DA', 'HRA', 'TA'])
  return spaced
    .split(/\s+/)
    .map(word => {
      const upper = word.toUpperCase()
      if (acronyms.has(upper)) return upper
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Render a single field value as JSX with type-aware formatting.
 */
export function renderFieldValue(key: string, value: any): React.ReactNode {
  // Null / empty → em dash
  if (value === null || value === '') {
    return <span className="text-gray-400">—</span>
  }

  // Redacted marker
  if (value === '[REDACTED]') {
    return <span className="text-gray-400 italic">•••••• (hidden)</span>
  }

  // Truncated marker
  if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']') && /^\[\d+ (items?|lines?)\]$/.test(value)) {
    return <span className="text-gray-500 italic">{value}</span>
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value
      ? <span className="inline-flex items-center gap-1 text-green-700 font-medium">Yes</span>
      : <span className="inline-flex items-center gap-1 text-gray-500">No</span>
  }

  // Currency
  if (typeof value === 'number' && CURRENCY_FIELD_PATTERN.test(key)) {
    return <span className="font-medium">{formatCurrency(value)}</span>
  }

  // Number (non-currency)
  if (typeof value === 'number') {
    return <span>{value.toLocaleString('en-IN')}</span>
  }

  // Date (ISO string or matches date-like field name)
  if (typeof value === 'string' && (ISO_DATE_PATTERN.test(value) || (DATE_FIELD_PATTERN.test(key) && !isNaN(Date.parse(value))))) {
    return <span>{formatDateTime(value)}</span>
  }

  // Currency (string number with field hint)
  if (typeof value === 'string' && CURRENCY_FIELD_PATTERN.test(key) && !isNaN(Number(value))) {
    return <span className="font-medium">{formatCurrency(Number(value))}</span>
  }

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400">(empty)</span>
    // If small array of primitives, list comma-separated
    if (value.length <= 5 && value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return <span>{value.join(', ')}</span>
    }
    return <span className="text-gray-500 italic">{value.length} {value.length === 1 ? 'item' : 'items'}</span>
  }

  // Nested object — render compact summary
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return <span className="text-gray-400">(empty)</span>
    return (
      <span className="text-gray-500 italic">{keys.length} {keys.length === 1 ? 'field' : 'fields'}</span>
    )
  }

  // String — show as-is, but mono-space ID-looking values
  if (typeof value === 'string') {
    if (/^(c[a-z0-9]{20,}|[a-z0-9]{24,})$/i.test(value)) {
      return <span className="font-mono text-xs">{value}</span>
    }
    return <span>{value}</span>
  }

  return <span>{String(value)}</span>
}

/**
 * Format a number as Indian Rupees with grouping.
 * 150000 → "₹1,50,000.00"
 */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Format an ISO date string as "1 Jun 2026, 3:42 PM".
 * If date-only (no time component), shows just the date.
 */
export function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return String(value)
  const hasTime = typeof value === 'string' ? value.includes('T') : true
  if (!hasTime) {
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}
