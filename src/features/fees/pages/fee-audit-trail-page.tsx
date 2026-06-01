/**
 * Fee Audit Trail Page
 *
 * Full-page audit trail view with tabs for transactions and config changes.
 * Includes filtering, pagination, and CSV export. UI style matches the
 * project's other audit pages (attendance, RFID).
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Receipt,
  Settings2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { AuditTrailViewer } from '../components/audit-trail-viewer'
import { AuditLogFilters } from '../components/audit-log-filters'

type TabType = 'transactions' | 'config'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface AuditLogItem {
  id: string
  createdAt: string
  action: string
  entityType: string
  entityId: string
  student?: { firstName: string; lastName: string } | null
  user?: { name: string } | null
  ipAddress?: string | null
  diffSummary?: string | null
  [key: string]: unknown
}

export function FeeAuditTrailPage() {
  const [activeTab, setActiveTab] = useState<TabType>('transactions')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const endpoint =
        activeTab === 'transactions'
          ? '/api/school/fees/audit'
          : '/api/school/fees/audit/config'

      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        ...Object.entries(filters).reduce(
          (acc, [key, value]) => {
            if (value) acc[key] = value
            return acc
          },
          {} as Record<string, string>,
        ),
      })

      const response = await fetch(`${endpoint}?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch audit logs')

      const data = await response.json()
      setLogs(data.logs || [])
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total ?? 0,
        totalPages: data.pagination?.totalPages ?? 0,
      }))
    } catch (error) {
      console.error('Error fetching audit logs:', error)
      toast.error('Could not load audit logs.')
    } finally {
      setLoading(false)
    }
  }, [activeTab, filters, pagination.page, pagination.limit])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const handleFilterChange = (newFilters: Record<string, string>) => {
    setFilters(newFilters)
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setPagination((prev) => ({ ...prev, limit: size, page: 1 }))
  }

  const handleLoadMore = () => {
    if (pagination.page < pagination.totalPages) {
      handlePageChange(pagination.page + 1)
    }
  }

  const handleExport = async () => {
    try {
      const endpoint =
        activeTab === 'transactions'
          ? '/api/school/fees/audit'
          : '/api/school/fees/audit/config'

      const params = new URLSearchParams({
        page: '1',
        limit: '1000',
        ...Object.entries(filters).reduce(
          (acc, [key, value]) => {
            if (value) acc[key] = value
            return acc
          },
          {} as Record<string, string>,
        ),
      })

      const response = await fetch(`${endpoint}?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to export audit logs')
      const data = await response.json()

      const csv = convertToCSV(data.logs || [])
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fee-audit-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('CSV downloaded.')
    } catch (error) {
      console.error('Error exporting audit logs:', error)
      toast.error('Failed to export audit logs.')
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight">Fee Audit Trail</h1>
          <p className="text-xs text-muted-foreground">
            Every fee transaction and config change, kept for compliance.
          </p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as TabType)
          setPagination((p) => ({ ...p, page: 1 }))
        }}
        className="space-y-3"
      >
        <TabsList className="h-9">
          <TabsTrigger value="transactions" className="h-7 gap-1.5 text-xs">
            <Receipt className="size-3.5" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="config" className="h-7 gap-1.5 text-xs">
            <Settings2 className="size-3.5" />
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-0 space-y-3">
          <FilterCard onExport={handleExport}>
            <AuditLogFilters filters={filters} onFilterChange={handleFilterChange} />
          </FilterCard>

          <ResultsCard
            loading={loading}
            logs={logs}
            pagination={pagination}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onLoadMore={handleLoadMore}
          />
        </TabsContent>

        <TabsContent value="config" className="mt-0 space-y-3">
          <FilterCard onExport={handleExport}>
            <AuditLogFilters filters={filters} onFilterChange={handleFilterChange} />
          </FilterCard>

          <ResultsCard
            loading={loading}
            logs={logs}
            pagination={pagination}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onLoadMore={handleLoadMore}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FilterCard({
  children,
  onExport,
}: {
  children: React.ReactNode
  onExport: () => void
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="space-y-2.5 p-3">
        {children}
        <div className="flex justify-end border-t pt-2.5">
          <Button variant="outline" size="sm" onClick={onExport} className="h-7 gap-1.5 text-xs">
            <Download className="size-3" />
            Export CSV
          </Button>
        </div>
      </div>
    </Card>
  )
}

function ResultsCard({
  loading,
  logs,
  pagination,
  onPageChange,
  onPageSizeChange,
  onLoadMore,
}: {
  loading: boolean
  logs: AuditLogItem[]
  pagination: PaginationInfo
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  onLoadMore: () => void
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b bg-muted/30 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {loading ? '…' : `${pagination.total.toLocaleString()} ${pagination.total === 1 ? 'entry' : 'entries'}`}
      </div>
      <AuditTrailViewer
        logs={logs}
        loading={loading}
        onLoadMore={onLoadMore}
        hasMore={pagination.page < pagination.totalPages}
      />
      {!loading && pagination.total > 0 && (
        <Pagination
          pagination={pagination}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </Card>
  )
}

function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: PaginationInfo
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
}) {
  const { page, limit, total, totalPages } = pagination
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const getPageNumbers = (): (number | 'ellipsis-start' | 'ellipsis-end')[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    if (page <= 3) {
      return [1, 2, 3, 4, 'ellipsis-end', totalPages]
    }
    if (page >= totalPages - 2) {
      return [1, 'ellipsis-start', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    }
    return [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages]
  }

  const pageNumbers = getPageNumbers()

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page:</span>
        <Select value={String(limit)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2">
          Showing {from} to {to} of {total} entries
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pageNumbers.map((p, i) => {
          if (p === 'ellipsis-start' || p === 'ellipsis-end') {
            return (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
                ...
              </span>
            )
          }
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── CSV ────────────────────────────────────────────────────────────────────

function convertToCSV(logs: AuditLogItem[]): string {
  if (logs.length === 0) return ''

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

  const rows = logs.map((log) => [
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

  return [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n')
}
