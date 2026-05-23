'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarRange, ChevronDown, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// AcademicYearSwitcher: global ERP context selector. Lives in the top bar.
// Reads / writes `viewingAcademicYear` on the Zustand store. Year-aware pages
// read this value to filter their data so the entire app stays consistent in
// the chosen session.
export function AcademicYearSwitcher() {
  const currentSchool = useAppStore((state) => state.currentSchool)
  const viewingAcademicYear = useAppStore((state) => state.viewingAcademicYear)
  const setViewingAcademicYear = useAppStore((state) => state.setViewingAcademicYear)
  const [academicYears, setAcademicYears] = useState<Array<{ name: string; isActive: boolean }>>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const schoolActiveYear = currentSchool?.academicYear || null
  const effectiveYear = viewingAcademicYear || schoolActiveYear
  const isOnPastYear = !!(effectiveYear && schoolActiveYear && effectiveYear !== schoolActiveYear)

  const fetchYears = useCallback(async () => {
    if (!currentSchool?.id) return
    setLoading(true)
    try {
      const data = await api.get<{ years: Array<{ name: string; isActive: boolean }> }>(
        '/api/school/academic-years?includeInactive=true',
        undefined,
        { skipLogoutOn401: true }
      )
      const list = (data?.years || [])
        .map((y) => ({ name: y.name, isActive: !!y.isActive }))
        .slice()
        .sort((a, b) => b.name.localeCompare(a.name))
      setAcademicYears(list)
    } catch {
      setAcademicYears([])
    } finally {
      setLoading(false)
    }
  }, [currentSchool?.id])

  useEffect(() => {
    fetchYears()
  }, [fetchYears])

  // Default viewing year to the school's active year on first load.
  useEffect(() => {
    if (!viewingAcademicYear && schoolActiveYear) {
      setViewingAcademicYear(schoolActiveYear)
    }
  }, [viewingAcademicYear, schoolActiveYear, setViewingAcademicYear])

  if (!currentSchool) return null

  const onSelect = (year: string) => {
    setViewingAcademicYear(year)
    setOpen(false)
  }

  const onResetToCurrent = () => {
    if (schoolActiveYear) setViewingAcademicYear(schoolActiveYear)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(next) => { if (next) fetchYears(); setOpen(next) }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 gap-1.5 px-2.5 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent',
            isOnPastYear && 'bg-amber-500/20 ring-1 ring-amber-300/60 hover:bg-amber-500/30'
          )}
          title={isOnPastYear ? `Viewing ${effectiveYear} (past session)` : `Viewing ${effectiveYear || 'session'}`}
        >
          <CalendarRange className="size-4" />
          <span className="hidden text-xs font-semibold sm:inline">{effectiveYear || 'Year'}</span>
          <ChevronDown className="size-3 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Switch Academic Year
        </div>
        <div className="max-h-72 overflow-y-auto">
          {loading && academicYears.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Loading sessions…</p>
          ) : academicYears.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No academic years configured.</p>
          ) : (
            academicYears.map((year) => {
              const isCurrent = year.name === schoolActiveYear
              const isActive = year.name === effectiveYear
              return (
                <button
                  key={year.name}
                  type="button"
                  onClick={() => onSelect(year.name)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                    isActive && 'bg-muted font-semibold',
                    !year.isActive && !isActive && 'text-muted-foreground'
                  )}
                >
                  <span>{year.name}</span>
                  {isCurrent ? (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      Current
                    </span>
                  ) : !year.isActive ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      Past
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
        {isOnPastYear && (
          <div className="mt-2 border-t pt-2">
            <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-2 text-xs" onClick={onResetToCurrent}>
              <RotateCcw className="size-3.5" />
              Reset to current ({schoolActiveYear})
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
