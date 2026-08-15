/**
 * AuditTrailViewer Component
 *
 * Timeline view of audit logs with expandable details.
 * Displays audit history with before/after diffs.
 */

'use client'

import React, { useState } from 'react'
import { CalendarDays, ChevronDown, Clock, GraduationCap, History, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DiffViewer } from './diff-viewer'
import { FieldList } from './audit-field-list'
import { cn } from '@/lib/utils'

interface AuditLog {
  id: string
  entityType: string
  entityId: string
  action: string
  studentId?: string
  userId?: string
  ipAddress?: string | null
  userAgent?: string | null
  oldValue: any
  newValue: any
  diffSummary?: string | null
  metadata: any
  createdAt: string
  student?: {
    id: string
    firstName: string
    lastName: string
    admissionNumber?: string
  } | null
  user?: {
    id: string
    name: string
    email: string
    role: string
  } | null
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
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading audit entries…
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-500/20 dark:to-cyan-500/20">
          <History className="size-5 text-teal-600 dark:text-teal-300" />
        </span>
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">No audit entries</h3>
          <p className="mx-auto max-w-xs text-xs text-muted-foreground">
            Try adjusting your filters or date range
          </p>
        </div>
      </div>
    )
  }

  // Group logs by date
  const groupedLogs = groupByDate(logs)

  return (
    <div className="divide-y divide-border">
      {Object.entries(groupedLogs).map(([date, dateLogs]) => (
        <div key={date}>
          {/* Sticky date header */}
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-sky-200/60 bg-gradient-to-r from-sky-100/95 via-teal-50/95 to-cyan-50/95 px-3 py-1.5 backdrop-blur dark:border-sky-500/20 dark:from-sky-500/15 dark:via-teal-500/10 dark:to-cyan-500/10 sm:px-5">
            <CalendarDays className="size-3.5 text-teal-600 dark:text-teal-300" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
              {date}
            </h3>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {dateLogs.length} {dateLogs.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div className="divide-y divide-border">
            {dateLogs.map(log => {
              const isExpanded = expandedIds.has(log.id)
              const tone = getActionTone(log.action)

              return (
                <div
                  key={log.id}
                  className="px-3 py-3 transition-colors hover:bg-muted/30 sm:px-5"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(log.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', tone.dot)} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{formatAction(log.action)}</span>
                        <Badge
                          variant="secondary"
                          className={cn('gap-1 text-[10px] font-medium', tone.chip)}
                        >
                          {formatEntityType(log.entityType)}
                        </Badge>
                        <span className="ml-auto text-[11px] text-muted-foreground" title={formatFullDateTime(log.createdAt)}>
                          {formatRelative(log.createdAt)}
                        </span>
                      </div>

                      {log.diffSummary && (
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">
                          {log.diffSummary}
                        </p>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {log.student && (
                          <span className="inline-flex items-center gap-1">
                            <GraduationCap className="size-3" />
                            {log.student.firstName} {log.student.lastName}
                            {log.student.admissionNumber && (
                              <span className="font-mono">({log.student.admissionNumber})</span>
                            )}
                          </span>
                        )}
                        {log.user && (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3" />
                            {log.user.name}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatTime(log.createdAt)}
                        </span>
                      </div>
                    </div>

                    <ChevronDown
                      className={cn(
                        'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
                        isExpanded && 'rotate-180',
                      )}
                    />
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-2 space-y-3 border-t border-border pl-5 pt-3">
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
                        <span className="text-muted-foreground">
                          Entity ID: <span className="font-mono text-foreground">{log.entityId}</span>
                        </span>
                        {log.ipAddress && (
                          <span className="text-muted-foreground">
                            IP Address: <span className="font-mono text-foreground">{log.ipAddress}</span>
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="mb-1.5 text-xs font-semibold">Changes</h4>
                        <DiffViewer oldValue={log.oldValue} newValue={log.newValue} resolve={makeResolver(log)} />
                      </div>

                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div>
                          <h4 className="mb-1.5 text-xs font-semibold">Additional Information</h4>
                          <FieldList data={log.metadata} resolve={makeResolver(log)} />
                        </div>
                      )}
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
        <div className="flex justify-center border-t px-3 py-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-teal-700 hover:text-teal-800 disabled:opacity-50 dark:text-teal-300"
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
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatFullDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatRelative(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const diff = Date.now() - then.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day > 1 ? 's' : ''} ago`
  return then.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
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

function makeResolver(log: AuditLog) {
  const studentName = log.student
    ? `${log.student.firstName} ${log.student.lastName}`.trim()
    : ''
  const userName = log.user?.name || log.user?.email || ''

  return (key: string, value: unknown): React.ReactNode | undefined => {
    if (typeof value !== 'string' || !value) return undefined
    if (/studentId|student_id/.test(key) && value === log.student?.id && studentName) {
      return <span className="font-medium text-foreground">{studentName}</span>
    }
    if (/^userId$|^performedBy$|By$/.test(key) && value === log.user?.id && userName) {
      return <span className="font-medium text-foreground">{userName}</span>
    }
    return undefined
  }
}

function getActionTone(action: string): { dot: string; chip: string } {
  if (/created|recorded|generated/.test(action)) {
    return {
      dot: 'bg-emerald-500',
      chip: 'border-emerald-300/60 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200',
    }
  }
  if (/deleted|voided/.test(action)) {
    return {
      dot: 'bg-rose-500',
      chip: 'border-rose-300/60 bg-rose-100 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200',
    }
  }
  if (/updated/.test(action)) {
    return {
      dot: 'bg-amber-400',
      chip: 'border-amber-300/60 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200',
    }
  }
  return {
    dot: 'bg-sky-500',
    chip: 'border-sky-300/60 bg-sky-100 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200',
  }
}