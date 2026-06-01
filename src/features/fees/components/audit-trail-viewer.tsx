/**
 * AuditTrailViewer Component
 *
 * Timeline view of audit logs with expandable details.
 * Displays audit history with before/after diffs.
 */

'use client'

import React, { useState } from 'react'
import { DiffViewer } from './diff-viewer'
import { FieldList } from './audit-field-list'

interface AuditLog {
  id: string
  entityType: string
  entityId: string
  action: string
  studentId?: string
  userId?: string
  ipAddress?: string
  userAgent?: string
  oldValue: any
  newValue: any
  diffSummary?: string
  metadata: any
  createdAt: string
  student?: {
    id: string
    firstName: string
    lastName: string
    admissionNumber?: string
  }
  user?: {
    id: string
    name: string
    email: string
    role: string
  }
}

interface AuditTrailViewerProps {
  logs: AuditLog[]
  loading?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
}

export function AuditTrailViewer({
  logs,
  loading = false,
  onLoadMore,
  hasMore = false,
}: AuditTrailViewerProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedIds(newExpanded)
  }

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading audit logs...</div>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="text-sm text-gray-500 mb-2">No audit logs found</div>
          <div className="text-xs text-gray-400">
            Try adjusting your filters or date range
          </div>
        </div>
      </div>
    )
  }

  // Group logs by date
  const groupedLogs = groupByDate(logs)

  return (
    <div className="space-y-6">
      {Object.entries(groupedLogs).map(([date, dateLogs]) => (
        <div key={date} className="space-y-3">
          <div className="sticky top-0 bg-gray-50 px-4 py-2 rounded-md">
            <h3 className="text-sm font-medium text-gray-700">{date}</h3>
          </div>

          <div className="space-y-3">
            {dateLogs.map(log => {
              const isExpanded = expandedIds.has(log.id)

              return (
                <div
                  key={log.id}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                >
                  {/* Header */}
                  <button
                    onClick={() => toggleExpanded(log.id)}
                    className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <div className={`w-2 h-2 rounded-full ${getActionColor(log.action)}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {formatAction(log.action)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatEntityType(log.entityType)}
                        </span>
                      </div>

                      {log.diffSummary && (
                        <div className="text-sm text-gray-600 mb-2">
                          {log.diffSummary}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {log.student && (
                          <span>
                            Student: {log.student.firstName} {log.student.lastName}
                            {log.student.admissionNumber && ` (${log.student.admissionNumber})`}
                          </span>
                        )}
                        {log.user && (
                          <span>By: {log.user.name}</span>
                        )}
                        <span>{formatTime(log.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <div className="pt-4 space-y-4">
                        {/* Metadata */}
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-gray-500">Entity ID:</span>
                            <span className="ml-2 text-gray-900 font-mono">{log.entityId}</span>
                          </div>
                          {log.ipAddress && (
                            <div>
                              <span className="text-gray-500">IP Address:</span>
                              <span className="ml-2 text-gray-900 font-mono">{log.ipAddress}</span>
                            </div>
                          )}
                        </div>

                        {/* Diff Viewer */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Changes</h4>
                          <DiffViewer oldValue={log.oldValue} newValue={log.newValue} />
                        </div>

                        {/* Additional Metadata */}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                              Additional Information
                            </h4>
                            <FieldList data={log.metadata} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function groupByDate(logs: AuditLog[]): Record<string, AuditLog[]> {
  const groups: Record<string, AuditLog[]> = {}

  logs.forEach(log => {
    const date = formatDate(log.createdAt)
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(log)
  })

  return groups
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameDay(date, today)) {
    return 'Today'
  } else if (isSameDay(date, yesterday)) {
    return 'Yesterday'
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatEntityType(type: string): string {
  return type
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace('Student Fee', '')
    .trim()
}

function getActionColor(action: string): string {
  if (action.includes('created') || action.includes('recorded')) {
    return 'bg-green-500'
  }
  if (action.includes('deleted') || action.includes('voided')) {
    return 'bg-red-500'
  }
  if (action.includes('updated')) {
    return 'bg-blue-500'
  }
  return 'bg-gray-500'
}
