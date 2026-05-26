'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  CalendarDays,
  CircleSlash,
  Loader2,
  PlusCircle,
  RefreshCw,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'

interface ApiRoute {
  id: string
  routeName: string
  routeNumber: string | null
  academicYear: string
  feeMonths: string
  stops: string | null
  isActive: boolean
}

interface SourceStop {
  name: string
  fare: number
}

type RouteAction = 'copy' | 'discontinue'

interface ExistingRoutePlan {
  routeId: string
  routeName: string
  routeNumber: string | null
  sourceStops: SourceStop[]
  sourceFeeMonths: string[]
  targetStops: Array<{ name: string; fareInput: string; sameAsSource: boolean }>
  targetFeeMonths: string[]
  action: RouteAction
  alreadyConfiguredInTarget: boolean
}

interface NewRoutePlan {
  tempId: string
  routeName: string
  routeNumber: string
  startPoint: string
  endPoint: string
  distance: string
  driverName: string
  driverPhone: string
  vehicleNumber: string
  stops: Array<{ name: string; fare: string }>
  feeMonths: string[]
  newStopName: string
  newStopFare: string
}

const FEE_MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseStops(value: string | null | undefined): SourceStop[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry): SourceStop | null => {
        if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
          const fare = typeof entry.fare === 'number' ? entry.fare : Number(entry.fare)
          return { name: entry.name.trim(), fare: Number.isFinite(fare) ? fare : 0 }
        }
        if (typeof entry === 'string') return { name: entry.trim(), fare: 0 }
        return null
      })
      .filter((s): s is SourceStop => !!s && !!s.name)
  } catch {
    return []
  }
}

function parseFeeMonths(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.filter((m): m is string => typeof m === 'string')
  } catch {
    return []
  }
  return []
}

function makeTempId() {
  return `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function shiftAcademicYear(year: string, delta: number): string {
  const match = year.match(/^(\d{4})-(\d{4})$/)
  if (!match) return ''
  return `${Number(match[1]) + delta}-${Number(match[2]) + delta}`
}

interface RouteDiffStopChange {
  name: string
  oldFare: number | null
  newFare: number
  delta: number | null
}

interface RouteDiff {
  routeId: string
  routeName: string
  routeNumber: string | null
  action: RouteAction
  alreadyConfiguredInTarget: boolean
  stopsAdded: Array<{ name: string; fare: number }>
  stopsRemoved: Array<{ name: string; oldFare: number }>
  stopsIncreased: RouteDiffStopChange[]
  stopsDecreased: RouteDiffStopChange[]
  stopsUnchanged: Array<{ name: string; fare: number }>
  feeMonthsAdded: string[]
  feeMonthsRemoved: string[]
}

interface NewRouteDiff {
  tempId: string
  routeName: string
  routeNumber: string
  stopCount: number
  feeMonthCount: number
}

interface DiffSummary {
  existing: RouteDiff[]
  created: NewRouteDiff[]
  totals: {
    routesCopied: number
    routesDiscontinued: number
    routesCreated: number
    stopsAdded: number
    stopsRemoved: number
    stopsRepriced: number
  }
}

function buildDiff(existingPlans: ExistingRoutePlan[], newRoutes: NewRoutePlan[]): DiffSummary {
  const existing: RouteDiff[] = []
  let stopsAdded = 0
  let stopsRemoved = 0
  let stopsRepriced = 0
  let routesCopied = 0
  let routesDiscontinued = 0

  for (const plan of existingPlans) {
    if (plan.action === 'discontinue') {
      routesDiscontinued += 1
      existing.push({
        routeId: plan.routeId,
        routeName: plan.routeName,
        routeNumber: plan.routeNumber,
        action: 'discontinue',
        alreadyConfiguredInTarget: plan.alreadyConfiguredInTarget,
        stopsAdded: [],
        stopsRemoved: [],
        stopsIncreased: [],
        stopsDecreased: [],
        stopsUnchanged: [],
        feeMonthsAdded: [],
        feeMonthsRemoved: [],
      })
      continue
    }

    routesCopied += 1
    const sourceByName = new Map(plan.sourceStops.map((s) => [s.name, s.fare]))
    const targetByName = new Map(
      plan.targetStops.map((s) => [s.name, Number(s.fareInput) || 0])
    )

    const added: RouteDiff['stopsAdded'] = []
    const increased: RouteDiffStopChange[] = []
    const decreased: RouteDiffStopChange[] = []
    const unchanged: RouteDiff['stopsUnchanged'] = []

    for (const stop of plan.targetStops) {
      const newFare = Number(stop.fareInput) || 0
      const oldFare = sourceByName.has(stop.name) ? sourceByName.get(stop.name)! : null
      if (oldFare === null) {
        added.push({ name: stop.name, fare: newFare })
        stopsAdded += 1
        continue
      }
      if (newFare > oldFare) {
        increased.push({ name: stop.name, oldFare, newFare, delta: newFare - oldFare })
        stopsRepriced += 1
      } else if (newFare < oldFare) {
        decreased.push({ name: stop.name, oldFare, newFare, delta: newFare - oldFare })
        stopsRepriced += 1
      } else {
        unchanged.push({ name: stop.name, fare: newFare })
      }
    }

    const removed: RouteDiff['stopsRemoved'] = []
    for (const sourceStop of plan.sourceStops) {
      if (!targetByName.has(sourceStop.name)) {
        removed.push({ name: sourceStop.name, oldFare: sourceStop.fare })
        stopsRemoved += 1
      }
    }

    const sourceMonthSet = new Set(plan.sourceFeeMonths)
    const targetMonthSet = new Set(plan.targetFeeMonths)
    const feeMonthsAdded = plan.targetFeeMonths.filter((m) => !sourceMonthSet.has(m))
    const feeMonthsRemoved = plan.sourceFeeMonths.filter((m) => !targetMonthSet.has(m))

    existing.push({
      routeId: plan.routeId,
      routeName: plan.routeName,
      routeNumber: plan.routeNumber,
      action: 'copy',
      alreadyConfiguredInTarget: plan.alreadyConfiguredInTarget,
      stopsAdded: added,
      stopsRemoved: removed,
      stopsIncreased: increased,
      stopsDecreased: decreased,
      stopsUnchanged: unchanged,
      feeMonthsAdded,
      feeMonthsRemoved,
    })
  }

  const created: NewRouteDiff[] = newRoutes.map((r) => ({
    tempId: r.tempId,
    routeName: r.routeName.trim() || '(untitled)',
    routeNumber: r.routeNumber.trim(),
    stopCount: r.stops.length,
    feeMonthCount: r.feeMonths.length,
  }))

  return {
    existing,
    created,
    totals: {
      routesCopied,
      routesDiscontinued,
      routesCreated: created.length,
      stopsAdded,
      stopsRemoved,
      stopsRepriced,
    },
  }
}

interface AllocationCountRow {
  routeId: string
  academicYear: string
  count: number
}

export function AnnualTransportSetupPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchoolYear = useAppStore((s) => s.currentSchool?.academicYear)

  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [fromYear, setFromYear] = useState<string>('')
  const [toYear, setToYear] = useState<string>('')

  const [loadingYears, setLoadingYears] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [existingPlans, setExistingPlans] = useState<ExistingRoutePlan[]>([])
  const [newRoutes, setNewRoutes] = useState<NewRoutePlan[]>([])
  const [existingTargetRouteIds, setExistingTargetRouteIds] = useState<Set<string>>(new Set())

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewDiff, setPreviewDiff] = useState<DiffSummary | null>(null)
  const [previewPayload, setPreviewPayload] = useState<unknown[]>([])
  const [previewLoadingCounts, setPreviewLoadingCounts] = useState(false)
  const [allocationCounts, setAllocationCounts] = useState<AllocationCountRow[]>([])

  const yearOptions = useMemo(
    () => toAcademicYearOptions(academicYears, currentSchoolYear),
    [academicYears, currentSchoolYear]
  )

  useEffect(() => {
    let mounted = true
    const fetchYears = async () => {
      try {
        const res = await api.get<{ academicYears: string[] }>('/api/school/academic-years')
        if (!mounted) return
        const years = res.academicYears || []
        setAcademicYears(years)
        const sorted = [...years].sort((a, b) => b.localeCompare(a))
        const activeYear = currentSchoolYear || sorted[0] || getCurrentAcademicYear()
        const literalPrev = shiftAcademicYear(activeYear, -1)
        const defaultFrom = years.includes(literalPrev)
          ? literalPrev
          : sorted.find((y) => y < activeYear) || ''
        setFromYear(defaultFrom)
        setToYear(activeYear)
      } catch {
        if (mounted) {
          toast({
            title: "Couldn't Load Academic Years",
            description: 'Please refresh and try again.',
            variant: 'destructive',
          })
        }
      } finally {
        if (mounted) setLoadingYears(false)
      }
    }
    fetchYears()
    return () => {
      mounted = false
    }
  }, [currentSchoolYear, toast])

  // Keep "To Session" strictly ahead of "From Session". If From moves to or past
  // To, snap To forward — preferring From + 1 if it exists in the list, otherwise
  // the closest known year after From.
  useEffect(() => {
    if (!fromYear) return
    if (toYear && toYear > fromYear) return
    const literalNext = shiftAcademicYear(fromYear, 1)
    if (literalNext && academicYears.includes(literalNext)) {
      setToYear(literalNext)
      return
    }
    const nextAvailable = [...academicYears].sort().find((y) => y > fromYear) || ''
    setToYear(nextAvailable)
  }, [fromYear, toYear, academicYears])

  const loadPlan = useCallback(async () => {
    if (!fromYear || !toYear || fromYear === toYear) return
    setLoadingPlan(true)
    try {
      const [fromRes, toRes] = await Promise.all([
        api.get<{ routes: ApiRoute[] }>(`/api/school/transport/routes?academicYear=${encodeURIComponent(fromYear)}`),
        api.get<{ routes: ApiRoute[] }>(`/api/school/transport/routes?academicYear=${encodeURIComponent(toYear)}`),
      ])

      const targetRoutes = toRes.routes || []
      const targetById = new Map(targetRoutes.map((r) => [r.id, r]))
      setExistingTargetRouteIds(new Set(targetById.keys()))

      const plans: ExistingRoutePlan[] = (fromRes.routes || []).map((route) => {
        const sourceStops = parseStops(route.stops)
        const sourceFeeMonths = parseFeeMonths(route.feeMonths)
        const targetRoute = targetById.get(route.id)
        const alreadyConfigured = !!targetRoute
        const targetStops = alreadyConfigured
          ? parseStops(targetRoute!.stops).map((s) => ({
              name: s.name,
              fareInput: String(s.fare),
              sameAsSource:
                sourceStops.find((ss) => ss.name === s.name)?.fare === s.fare,
            }))
          : sourceStops.map((s) => ({
              name: s.name,
              fareInput: String(s.fare),
              sameAsSource: true,
            }))

        return {
          routeId: route.id,
          routeName: route.routeName,
          routeNumber: route.routeNumber,
          sourceStops,
          sourceFeeMonths,
          targetStops,
          targetFeeMonths: alreadyConfigured ? parseFeeMonths(targetRoute!.feeMonths) : sourceFeeMonths,
          action: 'copy',
          alreadyConfiguredInTarget: alreadyConfigured,
        }
      })

      setExistingPlans(plans)
      setNewRoutes([])
    } catch {
      toast({
        title: "Couldn't Load Route Plan",
        description: 'We could not load the source-year routes. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingPlan(false)
    }
  }, [fromYear, toYear, toast])

  useEffect(() => {
    if (!loadingYears && fromYear && toYear && fromYear !== toYear) {
      loadPlan()
    } else {
      setExistingPlans([])
      setNewRoutes([])
      setExistingTargetRouteIds(new Set())
    }
  }, [fromYear, toYear, loadingYears, loadPlan])

  const updateExisting = (index: number, patch: Partial<ExistingRoutePlan>) => {
    setExistingPlans((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const updateTargetStop = (
    routeIndex: number,
    stopIndex: number,
    patch: Partial<ExistingRoutePlan['targetStops'][number]>
  ) => {
    setExistingPlans((prev) =>
      prev.map((p, i) => {
        if (i !== routeIndex) return p
        const stops = p.targetStops.map((s, si) => (si === stopIndex ? { ...s, ...patch } : s))
        return { ...p, targetStops: stops }
      })
    )
  }

  const toggleStopSameAsSource = (routeIndex: number, stopName: string) => {
    setExistingPlans((prev) =>
      prev.map((p, i) => {
        if (i !== routeIndex) return p
        const source = p.sourceStops.find((s) => s.name === stopName)
        const stops = p.targetStops.map((s) => {
          if (s.name !== stopName) return s
          const next = !s.sameAsSource
          return next
            ? { ...s, sameAsSource: true, fareInput: String(source?.fare ?? 0) }
            : { ...s, sameAsSource: false }
        })
        return { ...p, targetStops: stops }
      })
    )
  }

  const applyAllSameAsSource = (routeIndex: number) => {
    setExistingPlans((prev) =>
      prev.map((p, i) => {
        if (i !== routeIndex) return p
        const stops = p.sourceStops.map((s) => ({
          name: s.name,
          fareInput: String(s.fare),
          sameAsSource: true,
        }))
        return { ...p, targetStops: stops, targetFeeMonths: p.sourceFeeMonths }
      })
    )
  }

  const toggleTargetFeeMonth = (routeIndex: number, month: string) => {
    setExistingPlans((prev) =>
      prev.map((p, i) => {
        if (i !== routeIndex) return p
        const set = new Set(p.targetFeeMonths)
        if (set.has(month)) set.delete(month)
        else set.add(month)
        return { ...p, targetFeeMonths: Array.from(set) }
      })
    )
  }

  const setTargetFeeMonths = (routeIndex: number, months: string[]) => {
    setExistingPlans((prev) =>
      prev.map((p, i) => (i === routeIndex ? { ...p, targetFeeMonths: months } : p))
    )
  }

  const addNewRoute = () => {
    setNewRoutes((prev) => [
      ...prev,
      {
        tempId: makeTempId(),
        routeName: '',
        routeNumber: '',
        startPoint: '',
        endPoint: '',
        distance: '',
        driverName: '',
        driverPhone: '',
        vehicleNumber: '',
        stops: [],
        feeMonths: [],
        newStopName: '',
        newStopFare: '',
      },
    ])
  }

  const updateNewRoute = (index: number, patch: Partial<NewRoutePlan>) => {
    setNewRoutes((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const addStopToNewRoute = (index: number) => {
    setNewRoutes((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r
        const name = r.newStopName.trim()
        const fare = Number(r.newStopFare)
        if (!name) {
          toast({ title: 'Stop Name Required', description: 'Enter the stop name first.', variant: 'destructive' })
          return r
        }
        if (!Number.isFinite(fare) || fare < 0) {
          toast({ title: 'Invalid Fare', description: 'Stop fare must be a non-negative number.', variant: 'destructive' })
          return r
        }
        if (r.stops.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
          toast({ title: 'Duplicate Stop', description: `"${name}" already added.`, variant: 'destructive' })
          return r
        }
        return {
          ...r,
          stops: [...r.stops, { name, fare: String(fare) }],
          newStopName: '',
          newStopFare: '',
        }
      })
    )
  }

  const removeStopFromNewRoute = (routeIndex: number, stopIndex: number) => {
    setNewRoutes((prev) =>
      prev.map((r, i) =>
        i === routeIndex ? { ...r, stops: r.stops.filter((_, si) => si !== stopIndex) } : r
      )
    )
  }

  const toggleNewRouteFeeMonth = (routeIndex: number, month: string) => {
    setNewRoutes((prev) =>
      prev.map((r, i) => {
        if (i !== routeIndex) return r
        const set = new Set(r.feeMonths)
        if (set.has(month)) set.delete(month)
        else set.add(month)
        return { ...r, feeMonths: Array.from(set) }
      })
    )
  }

  const setNewRouteFeeMonths = (routeIndex: number, months: string[]) => {
    setNewRoutes((prev) =>
      prev.map((r, i) => (i === routeIndex ? { ...r, feeMonths: months } : r))
    )
  }

  const removeNewRoute = (index: number) => {
    setNewRoutes((prev) => prev.filter((_, i) => i !== index))
  }

  const validateAndBuildPayload = (): { ok: true; routes: unknown[] } | { ok: false; error: string } => {
    const routes: unknown[] = []
    for (const plan of existingPlans) {
      if (plan.action === 'discontinue') {
        routes.push({ mode: 'discontinue', routeId: plan.routeId })
        continue
      }
      if (plan.targetStops.length === 0) {
        return { ok: false, error: `Route "${plan.routeName}" needs at least one stop for ${toYear}.` }
      }
      if (plan.targetFeeMonths.length === 0) {
        return { ok: false, error: `Route "${plan.routeName}" needs at least one fee month for ${toYear}.` }
      }
      const stops: Array<{ name: string; fare: number }> = []
      for (const s of plan.targetStops) {
        const fare = Number(s.fareInput)
        if (!Number.isFinite(fare) || fare < 0) {
          return { ok: false, error: `Stop "${s.name}" on route "${plan.routeName}" has an invalid fare.` }
        }
        stops.push({ name: s.name, fare })
      }
      routes.push({
        mode: 'copy',
        routeId: plan.routeId,
        stops,
        feeMonths: plan.targetFeeMonths,
      })
    }

    for (const r of newRoutes) {
      if (!r.routeName.trim() || !r.routeNumber.trim()) {
        return { ok: false, error: 'Every new route needs a name and route number.' }
      }
      if (r.stops.length === 0) {
        return { ok: false, error: `New route "${r.routeName || 'untitled'}" needs at least one stop.` }
      }
      if (r.feeMonths.length === 0) {
        return { ok: false, error: `New route "${r.routeName}" needs at least one fee month.` }
      }
      const distanceValue = r.distance.trim() ? Number(r.distance) : null
      if (distanceValue !== null && (!Number.isFinite(distanceValue) || distanceValue < 0)) {
        return { ok: false, error: `New route "${r.routeName}" has an invalid distance.` }
      }
      routes.push({
        mode: 'create',
        routeName: r.routeName.trim(),
        routeNumber: r.routeNumber.trim(),
        startPoint: r.startPoint.trim() || null,
        endPoint: r.endPoint.trim() || null,
        distance: distanceValue,
        driverName: r.driverName.trim() || null,
        driverPhone: r.driverPhone.trim() || null,
        vehicleNumber: r.vehicleNumber.trim() || null,
        stops: r.stops.map((s) => ({ name: s.name, fare: Number(s.fare) })),
        feeMonths: r.feeMonths,
      })
    }

    if (routes.length === 0) {
      return { ok: false, error: 'No changes to apply. Configure at least one route.' }
    }
    return { ok: true, routes }
  }

  const openPreview = async () => {
    if (!fromYear || !toYear) return
    if (fromYear === toYear) {
      toast({ title: 'Same Year Selected', description: 'Source and target years must differ.', variant: 'destructive' })
      return
    }
    const built = validateAndBuildPayload()
    if (!built.ok) {
      toast({ title: 'Cannot Save Yet', description: built.error, variant: 'destructive' })
      return
    }

    const diff = buildDiff(existingPlans, newRoutes)
    setPreviewDiff(diff)
    setPreviewPayload(built.routes)
    setAllocationCounts([])
    setPreviewOpen(true)

    const affectedIds = diff.existing
      .filter((r) => r.action === 'discontinue' || r.action === 'copy')
      .map((r) => r.routeId)
    if (affectedIds.length === 0) return

    try {
      setPreviewLoadingCounts(true)
      const res = await api.get<{ counts: AllocationCountRow[] }>(
        `/api/school/transport/allocations/route-counts?academicYears=${encodeURIComponent(
          `${fromYear},${toYear}`
        )}&routeIds=${encodeURIComponent(affectedIds.join(','))}`
      )
      setAllocationCounts(res.counts || [])
    } catch {
      // Counts are advisory — proceeding without them is fine.
    } finally {
      setPreviewLoadingCounts(false)
    }
  }

  const handleConfirmApply = async () => {
    if (!fromYear || !toYear || previewPayload.length === 0) return
    try {
      setSubmitting(true)
      const res = await api.post<{ message?: string; summary?: Record<string, number> }>(
        '/api/school/transport/annual-setup',
        {
          fromAcademicYear: fromYear,
          toAcademicYear: toYear,
          routes: previewPayload,
        }
      )
      toast({
        title: 'Annual Setup Saved',
        description: res.message || `Routes configured for ${toYear}.`,
      })
      setPreviewOpen(false)
      setPreviewDiff(null)
      setPreviewPayload([])
      setAllocationCounts([])
      router.push('/transport/routes')
    } catch (err) {
      toast({
        title: 'Could Not Save Annual Setup',
        description: err instanceof Error ? err.message : 'Please review the entries and try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const allocationCountFor = (routeId: string, year: string) =>
    allocationCounts.find((c) => c.routeId === routeId && c.academicYear === year)?.count || 0

  const sameYear = fromYear && toYear && fromYear === toYear
  const canSubmit =
    !!fromYear &&
    !!toYear &&
    !sameYear &&
    !loadingPlan &&
    !submitting &&
    (existingPlans.length > 0 || newRoutes.length > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Annual Transport Setup"
        description="Roll forward transport routes and stop fares from one session to the next. Edit fares side-by-side, add new routes, or discontinue old ones."
      />

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-muted-foreground" />
            Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 px-4 pb-4 pt-3 sm:grid-cols-2 sm:px-5">
          <div className="space-y-1.5">
            <Label>From Session</Label>
            <Select value={fromYear} onValueChange={setFromYear} disabled={loadingYears}>
              <SelectTrigger><SelectValue placeholder="Source session" /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To Session</Label>
            <Select value={toYear} onValueChange={setToYear} disabled={loadingYears}>
              <SelectTrigger><SelectValue placeholder="Target session" /></SelectTrigger>
              <SelectContent>
                {yearOptions
                  .filter((opt) => !fromYear || opt.value > fromYear)
                  .map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {sameYear && (
            <div className="sm:col-span-2">
              <Alert variant="destructive">
                <AlertTitle>Pick Two Different Sessions</AlertTitle>
                <AlertDescription>
                  Source and target session can&apos;t be the same. Choose the next session in the To Session dropdown.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {loadingPlan && <LoadingState />}

      {!loadingPlan && fromYear && toYear && !sameYear && existingPlans.length === 0 && newRoutes.length === 0 && (
        <EmptyState
          icon={Bus}
          title={`No routes found for ${fromYear}`}
          description={`There are no transport routes configured for ${fromYear}. You can add brand-new routes for ${toYear} below.`}
        />
      )}

      {!loadingPlan && existingPlans.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {existingPlans.length} route(s) from {fromYear} — configure for {toYear}
            </h2>
            {existingTargetRouteIds.size > 0 && (
              <Badge variant="secondary" className="gap-1">
                <RefreshCw className="size-3" />
                {existingTargetRouteIds.size} already configured in {toYear}
              </Badge>
            )}
          </div>

          {existingPlans.map((plan, planIndex) => (
            <Card key={plan.routeId} className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bus className="size-4 text-muted-foreground" />
                      {plan.routeName}
                      {plan.routeNumber && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {plan.routeNumber}
                        </Badge>
                      )}
                    </CardTitle>
                    {plan.alreadyConfiguredInTarget && (
                      <p className="text-xs text-amber-600 mt-1">
                        Already has stops in {toYear} — saving will overwrite the current values for this route.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={plan.action}
                      onValueChange={(v: RouteAction) => updateExisting(planIndex, { action: v })}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="copy">Copy/Update for {toYear}</SelectItem>
                        <SelectItem value="discontinue">Discontinue in {toYear}</SelectItem>
                      </SelectContent>
                    </Select>
                    {plan.action === 'copy' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyAllSameAsSource(planIndex)}
                        className="gap-1"
                      >
                        <RefreshCw className="size-3" />
                        Same as {fromYear}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {plan.action === 'copy' && (
                <CardContent className="space-y-4 px-4 pb-4 pt-3 sm:px-5">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[30%]">Stop</TableHead>
                          <TableHead className="w-[20%]">{fromYear} Fare</TableHead>
                          <TableHead className="w-[15%]">Same?</TableHead>
                          <TableHead className="w-[35%]">
                            {toYear} Fare
                            <ArrowRight className="ml-1 inline size-3" />
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plan.targetStops.map((stop, stopIndex) => {
                          const sourceStop = plan.sourceStops.find((s) => s.name === stop.name)
                          return (
                            <TableRow key={stop.name}>
                              <TableCell className="font-medium">{stop.name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {sourceStop
                                  ? `Rs. ${sourceStop.fare.toLocaleString('en-IN')}`
                                  : <Badge variant="outline" className="text-[10px]">new</Badge>}
                              </TableCell>
                              <TableCell>
                                {sourceStop && (
                                  <Checkbox
                                    checked={stop.sameAsSource}
                                    onCheckedChange={() => toggleStopSameAsSource(planIndex, stop.name)}
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="1"
                                  value={stop.fareInput}
                                  disabled={!!sourceStop && stop.sameAsSource}
                                  onChange={(e) =>
                                    updateTargetStop(planIndex, stopIndex, {
                                      fareInput: e.target.value,
                                      sameAsSource: false,
                                    })
                                  }
                                  className="h-9"
                                />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {plan.targetStops.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                              No stops on the source route. Add stops to the route first.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Fee Months for {toYear}
                      </Label>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Checkbox
                            checked={
                              plan.targetFeeMonths.length === FEE_MONTH_OPTIONS.length
                                ? true
                                : plan.targetFeeMonths.length > 0
                                  ? 'indeterminate'
                                  : false
                            }
                            onCheckedChange={(checked) =>
                              setTargetFeeMonths(planIndex, checked === true ? [...FEE_MONTH_OPTIONS] : [])
                            }
                            aria-label="Select all fee months"
                          />
                          All months
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setTargetFeeMonths(planIndex, [])}
                          disabled={plan.targetFeeMonths.length === 0}
                          className="h-7 px-2 text-xs"
                        >
                          Clear all
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {FEE_MONTH_OPTIONS.map((month) => {
                        const checked = plan.targetFeeMonths.includes(month)
                        return (
                          <button
                            type="button"
                            key={month}
                            onClick={() => toggleTargetFeeMonth(planIndex, month)}
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input bg-background text-muted-foreground hover:border-primary/40'
                            }`}
                          >
                            {month}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              )}
              {plan.action === 'discontinue' && (
                <CardContent className="px-4 pb-4 pt-3 sm:px-5">
                  <Alert>
                    <AlertTitle>Will be discontinued in {toYear}</AlertTitle>
                    <AlertDescription>
                      All stop fares for this route in {toYear} will be deactivated. Existing student allocations are
                      not modified — handle them separately if needed.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {!loadingPlan && fromYear && toYear && !sameYear && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5 sm:px-5">
            <CardTitle className="text-base">New routes for {toYear || '—'}</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addNewRoute} className="gap-1">
              <PlusCircle className="size-3.5" />
              Add Route
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 pt-3 sm:px-5">
            {newRoutes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No new routes. Click <span className="font-medium">Add Route</span> to set up routes that didn&apos;t
                exist in {fromYear}.
              </p>
            )}
            {newRoutes.map((route, routeIndex) => (
              <div key={route.tempId} className="rounded-md border p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Route Name</Label>
                      <Input
                        value={route.routeName}
                        onChange={(e) => updateNewRoute(routeIndex, { routeName: e.target.value })}
                        placeholder="City Center to School"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Route Number</Label>
                      <Input
                        value={route.routeNumber}
                        onChange={(e) => updateNewRoute(routeIndex, { routeNumber: e.target.value })}
                        placeholder="R-07"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Start Point</Label>
                      <Input
                        value={route.startPoint}
                        onChange={(e) => updateNewRoute(routeIndex, { startPoint: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>End Point</Label>
                      <Input
                        value={route.endPoint}
                        onChange={(e) => updateNewRoute(routeIndex, { endPoint: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Distance (km)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={route.distance}
                        onChange={(e) => updateNewRoute(routeIndex, { distance: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vehicle Number</Label>
                      <Input
                        value={route.vehicleNumber}
                        onChange={(e) => updateNewRoute(routeIndex, { vehicleNumber: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => removeNewRoute(routeIndex)}
                    aria-label="Remove new route"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Stops</Label>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Stop Name</TableHead>
                          <TableHead className="w-[180px]">Fare (₹)</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {route.stops.map((stop, stopIndex) => (
                          <TableRow key={`${stop.name}-${stopIndex}`}>
                            <TableCell>{stop.name}</TableCell>
                            <TableCell>{Number(stop.fare).toLocaleString('en-IN')}</TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => removeStopFromNewRoute(routeIndex, stopIndex)}
                              >
                                <X className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell>
                            <Input
                              value={route.newStopName}
                              onChange={(e) => updateNewRoute(routeIndex, { newStopName: e.target.value })}
                              placeholder="Stop name"
                              className="h-9"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="1"
                              value={route.newStopFare}
                              onChange={(e) => updateNewRoute(routeIndex, { newStopFare: e.target.value })}
                              placeholder="Fare"
                              className="h-9"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addStopToNewRoute(routeIndex)}
                            >
                              Add
                            </Button>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fee Months</Label>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Checkbox
                          checked={
                            route.feeMonths.length === FEE_MONTH_OPTIONS.length
                              ? true
                              : route.feeMonths.length > 0
                                ? 'indeterminate'
                                : false
                          }
                          onCheckedChange={(checked) =>
                            setNewRouteFeeMonths(routeIndex, checked === true ? [...FEE_MONTH_OPTIONS] : [])
                          }
                          aria-label="Select all fee months"
                        />
                        All months
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setNewRouteFeeMonths(routeIndex, [])}
                        disabled={route.feeMonths.length === 0}
                        className="h-7 px-2 text-xs"
                      >
                        Clear all
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {FEE_MONTH_OPTIONS.map((month) => {
                      const checked = route.feeMonths.includes(month)
                      return (
                        <button
                          type="button"
                          key={month}
                          onClick={() => toggleNewRouteFeeMonth(routeIndex, month)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input bg-background text-muted-foreground hover:border-primary/40'
                          }`}
                        >
                          {month}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loadingPlan && fromYear && toYear && !sameYear && (
        <div className="sticky bottom-0 -mx-4 sm:mx-0 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Stop fares for <span className="font-medium text-foreground">{toYear}</span> will be saved. Old{' '}
              <span className="font-medium text-foreground">{fromYear}</span> data is not modified.
            </p>
            <Button type="button" onClick={openPreview} disabled={!canSubmit} className="gap-2">
              <Save className="size-4" />
              Preview &amp; Save
            </Button>
          </div>
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={(open) => { if (!submitting) setPreviewOpen(open) }}>
        <DialogContent className="flex h-[100dvh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Review Annual Transport Setup</DialogTitle>
            <DialogDescription>
              These are the changes that will be applied to <span className="font-medium text-foreground">{toYear}</span>.
              Existing <span className="font-medium text-foreground">{fromYear}</span> data is not modified.
            </DialogDescription>
          </DialogHeader>

          {previewDiff && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase text-muted-foreground">Routes</div>
                  <div className="font-semibold">
                    {previewDiff.totals.routesCreated} new · {previewDiff.totals.routesCopied} updated · {previewDiff.totals.routesDiscontinued} discontinued
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase text-muted-foreground">Stops</div>
                  <div className="font-semibold">
                    +{previewDiff.totals.stopsAdded} added · −{previewDiff.totals.stopsRemoved} removed
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase text-muted-foreground">Fare Changes</div>
                  <div className="font-semibold">{previewDiff.totals.stopsRepriced} stop(s) repriced</div>
                </div>
              </div>

              {previewDiff.existing.some((r) => r.alreadyConfiguredInTarget) && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Some routes already have {toYear} stops</AlertTitle>
                  <AlertDescription>
                    Saving will overwrite the current stop fares for those routes in {toYear}. Existing student
                    allocations keep the fare they were saved with — only future allocations use the new values.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                  {previewDiff.existing.length === 0 && previewDiff.created.length === 0 && (
                    <p className="text-sm text-muted-foreground">No changes detected.</p>
                  )}

                  {previewDiff.existing.map((diff) => {
                    const sourceAllocCount = allocationCountFor(diff.routeId, fromYear)
                    const targetAllocCount = allocationCountFor(diff.routeId, toYear)
                    return (
                      <div key={diff.routeId} className="rounded-md border p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium flex items-center gap-2">
                            <Bus className="size-4 text-muted-foreground" />
                            {diff.routeName}
                            {diff.routeNumber && (
                              <Badge variant="outline" className="font-mono text-[10px]">{diff.routeNumber}</Badge>
                            )}
                          </div>
                          {diff.action === 'discontinue' ? (
                            <Badge variant="destructive" className="gap-1">
                              <CircleSlash className="size-3" />
                              Discontinue in {toYear}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <RefreshCw className="size-3" />
                              {diff.alreadyConfiguredInTarget ? 'Update' : 'Copy to'} {toYear}
                            </Badge>
                          )}
                        </div>

                        {diff.action === 'copy' && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            {diff.stopsAdded.length > 0 && (
                              <div>
                                <span className="font-medium text-foreground">New stops:</span>{' '}
                                {diff.stopsAdded.map((s) => `${s.name} (₹${s.fare})`).join(', ')}
                              </div>
                            )}
                            {diff.stopsRemoved.length > 0 && (
                              <div>
                                <span className="font-medium text-destructive">Removed:</span>{' '}
                                {diff.stopsRemoved.map((s) => `${s.name} (was ₹${s.oldFare})`).join(', ')}
                              </div>
                            )}
                            {diff.stopsIncreased.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                <TrendingUp className="size-3 text-amber-600" />
                                <span className="font-medium text-foreground">Fare increased:</span>
                                <span>
                                  {diff.stopsIncreased
                                    .map((s) => `${s.name} ₹${s.oldFare}→₹${s.newFare}`)
                                    .join(', ')}
                                </span>
                              </div>
                            )}
                            {diff.stopsDecreased.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                <TrendingDown className="size-3 text-emerald-600" />
                                <span className="font-medium text-foreground">Fare decreased:</span>
                                <span>
                                  {diff.stopsDecreased
                                    .map((s) => `${s.name} ₹${s.oldFare}→₹${s.newFare}`)
                                    .join(', ')}
                                </span>
                              </div>
                            )}
                            {diff.stopsAdded.length === 0 &&
                              diff.stopsRemoved.length === 0 &&
                              diff.stopsIncreased.length === 0 &&
                              diff.stopsDecreased.length === 0 && (
                                <div>All stops carried forward at the same fares.</div>
                              )}
                            {(diff.feeMonthsAdded.length > 0 || diff.feeMonthsRemoved.length > 0) && (
                              <div>
                                <span className="font-medium text-foreground">Fee months:</span>{' '}
                                {diff.feeMonthsAdded.length > 0 && `+ ${diff.feeMonthsAdded.join(', ')} `}
                                {diff.feeMonthsRemoved.length > 0 && `− ${diff.feeMonthsRemoved.join(', ')}`}
                              </div>
                            )}
                          </div>
                        )}

                        {(sourceAllocCount > 0 || targetAllocCount > 0 || previewLoadingCounts) && (
                          <div className="text-xs flex flex-wrap items-center gap-3 border-t pt-2">
                            {previewLoadingCounts ? (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Loader2 className="size-3 animate-spin" /> loading allocations…
                              </span>
                            ) : (
                              <>
                                {sourceAllocCount > 0 && (
                                  <span
                                    className={
                                      diff.action === 'discontinue'
                                        ? 'text-destructive font-medium'
                                        : 'text-muted-foreground'
                                    }
                                  >
                                    {sourceAllocCount} student(s) on this route in {fromYear}
                                    {diff.action === 'discontinue' && ' — they won’t carry forward'}
                                  </span>
                                )}
                                {targetAllocCount > 0 && (
                                  <span className="text-amber-600 font-medium">
                                    {targetAllocCount} already allocated in {toYear}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {previewDiff.created.map((diff) => (
                    <div key={diff.tempId} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium flex items-center gap-2">
                          <PlusCircle className="size-4 text-emerald-600" />
                          {diff.routeName}
                          {diff.routeNumber && (
                            <Badge variant="outline" className="font-mono text-[10px]">{diff.routeNumber}</Badge>
                          )}
                        </div>
                        <Badge variant="secondary">New in {toYear}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {diff.stopCount} stop(s) · {diff.feeMonthCount} fee month(s)
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          )}

          <DialogFooter className="shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)} disabled={submitting}>
              Back to Edit
            </Button>
            <Button type="button" onClick={handleConfirmApply} disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Confirm &amp; Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
