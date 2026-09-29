'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { LoadingState } from '@/components/shared'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  CalendarCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  IndianRupee,
  Loader2,
  Lock,
  Megaphone,
  Receipt,
  Sparkles,
  Award,
  ArrowRight,
  ShieldCheck,
  Sun,
  Sunrise,
  Moon,
  Baby,
  FileText,
  Calendar,
  Phone,
  ChevronRight,
  ExternalLink,
  BookOpen,
} from 'lucide-react'

const SIBLING_COLORS = [
  {
    theme: 'brand',
    activeTab: 'bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white shadow-md shadow-primary/25 border-transparent',
    avatar: 'bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white ring-2 ring-primary/40',
    accentRing: 'ring-primary/30',
  },
  {
    theme: 'violet',
    activeTab: 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25 border-transparent',
    avatar: 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white ring-2 ring-violet-500/40',
    accentRing: 'ring-violet-500/30',
  },
  {
    theme: 'teal',
    activeTab: 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/25 border-transparent',
    avatar: 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white ring-2 ring-teal-500/40',
    accentRing: 'ring-teal-500/30',
  },
]

interface ParentDashboardData {
  role: string
  parentId: string
  stats: {
    totalChildren: number
    activeChildren: number
    totalPendingFees: number
    attendancePercent: number
  }
  children: Array<{
    id: string
    studentId: string
    name: string
    admissionNumber: string | null
    className: string | null
    sectionName: string | null
    isActive: boolean
    attendancePercent: number
  }>
  announcements: Array<{
    id: string
    title: string
    priority: string
    createdAt: string
  }>
}

interface ChildInfo {
  id: string
  admissionNumber: string | null
  firstName: string
  lastName: string
  fullName: string
  rollNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  bloodGroup: string | null
  profileImage: string | null
  admissionStatus: string | null
  isActive: boolean
  className: string | null
  sectionName: string | null
  academicYear: string | null
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getGreeting(name: string) {
  const hour = new Date().getHours()
  if (hour < 12) return { text: `Good morning, ${name}!`, icon: Sunrise, emoji: '🌅' }
  if (hour < 17) return { text: `Good afternoon, ${name}!`, icon: Sun, emoji: '☀️' }
  return { text: `Good evening, ${name}!`, icon: Moon, emoji: '🌙' }
}

export function ParentDashboard() {
  const router = useRouter()
  const { user } = useAppStore()
  const { toast } = useToast()

  const [dashboardData, setDashboardData] = useState<ParentDashboardData | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [loading, setLoading] = useState(true)

  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [selectedChildIndex, setSelectedChildIndex] = useState(0)

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await api.get<ParentDashboardData>('/api/school/dashboard', undefined, {
        skipLogoutOn401: true,
      })
      setDashboardData(data)
    } catch {
      // dashboard overview fetch
    }
  }, [])

  const fetchChildren = useCallback(async () => {
    try {
      const data = await api.get<{ children: ChildInfo[] }>('/api/parent/children', undefined, {
        skipLogoutOn401: true,
      })
      setChildren(data?.children || [])
    } catch {
      setChildren([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([fetchDashboard(), fetchChildren()])
  }, [fetchDashboard, fetchChildren])

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: 'Missing Details',
        description: 'Please complete all required fields.',
        variant: 'destructive',
      })
      return
    }
    if (newPassword.length < 6) {
      toast({
        title: 'Weak Password',
        description: 'New password must have at least 6 characters.',
        variant: 'destructive',
      })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: 'Please ensure both password entries match.',
        variant: 'destructive',
      })
      return
    }

    setChangingPassword(true)
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword })
      toast({
        title: 'Password Updated 🎉',
        description: 'Your account password has been safely updated.',
      })
      setShowPasswordDialog(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast({
        title: 'Update Failed',
        description: err instanceof Error ? err.message : 'Could not change password.',
        variant: 'destructive',
      })
    } finally {
      setChangingPassword(false)
    }
  }

  const activeChildren = useMemo(() => children.filter((child) => child.isActive), [children])
  const attendanceByStudentId = useMemo(() => {
    const map = new Map<string, number>()
    for (const child of dashboardData?.children || []) {
      map.set(child.id, child.attendancePercent)
      map.set(child.studentId, child.attendancePercent)
    }
    return map
  }, [dashboardData?.children])

  if (loading) return <LoadingState />

  const stats = dashboardData?.stats
  const announcements = dashboardData?.announcements || []
  const totalPendingFees = stats?.totalPendingFees || 0
  const averageAttendance = clampPercent(stats?.attendancePercent || 0)
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'Parent'
  const greeting = getGreeting(firstName)

  const focusChildren = activeChildren.length > 0 ? activeChildren : children
  const currentChildIndex = focusChildren.length > 0 ? selectedChildIndex % focusChildren.length : 0
  const selectedChild = focusChildren[currentChildIndex]
  const currentTheme = SIBLING_COLORS[currentChildIndex % SIBLING_COLORS.length]
  const childAttendance = selectedChild
    ? clampPercent(attendanceByStudentId.get(selectedChild.id) ?? averageAttendance)
    : 0

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="space-y-4">
      {/* 1. HERO SHOWCASE CARD (Navbar Gradient Accent + Child Spotlight in One Attractive Hub) */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card via-card to-primary/[0.06] shadow-sm">
        {/* Glow backdrop decorative orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[radial-gradient(ellipse_at_center,var(--primary)_0%,transparent_70%)] opacity-20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/3 size-48 rounded-full bg-cyan-400/15 blur-3xl"
        />

        {/* Top Gradient Ribbon Header */}
        <div className="h-1.5 w-full bg-[linear-gradient(90deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)]" />

        <div className="p-4 sm:p-5">
          {/* Main Top Row: Greeting & Child Focus */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Greeting + Child Identity */}
            <div className="flex items-start gap-3.5 min-w-0">
              {selectedChild ? (
                <div
                  className={`relative flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-base font-black shadow-md ${currentTheme.avatar}`}
                >
                  {selectedChild.profileImage ? (
                    <img
                      src={selectedChild.profileImage}
                      alt={selectedChild.fullName}
                      className="size-full object-cover"
                    />
                  ) : (
                    getInitials(selectedChild.fullName)
                  )}
                  <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-emerald-500" />
                </div>
              ) : (
                <span className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white shadow-md shadow-primary/20">
                  <Baby className="size-6" />
                </span>
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                    {greeting.text} {greeting.emoji}
                  </h1>
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-primary/10 text-primary text-[10px] font-bold"
                  >
                    AY 2026-27
                  </Badge>
                  {selectedChild && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Enrolled & Active
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                  {selectedChild ? (
                    <>
                      <span className="font-bold text-foreground">
                        {selectedChild.fullName}
                      </span>
                      {selectedChild.className && (
                        <span className="rounded-md bg-muted px-1.5 py-0.2 font-semibold text-foreground text-[11px]">
                          {selectedChild.className}
                          {selectedChild.sectionName ? ` • Sec ${selectedChild.sectionName}` : ''}
                        </span>
                      )}
                      {selectedChild.rollNumber && (
                        <span>Roll #{selectedChild.rollNumber}</span>
                      )}
                      {selectedChild.admissionNumber && (
                        <span>• Adm #{selectedChild.admissionNumber}</span>
                      )}
                    </>
                  ) : (
                    <span>{todayFormatted} • Vidhyalayam Parent Desk</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Sibling Switcher Tabs + Actions */}
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
              {focusChildren.length > 1 && (
                <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-muted/40 p-1 shadow-inner">
                  {focusChildren.map((child, idx) => {
                    const active = idx === currentChildIndex
                    const theme = SIBLING_COLORS[idx % SIBLING_COLORS.length]
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedChildIndex(idx)}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                          active
                            ? theme.activeTab
                            : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
                        }`}
                      >
                        <span className="text-[10px]">{getInitials(child.fullName)}</span>
                        <span>{child.firstName}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl border-primary/25 bg-background/80 px-3 text-xs font-bold text-foreground shadow-2xs hover:border-primary hover:bg-primary/5 hover:text-primary"
                onClick={() => router.push('/my-children')}
              >
                <Baby className="mr-1.5 size-3.5 text-primary" />
                All Children
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary"
                title="Account Security"
                onClick={() => setShowPasswordDialog(true)}
              >
                <Lock className="size-4" />
              </Button>
            </div>
          </div>

          {/* Quick Action Navigation Strip */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
              Shortcuts:
            </span>
            <button
              type="button"
              onClick={() =>
                selectedChild
                  ? router.push(`/my-children/attendance?studentId=${selectedChild.id}`)
                  : router.push('/my-children/attendance')
              }
              className="group inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              <CalendarCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Attendance History</span>
              <ChevronRight className="size-3 opacity-60 transition group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                selectedChild
                  ? router.push(`/my-children/fees?studentId=${selectedChild.id}`)
                  : router.push('/my-children/fees')
              }
              className="group inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.06] px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
            >
              <Receipt className="size-3.5" />
              <span>Fee Statements & Slips</span>
              <ChevronRight className="size-3 opacity-60 transition group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                selectedChild
                  ? router.push(`/my-children/exams?studentId=${selectedChild.id}`)
                  : router.push('/my-children/exams')
              }
              className="group inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.06] px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
            >
              <Award className="size-3.5" />
              <span>Exams & Admit Cards</span>
              <ChevronRight className="size-3 opacity-60 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. THREE STUNNING CORE STAT CARDS (Fintech-Grade Elegance, Navbar Brand Gradients, Glow Accents) */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Pillar 1: Attendance Pulse */}
        <div
          role="button"
          tabIndex={0}
          onClick={() =>
            selectedChild
              ? router.push(`/my-children/attendance?studentId=${selectedChild.id}`)
              : router.push('/my-children/attendance')
          }
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-card to-teal-500/[0.03] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/60 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
                <CalendarCheck className="size-4" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Attendance Pulse
                </p>
                <p className="text-xs font-semibold text-foreground">Classroom Presence</p>
              </div>
            </div>
            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
              {childAttendance >= 75 ? 'Punctual ✓' : 'Notice'}
            </Badge>
          </div>

          <div className="mt-3.5 flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-black tracking-tight text-foreground tabular-nums">
                {childAttendance}%
              </span>
              <span className="ml-1.5 text-xs text-muted-foreground">present this month</span>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {childAttendance >= 75 ? 'Goal met ✓' : 'Below 75%'}
            </span>
          </div>

          <Progress value={childAttendance} className="mt-3 h-2 bg-emerald-500/15" />

          <div className="mt-3 flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300 pt-1">
            <span>Inspect 30-Day Log</span>
            <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
          </div>
        </div>

        {/* Pillar 2: Fee Account (Official Brand Navbar Gradient) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() =>
            selectedChild
              ? router.push(`/my-children/fees?studentId=${selectedChild.id}`)
              : router.push('/my-children/fees')
          }
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] via-card to-cyan-500/[0.03] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white shadow-md shadow-primary/25">
                <IndianRupee className="size-4" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Fee Account
                </p>
                <p className="text-xs font-semibold text-foreground">Statements & Ledger</p>
              </div>
            </div>
            <Badge
              className={`text-[10px] font-bold ${
                totalPendingFees > 0
                  ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {totalPendingFees > 0 ? 'Dues Pending' : 'All Clear 🎉'}
            </Badge>
          </div>

          <div className="mt-3.5 flex items-baseline justify-between">
            <div>
              <span
                className={`text-3xl font-black tracking-tight tabular-nums ${
                  totalPendingFees > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                }`}
              >
                {formatCurrency(totalPendingFees)}
              </span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {totalPendingFees > 0 ? 'balance due' : 'zero outstanding'}
              </span>
            </div>
            <span className="text-xs font-semibold text-primary">
              Verified
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary">
            <span>Monthly receipts & demand slips ready</span>
            <Receipt className="size-3.5" />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-xs font-bold text-primary pt-1">
            <span>View Fee Breakdown</span>
            <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
          </div>
        </div>

        {/* Pillar 3: Exams & Results (Official Brand Navbar Gradient) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() =>
            selectedChild
              ? router.push(`/my-children/exams?studentId=${selectedChild.id}`)
              : router.push('/my-children/exams')
          }
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] via-card to-cyan-500/[0.03] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md sm:col-span-2 lg:col-span-1"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white shadow-md shadow-primary/25">
                <GraduationCap className="size-4" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Examinations
                </p>
                <p className="text-xs font-semibold text-foreground">Datesheet & Results</p>
              </div>
            </div>
            <Badge className="border-primary/30 bg-primary/15 text-primary text-[10px] font-bold">
              Curriculum Desk
            </Badge>
          </div>

          <div className="mt-3.5 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Active Term
              </span>
              <span className="ml-1.5 text-xs text-muted-foreground">CBSE / ICSE</span>
            </div>
            <span className="text-xs font-bold text-primary">
              PDF Downloads
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary">
            <span>Admit cards & marks cards ready</span>
            <FileText className="size-3.5" />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-xs font-bold text-primary pt-1">
            <span>Inspect Exam Records</span>
            <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
          </div>
        </div>
      </div>

      {/* 3. DYNAMIC LOWER SECTION (Noticeboard + Guardian Security) */}
      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        {/* Noticeboard Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Megaphone className="size-3.5" />
              </span>
              <h3 className="text-sm font-bold text-foreground">
                School Noticeboard & Circulars
              </h3>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {announcements.length} {announcements.length === 1 ? 'Notice' : 'Notices'}
            </span>
          </div>

          {announcements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 py-8 text-center text-xs text-muted-foreground">
              No new circulars from school administration
            </div>
          ) : (
            <div className="space-y-2">
              {announcements.slice(0, 3).map((notice) => {
                const isUrgent = notice.priority === 'urgent'
                const isHigh = notice.priority === 'high'
                return (
                  <div
                    key={notice.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 text-xs transition hover:border-primary/40 hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-foreground">{notice.title}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-bold capitalize px-1.5 py-0 ${
                          isUrgent
                            ? 'border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : isHigh
                              ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        }`}
                      >
                        {notice.priority}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {formatShortDate(notice.createdAt)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Guardian Profile & Support Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <ShieldCheck className="size-4" />
                </span>
                <h3 className="text-sm font-bold text-foreground">Guardian Portal Access</h3>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 px-2 py-0.5"
              >
                Verified Account
              </Badge>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                <span className="text-muted-foreground text-xs">Registered Name</span>
                <span className="font-bold text-foreground text-xs truncate">{user?.name || 'Parent'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                <span className="text-muted-foreground text-xs">Phone / Email</span>
                <span className="font-mono text-xs font-semibold text-foreground truncate">
                  {user?.phone || user?.email || '--'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8.5 rounded-xl text-xs font-bold border-primary/25 hover:border-primary hover:bg-primary/5 hover:text-primary"
              onClick={() => setShowPasswordDialog(true)}
            >
              <Lock className="mr-1.5 size-3.5 text-primary" />
              Update Account Password
            </Button>
          </div>
        </div>
      </div>

      {/* Change Password Dialog (Following AGENTS.md conventions) */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div
              aria-hidden
              className="absolute -right-8 -top-12 size-36 rounded-full border-[18px] border-white/10"
            />
            <div
              aria-hidden
              className="absolute -bottom-10 left-10 size-24 rounded-full bg-emerald-300/20 blur-2xl"
            />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Lock className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">
                  Change Password
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Update your parent portal account password securely.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/10">
              <div className="mb-3.5 flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm">
                  <Lock className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Security Credentials</h3>
                  <p className="text-[10px] text-muted-foreground">
                    Enter your current password and choose a strong new one
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="current-password" className="text-xs font-medium">
                    Current Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPwd ? 'text' : 'password'}
                      placeholder="Enter current password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      className="h-9 pr-10 text-xs bg-background/80"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrentPwd((value) => !value)}
                    >
                      {showCurrentPwd ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs font-medium">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPwd ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="h-9 pr-10 text-xs bg-background/80"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPwd((value) => !value)}
                    >
                      {showNewPwd ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs font-medium">
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPwd ? 'text' : 'password'}
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="h-9 pr-10 text-xs bg-background/80"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirmPwd((value) => !value)}
                    >
                      {showConfirmPwd ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-4 text-xs"
              onClick={() => setShowPasswordDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-4 text-xs font-semibold"
              onClick={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Updating...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
