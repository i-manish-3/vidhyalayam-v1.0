'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Search, ChevronLeft, ChevronRight, MoreHorizontal, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface Column<T> {
  key: string
  label: string
  render?: (item: T) => React.ReactNode
  className?: string
}

export interface ActionItem {
  label: string
  onClick: () => void
  variant?: 'default' | 'destructive'
  icon?: LucideIcon
  disabled?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  searchPlaceholder?: string
  searchKey?: string
  showSearch?: boolean
  actions?: (item: T) => ActionItem[]
  onRowClick?: (item: T) => void
  pageSize?: number
  pageSizeOptions?: number[]
  isLoading?: boolean
}

interface DataTableMemory {
  search?: string
  currentPage?: number
  pageSize?: number
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchPlaceholder = 'Search...',
  searchKey,
  showSearch = true,
  actions,
  onRowClick,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  isLoading = false,
}: DataTableProps<T>) {
  const pathname = usePathname()
  const memoryKey = `datatable:${pathname}:${searchKey || 'all'}:${searchPlaceholder}`
  const savedTableState = useAppStore((s) => s.pageState[memoryKey] as DataTableMemory | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const [search, setSearch] = useState(savedTableState?.search ?? '')
  const [currentPage, setCurrentPage] = useState(savedTableState?.currentPage ?? 1)
  const [pageSize, setPageSize] = useState(savedTableState?.pageSize ?? initialPageSize)

  const filteredData = searchKey
    ? data.filter((item) =>
        String(item[searchKey] || '').toLowerCase().includes(search.toLowerCase())
      )
    : search
    ? data.filter((item) =>
        Object.values(item).some((val) =>
          String(val || '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : data

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedData = filteredData.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  )
  const rangeFrom = filteredData.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1
  const rangeTo = Math.min(safeCurrentPage * pageSize, filteredData.length)

  const rememberTableState = (patch: Partial<DataTableMemory>) => {
    setPageState(memoryKey, {
      search,
      currentPage,
      pageSize,
      ...patch,
    })
  }

  return (
    <div className="space-y-4">
      {showSearch && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                const value = e.target.value
                setSearch(value)
                setCurrentPage(1)
                rememberTableState({ search: value, currentPage: 1 })
              }}
              className="pl-9"
            />
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {filteredData.length} result{filteredData.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.label}
                </TableHead>
              ))}
              {actions && <TableHead className="w-[50px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length + (actions ? 1 : 0)} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Loading...
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (actions ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                  No data found
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item, idx) => (
                <TableRow 
                  key={idx}
                  className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render ? col.render(item) : String(item[col.key] ?? '')}
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {actions(item).map((action, i) => {
                            const Icon = action.icon
                            return (
                              <DropdownMenuItem
                                key={i}
                                disabled={action.disabled}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  action.onClick()
                                }}
                                className={action.variant === 'destructive' ? 'text-destructive focus:text-destructive' : ''}
                              >
                                {Icon && <Icon className="mr-2 size-4" />}
                                {action.label}
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filteredData.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const nextSize = Number(value)
                setPageSize(nextSize)
                setCurrentPage(1)
                rememberTableState({ currentPage: 1, pageSize: nextSize })
              }}
            >
              <SelectTrigger className="h-8 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-2">
              Showing {rangeFrom} to {rangeTo} of {filteredData.length} row{filteredData.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => {
                const nextPage = Math.max(1, safeCurrentPage - 1)
                setCurrentPage(nextPage)
                rememberTableState({ currentPage: nextPage })
              }}
              disabled={safeCurrentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="rounded-md bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => {
                const nextPage = Math.min(totalPages, safeCurrentPage + 1)
                setCurrentPage(nextPage)
                rememberTableState({ currentPage: nextPage })
              }}
              disabled={safeCurrentPage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
