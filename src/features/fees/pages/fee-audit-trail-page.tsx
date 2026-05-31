/**
 * Fee Audit Trail Page
 *
 * Full-page audit trail view with tabs for transactions and config changes.
 * Includes filtering, pagination, and export functionality.
 */

'use client'

import React, { useState, useEffect } from 'react'
import { AuditTrailViewer } from '../components/audit-trail-viewer'
import { AuditLogFilters } from '../components/audit-log-filters'

type TabType = 'transactions' | 'config'

export function FeeAuditTrailPage() {
  const [activeTab, setActiveTab] = useState<TabType>('transactions')
  const [filters, setFilters] = useState<any>({})
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  })

  // Fetch logs when filters or tab changes
  useEffect(() => {
    fetchLogs()
  }, [activeTab, filters, pagination.page])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const endpoint = activeTab === 'transactions'
        ? '/api/school/fees/audit'
        : '/api/school/fees/audit/config'

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...Object.entries(filters).reduce((acc, [key, value]) => {
          if (value) acc[key] = value as string
          return acc
        }, {} as Record<string, string>),
      })

      const response = await fetch(`${endpoint}?${params}`)
      if (!response.ok) throw new Error('Failed to fetch audit logs')

      const data = await response.json()
      setLogs(data.logs)
      setPagination(prev => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      }))
    } catch (error) {
      console.error('Error fetching audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (newFilters: any) => {
    setFilters(newFilters)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleLoadMore = () => {
    if (pagination.page < pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: prev.page + 1 }))
    }
  }

  const handleExport = async () => {
    try {
      const endpoint = activeTab === 'transactions'
        ? '/api/school/fees/audit'
        : '/api/school/fees/audit/config'

      const params = new URLSearchParams({
        page: '1',
        limit: '1000', // Export up to 1000 records
        ...Object.entries(filters).reduce((acc, [key, value]) => {
          if (value) acc[key] = value as string
          return acc
        }, {} as Record<string, string>),
      })

      const response = await fetch(`${endpoint}?${params}`)
      if (!response.ok) throw new Error('Failed to export audit logs')

      const data = await response.json()

      // Convert to CSV
      const csv = convertToCSV(data.logs)

      // Download
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fee-audit-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting audit logs:', error)
      alert('Failed to export audit logs')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Fee Audit Trail</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track all fee-related changes and transactions
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'transactions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Transactions
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'config'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Configuration Changes
            </button>
          </nav>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <AuditLogFilters
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </div>

        {/* Export Button */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Export to CSV
          </button>
        </div>

        {/* Audit Trail */}
        <AuditTrailViewer
          logs={logs}
          loading={loading}
          onLoadMore={handleLoadMore}
          hasMore={pagination.page < pagination.totalPages}
        />

        {/* Pagination Info */}
        {logs.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Showing {logs.length} of {pagination.total} records
            {pagination.page < pagination.totalPages && (
              <span> (Page {pagination.page} of {pagination.totalPages})</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function convertToCSV(logs: any[]): string {
  if (logs.length === 0) return ''

  // Headers
  const headers = [
    'Date',
    'Time',
    'Action',
    'Entity Type',
    'Entity ID',
    'Student',
    'User',
    'IP Address',
    'Summary',
  ]

  // Rows
  const rows = logs.map(log => [
    new Date(log.createdAt).toLocaleDateString(),
    new Date(log.createdAt).toLocaleTimeString(),
    log.action,
    log.entityType,
    log.entityId,
    log.student ? `${log.student.firstName} ${log.student.lastName}` : '',
    log.user ? log.user.name : '',
    log.ipAddress || '',
    log.diffSummary || '',
  ])

  // Combine
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n')

  return csvContent
}
