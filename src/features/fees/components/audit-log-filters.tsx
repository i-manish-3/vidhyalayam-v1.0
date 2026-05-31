/**
 * AuditLogFilters Component
 *
 * Filter controls for audit trail viewer.
 * Supports filtering by entity type, date range, user, student, and action.
 */

import React from 'react'

interface AuditLogFiltersProps {
  filters: {
    entityType?: string
    studentId?: string
    userId?: string
    action?: string
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
  const handleChange = (key: string, value: string) => {
    onFilterChange({
      ...filters,
      [key]: value || undefined,
    })
  }

  const handleClear = () => {
    onFilterChange({})
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== '')

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={handleClear}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Entity Type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Entity Type
          </label>
          <select
            value={filters.entityType || ''}
            onChange={(e) => handleChange('entityType', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All types</option>
            {entityTypes.map(type => (
              <option key={type} value={type}>
                {formatEntityType(type)}
              </option>
            ))}
          </select>
        </div>

        {/* Action */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Action
          </label>
          <select
            value={filters.action || ''}
            onChange={(e) => handleChange('action', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All actions</option>
            {actions.map(action => (
              <option key={action} value={action}>
                {formatAction(action)}
              </option>
            ))}
          </select>
        </div>

        {/* Student */}
        {students.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Student
            </label>
            <select
              value={filters.studentId || ''}
              onChange={(e) => handleChange('studentId', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All students</option>
              {students.map(student => (
                <option key={student.id} value={student.id}>
                  {student.name}
                  {student.admissionNumber && ` (${student.admissionNumber})`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* User */}
        {users.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              User
            </label>
            <select
              value={filters.userId || ''}
              onChange={(e) => handleChange('userId', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All users</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Start Date */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => handleChange('startDate', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => handleChange('endDate', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
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
