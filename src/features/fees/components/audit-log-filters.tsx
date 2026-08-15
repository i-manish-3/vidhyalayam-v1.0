/**
 * AuditLogFilters Component
 *
 * Filter controls for audit trail viewer.
 * Supports filtering by entity type, date range, user, student, and action.
 */

'use client'

import { GraduationCap, ListChecks, Settings2, UserRound } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { Label } from '@/components/ui/label'

const ALL = '__all__'

interface AuditLogFiltersProps {
  filters: {
    entityType?: string
    studentId?: string
    userId?: string
    action?: string
    actionGroup?: string
    startDate?: string
    endDate?: string
  }
  onFilterChange: (filters: any) => void
  entityTypes?: string[]
  actions?: string[]
  students?: Array<{ id: string; name: string; admissionNumber?: string }>
  users?: Array<{ id: string; name: string }>
}

export function AuditLogFilters({
  filters,
  onFilterChange,
  entityTypes = [
    'StudentFeePayment',
    'StudentFeeInvoice',
    'StudentFeeLedgerEntry',
    'StudentFeeRefund',
  ],
  actions = [
    'created',
    'updated',
    'deleted',
    'payment_recorded',
    'refund_issued',
    'refund_voided',
    'monthly_demand_generated',
  ],
  students = [],
  users = [],
}: AuditLogFiltersProps) {
  const set = (key: string, value?: string) => {
    onFilterChange({ ...filters, [key]: value || undefined })
  }

  const setAction = (value?: string) => {
    onFilterChange({ ...filters, action: value || undefined, actionGroup: undefined })
  }

  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {/* Entity Type */}
      <div className="space-y-1">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entity Type</Label>
        <Select value={filters.entityType || ALL} onValueChange={(v) => set('entityType', v === ALL ? undefined : v)}>
          <SelectTrigger
            leadingIcon={<Settings2 className="size-3.5 text-white" />}
            leadingIconClassName="from-sky-500 to-cyan-600"
            className="h-10 w-full border-sky-200 from-sky-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-sky-400 focus:ring-sky-400/20 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64 border-sky-200/80 bg-white shadow-lg dark:border-sky-500/25 dark:bg-popover">
            <SelectItem value={ALL}>All types</SelectItem>
            {entityTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {formatEntityType(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Action */}
      <div className="space-y-1">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</Label>
        <Select value={filters.action || ALL} onValueChange={(v) => setAction(v === ALL ? undefined : v)}>
          <SelectTrigger
            leadingIcon={<ListChecks className="size-3.5 text-white" />}
            leadingIconClassName="from-violet-500 to-purple-600"
            className="h-10 w-full border-violet-200 from-violet-50 via-white to-purple-50 px-2 text-sm shadow-sm focus:border-violet-400 focus:ring-violet-400/20 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-input/30 dark:to-purple-500/10 sm:h-9 sm:text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64 border-violet-200/80 bg-white shadow-lg dark:border-violet-500/25 dark:bg-popover">
            <SelectItem value={ALL}>All actions</SelectItem>
            {actions.map((action) => (
              <SelectItem key={action} value={action}>
                {formatAction(action)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Student */}
      {students.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Student</Label>
          <Select value={filters.studentId || ALL} onValueChange={(v) => set('studentId', v === ALL ? undefined : v)}>
            <SelectTrigger
              leadingIcon={<GraduationCap className="size-3.5 text-white" />}
              leadingIconClassName="from-teal-500 to-cyan-600"
              className="h-10 w-full border-teal-200 from-teal-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-teal-400 focus:ring-teal-400/20 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64 border-teal-200/80 bg-white shadow-lg dark:border-teal-500/25 dark:bg-popover">
              <SelectItem value={ALL}>All students</SelectItem>
              {students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.name}
                  {student.admissionNumber ? ` (${student.admissionNumber})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* User */}
      {users.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">By User</Label>
          <Select value={filters.userId || ALL} onValueChange={(v) => set('userId', v === ALL ? undefined : v)}>
            <SelectTrigger
              leadingIcon={<UserRound className="size-3.5 text-white" />}
              leadingIconClassName="from-amber-500 to-orange-600"
              className="h-10 w-full border-amber-200 from-amber-50 via-white to-orange-50 px-2 text-sm shadow-sm focus:border-amber-400 focus:ring-amber-400/20 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-input/30 dark:to-orange-500/10 sm:h-9 sm:text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64 border-amber-200/80 bg-white shadow-lg dark:border-amber-500/25 dark:bg-popover">
              <SelectItem value={ALL}>Any user</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Start Date */}
      <div className="space-y-1">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
        <DatePicker
          value={filters.startDate || ''}
          onChange={(v) => set('startDate', v)}
          disableFuture
          showQuickActions
          placeholder="Any date"
          triggerClassName="h-10 w-full justify-start bg-white px-2.5 text-sm dark:bg-input/30 sm:h-9 sm:text-xs"
        />
      </div>

      {/* End Date */}
      <div className="space-y-1">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</Label>
        <DatePicker
          value={filters.endDate || ''}
          onChange={(v) => set('endDate', v)}
          disableFuture
          showQuickActions
          placeholder="Any date"
          triggerClassName="h-10 w-full justify-start bg-white px-2.5 text-sm dark:bg-input/30 sm:h-9 sm:text-xs"
        />
      </div>
    </div>
  )
}

function formatEntityType(type: string): string {
  return type
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace('Student Fee', '')
    .trim()
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}