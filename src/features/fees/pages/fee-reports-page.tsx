'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { LoadingState, EmptyState, PageHeader } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { usePermissions } from '@/hooks/use-permissions'
import {
  AlertTriangle,
  BadgePercent,
  Banknote,
  Calendar,
  Filter,
  Layers,
  LayoutDashboard,
  Lock,
  UserSearch,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { SummaryTab } from '../components/reports/summary-tab'
import { OutstandingTab } from '../components/reports/outstanding-tab'
import { StudentStatementTab } from '../components/reports/student-statement-tab'
import { AggregationsTab } from '../components/reports/aggregations-tab'
import { DailyRegisterTab } from '../components/reports/daily-register-tab'
import { ConcessionsTab } from '../components/reports/concessions-tab'
import { AdvancesTab } from '../components/reports/advances-tab'
import { cn } from '@/lib/utils'

type TabKey = 'summary' | 'daily' | 'outstanding' | 'statement' | 'aggregations' | 'concessions' | 'advances'

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId?: string }

const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'ytd', label: 'Academic year' },
]

const REPORT_TABS: Array<{
  value: TabKey
  label: string
  shortLabel?: string
  icon: LucideIcon
}> = [
  { value: 'summary', label: 'Summary', icon: LayoutDashboard },
  { value: 'daily', label: 'Daily', icon: Banknote },
  { value: 'outstanding', label: 'Outstanding', shortLabel: 'Dues', icon: AlertTriangle },
  { value: 'statement', label: 'Statement', shortLabel: 'Stmt', icon: UserSearch },
  { value: 'aggregations', label: 'By Class', shortLabel: 'Pivot', icon: Layers },
  { value: 'concessions', label: 'Concessions', shortLabel: 'Waivers', icon: BadgePercent },
  { value: 'advances', label: 'Advances', icon: Wallet },
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
    <div className="space-y-3 pb-20 sm:pb-0">
      <PageHeader
        title="Fee Reports"
        description="Collections, dues, statements, concessions, advances, and class-wise breakdowns."
      />

      <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:w-28">
            <Filter className="size-3.5" />
            Report Scope
          </div>

          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:max-w-xl">
          {academicYears.length > 0 && (
            <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Academic Year
              </Label>
              <Select value={academicYear} onValueChange={setAcademicYear}>
                <SelectTrigger leadingIcon={<Calendar className="size-3.5" />} className="h-8 w-full justify-start">
                  <SelectValue placeholder="Academic year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map(y => (
                    <SelectItem key={y} value={y}>AY {y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Date Range
            </Label>
            <Select value={rangePreset} onValueChange={setRangePreset}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_PRESETS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={active} onValueChange={(v) => setActive(v as TabKey)} className="space-y-3">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="grid h-auto min-w-[700px] grid-cols-7 bg-muted p-1 sm:min-w-0 sm:w-full">
            {REPORT_TABS.map(({ value, label, shortLabel, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  'h-8 gap-1.5 px-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-sm',
                  value === active && 'text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                <span className="hidden min-w-0 truncate sm:inline">{label}</span>
                <span className="min-w-0 truncate sm:hidden">{shortLabel ?? label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="summary" className="mt-0 space-y-3">
          <SummaryTab startDate={startDate} endDate={endDate} academicYear={academicYear} />
        </TabsContent>

        <TabsContent value="daily" className="mt-0 space-y-3">
          <DailyRegisterTab classes={classes} />
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

        <TabsContent value="concessions" className="mt-0 space-y-3">
          <ConcessionsTab academicYear={academicYear} startDate={startDate} endDate={endDate} classes={classes} />
        </TabsContent>

        <TabsContent value="advances" className="mt-0 space-y-3">
          <AdvancesTab
            academicYear={academicYear}
            classes={classes}
            onOpenStudent={(id) => {
              setPickedStudentId(id)
              setActive('statement')
            }}
          />
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
