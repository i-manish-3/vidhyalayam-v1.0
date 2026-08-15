/**
 * DiffViewer Component
 *
 * Displays before/after comparison of audit log changes in a human-readable
 * key-value format. Raw JSON is available behind a "Show technical details"
 * disclosure for power users.
 */

'use client'

import React, { useState } from 'react'
import { FieldList, formatFieldLabel, renderFieldValue } from './audit-field-list'

interface DiffViewerProps {
  oldValue: any
  newValue: any
  /** Optional per-field value resolver (e.g. map userId → user name). Return undefined to fall back to default rendering. */
  resolve?: (key: string, value: unknown) => React.ReactNode | undefined
}

interface FieldChange {
  field: string
  oldValue: any
  newValue: any
}

export function DiffViewer({ oldValue, newValue, resolve }: DiffViewerProps) {
  const [showRaw, setShowRaw] = useState(false)

  if (!oldValue && !newValue) {
    return <div className="text-sm text-gray-500 italic">No details available</div>
  }

  // CREATE — only new value exists
  if (!oldValue && newValue) {
    return (
      <div className="space-y-2">
        <FieldList data={newValue} tone="positive" resolve={resolve} />
        <RawJsonDisclosure
          show={showRaw}
          onToggle={() => setShowRaw(v => !v)}
          newValue={newValue}
          oldValue={null}
        />
      </div>
    )
  }

  // DELETE — only old value exists
  if (oldValue && !newValue) {
    return (
      <div className="space-y-2">
        <FieldList data={oldValue} tone="negative" resolve={resolve} />
        <RawJsonDisclosure
          show={showRaw}
          onToggle={() => setShowRaw(v => !v)}
          newValue={null}
          oldValue={oldValue}
        />
      </div>
    )
  }

  // UPDATE — show changed fields only
  const changes = calculateChanges(oldValue, newValue)

  if (changes.length === 0) {
    return <div className="text-sm text-gray-500 italic">No field changes detected</div>
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-gray-200 divide-y divide-gray-200 overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[10rem_1fr_1fr] gap-3 px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div>Field</div>
          <div>Before</div>
          <div>After</div>
        </div>
        {changes.map(change => (
          <div key={change.field} className="grid grid-cols-[10rem_1fr_1fr] gap-3 px-3 py-2 items-start text-sm">
            <div className="text-xs font-medium text-gray-600 pt-0.5">
              {formatFieldLabel(change.field)}
            </div>
            <div className="text-red-700 line-through decoration-red-300 break-words min-w-0">
              {resolve
                ? resolve(change.field, change.oldValue) ?? renderFieldValue(change.field, change.oldValue)
                : renderFieldValue(change.field, change.oldValue)}
            </div>
            <div className="text-green-700 font-medium break-words min-w-0">
              {resolve
                ? resolve(change.field, change.newValue) ?? renderFieldValue(change.field, change.newValue)
                : renderFieldValue(change.field, change.newValue)}
            </div>
          </div>
        ))}
      </div>
      <RawJsonDisclosure
        show={showRaw}
        onToggle={() => setShowRaw(v => !v)}
        newValue={newValue}
        oldValue={oldValue}
      />
    </div>
  )
}

interface RawJsonDisclosureProps {
  show: boolean
  onToggle: () => void
  oldValue: any
  newValue: any
}

function RawJsonDisclosure({ show, onToggle, oldValue, newValue }: RawJsonDisclosureProps) {
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={onToggle}
        className="text-xs text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
      >
        {show ? 'Hide technical details' : 'Show technical details'}
      </button>
      {show && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
          {oldValue && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Before (raw)</div>
              <pre className="text-[11px] bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto max-h-64">
                {JSON.stringify(oldValue, null, 2)}
              </pre>
            </div>
          )}
          {newValue && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">After (raw)</div>
              <pre className="text-[11px] bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto max-h-64">
                {JSON.stringify(newValue, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function calculateChanges(oldValue: any, newValue: any): FieldChange[] {
  const changes: FieldChange[] = []
  if (!oldValue || !newValue) return changes

  const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)])

  allKeys.forEach(key => {
    // Skip noise fields
    if (['id', 'createdAt', 'updatedAt', 'schoolId', 'version'].includes(key)) return

    const oldVal = oldValue[key]
    const newVal = newValue[key]

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal })
    }
  })

  return changes
}
