'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingState, EmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { usePermissions } from '@/hooks/use-permissions'
import { LayoutDashboard, AlertTriangle, UserSearch, Layers, Lock, Calendar } from 'lucide-react'
import { SummaryTab } from '../components/reports/summary-tab'
import { OutstandingTab } from '../components/reports/outstanding-tab'
import { StudentStatementTab } from '../components/reports/student-statement-tab'
import { AggregationsTab } from '../components/reports/aggregations-tab'

type TabKey = 'summary' | 'outstanding' | 'statement' | 'aggregations'

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId?: string }

const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'ytd', label: 'Academic year' },
]

export function FeeReportsPage() {
  const [active, setActive] = useState<TabKey>('summary')
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [academicYear, setAcademicYear] = useState<string>('')
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [rangePreset, setRangePreset] = useState<string>('30d')
  const [pickedStudentId, setPickedStudentId] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  const { permissions } = usePermissions()
  const permissionsLoaded = useAppStore(s => s.permissionsLoaded)
  const role = useAppStore(s => s.user?.role || '')
  const canView = role === 'SUPER_ADMIN' || permissions.includes('*') || permissions.includes('fees:read')

  // Bootstrap: classes, sections, academic years
  useEffect(() => {
    let alive = true
    Promise.all([
      api.get<{ classes: ClassOption[] }>('/api/school/classes').catch(() => ({ classes: [] })),
      api.get<{ sections: SectionOption[] }>('/api/school/sections').catch(() => ({ sections: [] })),
      // The endpoint returns { academicYears: string[], years: Array<{name, isCurrent, ...}> }.
      // We use `years` for the full records (need isCurrent) and de-dupe to be safe.
      api.get<{ academicYears: string[]; years: Array<{ name: string; isCurrent: boolean }> }>('/api/school/academic-years')
        .catch(() => ({ academicYears: [], years: [] })),
    ])
      .then(([c, s, ay]) => {
        if (!alive) return
        setClasses(c.classes || [])
        setSections((s.sections || []).map((sec: any) => ({ id: sec.id, name: sec.name, classId: sec.classId })))
        const records = ay.years || []
        const names = Array.from(new Set(records.map(y => y.name).filter(Boolean)))
        setAcademicYears(names)
        const current = records.find(y => y.isCurrent)?.name
        if (current) setAcademicYear(current)
        else if (names.length > 0) setAcademicYear(names[0])
      })
      .finally(() => { if (alive) setBootstrapping(false) })
    return () => { alive = false }
  }, [])

  // Compute date range from preset
  const { startDate, endDate } = useMemo(() => computeRange(rangePreset, academicYear), [rangePreset, academicYear])

  if (bootstrapping) return <LoadingState />

  if (permissionsLoaded && !canView) {
    return (
      <div className="space-y-3 pb-20 sm:pb-0">
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description="You don't have permission to view fee reports. Ask a school administrator for the 'fees:read' permission."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight flex items-center gap-2">
            <LayoutDashboard className="size-5 text-blue-600" />
            Fee Reports
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Daily collection, outstanding dues, student statements, and class-wise breakdowns
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {academicYears.length > 0 && (
            <Select value={academicYear} onValueChange={setAcademicYear}>
              <SelectTrigger className="h-9 w-[140px]">
                <Calendar className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="AY" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map(y => (
                  <SelectItem key={y} value={y}>AY {y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={rangePreset} onValueChange={setRangePreset}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={active} onValueChange={(v) => setActive(v as TabKey)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 bg-gray-100">
          <TabsTrigger
            value="summary"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5 py-2"
          >
            <LayoutDashboard className="size-3.5" />
            <span className="hidden sm:inline">Summary</span>
            <span className="sm:hidden">Summary</span>
          </TabsTrigger>
          <TabsTrigger
            value="outstanding"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5 py-2"
          >
            <AlertTriangle className="size-3.5" />
            <span className="hidden sm:inline">Outstanding</span>
            <span className="sm:hidden">Dues</span>
          </TabsTrigger>
          <TabsTrigger
            value="statement"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5 py-2"
          >
            <UserSearch className="size-3.5" />
            <span className="hidden sm:inline">Student Statement</span>
            <span className="sm:hidden">Statement</span>
          </TabsTrigger>
          <TabsTrigger
            value="aggregations"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5 py-2"
          >
            <Layers className="size-3.5" />
            <span className="hidden sm:inline">By Class &amp; Head</span>
            <span className="sm:hidden">Pivots</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-0 space-y-3">
          <SummaryTab startDate={startDate} endDate={endDate} academicYear={academicYear} />
        </TabsContent>

        <TabsContent value="outstanding" className="mt-0 space-y-3">
          <OutstandingTab
            academicYear={academicYear}
            classes={classes}
            sections={sections}
            onOpenStudent={(id) => {
              setPickedStudentId(id)
              setActive('statement')
            }}
          />
        </TabsContent>

        <TabsContent value="statement" className="mt-0 space-y-3">
          <StudentStatementTab
            academicYear={academicYear}
            initialStudentId={pickedStudentId}
            onStudentSelected={setPickedStudentId}
          />
        </TabsContent>

        <TabsContent value="aggregations" className="mt-0 space-y-3">
          <AggregationsTab academicYear={academicYear} startDate={startDate} endDate={endDate} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function computeRange(preset: string, academicYear?: string): { startDate?: string; endDate?: string } {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  switch (preset) {
    case 'today':
      return { startDate: todayStart.toISOString(), endDate: tomorrow.toISOString() }
    case '7d': {
      const start = new Date(todayStart)
      start.setDate(start.getDate() - 6)
      return { startDate: start.toISOString(), endDate: tomorrow.toISOString() }
    }
    case '30d': {
      const start = new Date(todayStart)
      start.setDate(start.getDate() - 29)
      return { startDate: start.toISOString(), endDate: tomorrow.toISOString() }
    }
    case 'mtd': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { startDate: start.toISOString(), endDate: tomorrow.toISOString() }
    }
    case 'ytd': {
      // Indian AY: starts Apr 1 of the first year in 'YYYY-YYYY'
      let ayStart: Date
      const match = academicYear?.match(/^(\d{4})-(\d{4})$/)
      if (match) {
        ayStart = new Date(parseInt(match[1], 10), 3, 1)
      } else {
        // Fall back: if today is before Apr, AY started last year's Apr
        const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear()
        ayStart = new Date(year, 3, 1)
      }
      return { startDate: ayStart.toISOString(), endDate: tomorrow.toISOString() }
    }
    default:
      return {}
  }
}
