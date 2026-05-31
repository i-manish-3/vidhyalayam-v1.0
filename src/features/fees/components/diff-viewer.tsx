/**
 * DiffViewer Component
 *
 * Displays before/after comparison of audit log changes.
 * Shows side-by-side or unified diff view.
 */

import React from 'react'

interface DiffViewerProps {
  oldValue: any
  newValue: any
  mode?: 'side-by-side' | 'unified'
}

export function DiffViewer({ oldValue, newValue, mode = 'unified' }: DiffViewerProps) {
  if (!oldValue && !newValue) {
    return <div className="text-sm text-gray-500">No changes to display</div>
  }

  // If only new value exists, it's a creation
  if (!oldValue && newValue) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700">Created</div>
        <div className="rounded-md bg-green-50 p-3 border border-green-200">
          <pre className="text-xs text-green-900 whitespace-pre-wrap overflow-x-auto">
            {JSON.stringify(newValue, null, 2)}
          </pre>
        </div>
      </div>
    )
  }

  // If only old value exists, it's a deletion
  if (oldValue && !newValue) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700">Deleted</div>
        <div className="rounded-md bg-red-50 p-3 border border-red-200">
          <pre className="text-xs text-red-900 whitespace-pre-wrap overflow-x-auto">
            {JSON.stringify(oldValue, null, 2)}
          </pre>
        </div>
      </div>
    )
  }

  // Both exist - show diff
  const changes = calculateChanges(oldValue, newValue)

  if (mode === 'side-by-side') {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Before</div>
          <div className="rounded-md bg-red-50 p-3 border border-red-200">
            <pre className="text-xs text-red-900 whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(oldValue, null, 2)}
            </pre>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">After</div>
          <div className="rounded-md bg-green-50 p-3 border border-green-200">
            <pre className="text-xs text-green-900 whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(newValue, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    )
  }

  // Unified view - show only changed fields
  return (
    <div className="space-y-3">
      {changes.length === 0 ? (
        <div className="text-sm text-gray-500">No changes detected</div>
      ) : (
        changes.map((change, index) => (
          <div key={index} className="space-y-1">
            <div className="text-sm font-medium text-gray-700">{change.field}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-red-50 p-2 border border-red-200">
                <div className="text-xs text-red-600 font-medium mb-1">Before</div>
                <div className="text-xs text-red-900">
                  {formatValue(change.oldValue)}
                </div>
              </div>
              <div className="rounded-md bg-green-50 p-2 border border-green-200">
                <div className="text-xs text-green-600 font-medium mb-1">After</div>
                <div className="text-xs text-green-900">
                  {formatValue(change.newValue)}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

interface Change {
  field: string
  oldValue: any
  newValue: any
}

function calculateChanges(oldValue: any, newValue: any): Change[] {
  const changes: Change[] = []

  if (!oldValue || !newValue) return changes

  const allKeys = new Set([
    ...Object.keys(oldValue),
    ...Object.keys(newValue),
  ])

  allKeys.forEach(key => {
    // Skip metadata fields
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
      return
    }

    const oldVal = oldValue[key]
    const newVal = newValue[key]

    // Deep comparison
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field: formatFieldName(key),
        oldValue: oldVal,
        newValue: newVal,
      })
    }
  })

  return changes
}

function formatFieldName(field: string): string {
  // Convert camelCase to Title Case
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}

function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'null'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'number') {
    return value.toString()
  }

  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 100) {
      return `${value.substring(0, 97)}...`
    }
    return value
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }

  return String(value)
}
