'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState, LoadingState, GradientHero } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import {
  AlertTriangle,
  Award,
  Baby,
  Cake,
  CalendarCheck,
  CalendarDays,
  Droplet,
  FileText,
  GraduationCap,
  Hash,
  Home,
  IndianRupee,
  Mail,
  MapPin,
  Phone,
  Receipt,
  School,
  ShieldOff,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

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
  category: string | null
  religion: string | null
  nationality: string | null
  motherTongue: string | null
  address: string | null
  admissionDate: string | null
  profileImage: string | null
  admissionStatus: string | null
  isActive: boolean
  className: string | null
  sectionName: string | null
  academicYear: string | null
  fatherName: string | null
  fatherPhone: string | null
  motherName: string | null
  motherPhone: string | null
}

const ACCENTS = [
  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20',
  'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20',
  'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20',
  'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20',
]

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function valueOrDash(value: string | null | undefined): string {
  return value?.trim() || '-'
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="flex min-h-14 items-start gap-3 border-b border-primary/5 py-3 last:border-b-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary/60">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-foreground">{valueOrDash(value)}</p>
      </div>
    </div>
  )
}

function Section({
  title,
  description,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'rose'
  children: React.ReactNode
}) {
  const borderMap = {
    sky: 'border-sky-200/80 dark:border-sky-500/20',
    emerald: 'border-emerald-200/80 dark:border-emerald-500/20',
    amber: 'border-amber-200/80 dark:border-amber-500/20',
    violet: 'border-violet-200/80 dark:border-violet-500/20',
    rose: 'border-rose-200/80 dark:border-rose-500/20',
  }
  const fromMap = {
    sky: 'from-sky-50 via-white to-sky-50 dark:from-sky-500/10 dark:via-card dark:to-sky-500/5',
    emerald: 'from-emerald-50 via-white to-emerald-50 dark:from-emerald-500/10 dark:via-card dark:to-emerald-500/5',
    amber: 'from-amber-50 via-white to-amber-50 dark:from-amber-500/10 dark:via-card dark:to-amber-500/5',
    violet: 'from-violet-50 via-white to-violet-50 dark:from-violet-500/10 dark:via-card dark:to-violet-500/5',
    rose: 'from-rose-50 via-white to-rose-50 dark:from-rose-500/10 dark:via-card dark:to-rose-500/5',
  }
  const iconTileMap = {
    sky: 'bg-gradient-to-br from-sky-500 to-sky-600 text-white',
    emerald: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
    amber: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
    violet: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white',
    rose: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white',
  }
  return (
    <section className={cn('relative overflow-hidden rounded-xl border shadow-sm', borderMap[tone], 'bg-gradient-to-br', fromMap[tone])}>
      <div aria-hidden className="absolute -right-4 -top-4 size-14 rounded-full border-[10px] border-primary/5" />
      <div className="relative flex items-center gap-2.5 border-b border-primary/5 px-4 py-3">
        {Icon && (
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg shadow-sm', iconTileMap[tone])}>
            <Icon className="size-3.5" />
          </span>
        )}
        <div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="relative px-4">{children}</div>
    </section>
  )
}

function ParentLine({
  title,
  name,
  phone,
}: {
  title: string
  name: string | null
  phone: string | null
}) {
  return (
    <div className="flex items-start gap-3 border-b border-primary/5 py-3 last:border-b-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary/60">
        <UsersRound className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{valueOrDash(name)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{valueOrDash(phone)}</p>
      </div>
    </div>
  )
}

export function MyChildrenPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')

  const fetchChildren = useCallback(async () => {
    try {
      const data = await api.get<{ children: ChildInfo[] }>('/api/parent/children')
      const nextChildren = data?.children || []
      setChildren(nextChildren)
      setSelectedId((current) => {
        if (current && nextChildren.some((child) => child.id === current)) return current
        return nextChildren.find((child) => child.isActive)?.id || nextChildren[0]?.id || ''
      })
    } catch {
      toast({
        title: "Couldn't load your children",
        description: 'Please refresh the page. If this continues, contact the school.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchChildren()
  }, [fetchChildren])

  if (loading) return <LoadingState />

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-6 text-white shadow-lg">
          <div aria-hidden className="absolute -right-10 -top-10 size-36 rounded-full border-[20px] border-cyan-200/15" />
          <div aria-hidden className="absolute -bottom-8 right-16 size-20 rounded-full bg-cyan-300/8" />
          <div aria-hidden className="absolute left-12 top-4 size-16 rounded-full bg-white/5 blur-md" />
          <div className="relative flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
              <Baby className="size-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">My Children</h1>
              <p className="mt-1 text-sm text-white/75">Student profiles linked to your parent account</p>
            </div>
          </div>
        </div>
        <EmptyState
          icon={Baby}
          title="No children linked"
          description="No students are linked to your account yet. Please contact the school administration."
        />
      </div>
    )
  }

  const selectedChild = children.find((child) => child.id === selectedId) || children[0]
  const selectedIndex = Math.max(0, children.findIndex((child) => child.id === selectedChild.id))
  const classLabel = `${selectedChild.className || 'Class -'}${selectedChild.sectionName ? ` - ${selectedChild.sectionName}` : ''}`
  const studentCountLabel = children.length === 1 ? '1 student linked to your account' : `${children.length} students linked to your account`

  return (
    <div className="space-y-5">
      {/* Gradient Header Banner */}
      <GradientHero
        icon={Baby}
        title="My Children"
        description="View enrolled children, classroom assignments, academic year, and personal profiles."
        badge={studentCountLabel}
        gradientClassName="bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#0284c7_100%)]"
      />

      <Tabs value={selectedChild.id} onValueChange={setSelectedId} className="space-y-5">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-full justify-start gap-1 rounded-xl border border-primary/10 bg-gradient-to-r from-primary/[0.03] via-muted to-cyan-500/[0.03] p-1 sm:min-w-0">
            {children.map((child, index) => (
              <TabsTrigger
                key={child.id}
                value={child.id}
                className="gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold', ACCENTS[index % ACCENTS.length])}>
                  {initials(child.fullName)}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block max-w-36 truncate text-xs font-semibold">{child.fullName}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{child.className || 'Class -'}</span>
                </span>
                {!child.isActive && <ShieldOff className="size-3.5 text-destructive" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {children.map((child, index) => {
          const childClassLabel = `${child.className || 'Class -'}${child.sectionName ? ` - ${child.sectionName}` : ''}`
          const isCurrent = child.id === selectedChild.id

          return (
            <TabsContent key={child.id} value={child.id} className="mt-0">
              {isCurrent && (
                <div className="space-y-5">
                  {/* Profile Section */}
                  <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
                    <div className="h-2 w-full bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#0284c7_100%)]" />
                    <div className="p-5 sm:p-6">
                    <div className="relative grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                      <div className={cn('flex size-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-primary/20 text-3xl font-black shadow-md', ACCENTS[index % ACCENTS.length])}>
                        {child.profileImage ? (
                          <img src={child.profileImage} alt={child.fullName} className="size-full object-cover" />
                        ) : (
                          initials(child.fullName)
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-2xl font-extrabold tracking-tight text-foreground">{child.fullName}</h2>
                          <Badge className={cn(
                            child.isActive
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                          )}>
                            <span className={cn('mr-1 size-1.5 rounded-full', child.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500')} />
                            {child.isActive ? child.admissionStatus || 'Admitted' : 'Disabled'}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <GraduationCap className="size-4 text-primary" />
                            {childClassLabel}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="size-4 text-primary" />
                            {valueOrDash(child.academicYear)}
                          </span>
                          {child.admissionNumber && (
                            <span className="flex items-center gap-1.5 font-mono">
                              <FileText className="size-4 text-primary" />
                              {child.admissionNumber}
                            </span>
                          )}
                        </div>

                        {!child.isActive && (
                          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-background to-amber-500/5 p-3">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                              This student has been disabled by the school. Fee and attendance actions are unavailable.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 lg:w-44">
                        <Button
                          variant="outline"
                          className="justify-start gap-2 h-9 text-xs font-semibold border-primary/20 hover:bg-primary/5 hover:text-primary dark:border-primary/30"
                          disabled={!child.isActive}
                          onClick={() => router.push(`/my-children/exams?studentId=${child.id}`)}
                        >
                          <Award className="size-4 text-sky-600 dark:text-sky-400" />
                          Exams & Grades
                        </Button>
                        <Button
                          className="justify-start gap-2 h-9 text-xs font-semibold shadow-sm"
                          disabled={!child.isActive}
                          onClick={() => router.push(`/my-children/fees?studentId=${child.id}`)}
                        >
                          <Receipt className="size-4" />
                          Fee Statements
                        </Button>
                        <Button
                          variant="outline"
                          className="justify-start gap-2 h-9 text-xs font-semibold border-primary/20 hover:bg-primary/5 hover:text-primary dark:border-primary/30"
                          disabled={!child.isActive}
                          onClick={() => router.push(`/my-children/attendance?studentId=${child.id}`)}
                        >
                          <CalendarCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                          Attendance History
                        </Button>
                      </div>
                    </div>
                    </div>
                  </section>

                  <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
                    <Section title="Academic Details" description="Class, roll, admission and session information" icon={School} tone="sky">
                      <div className="grid gap-x-6 md:grid-cols-2">
                        <DetailItem icon={School} label="Class / Section" value={childClassLabel} />
                        <DetailItem icon={Hash} label="Roll Number" value={child.rollNumber} />
                        <DetailItem icon={FileText} label="Admission Number" value={child.admissionNumber} />
                        <DetailItem icon={CalendarDays} label="Academic Year" value={child.academicYear} />
                        <DetailItem icon={CalendarDays} label="Admission Date" value={formatDate(child.admissionDate)} />
                        <DetailItem icon={GraduationCap} label="Admission Status" value={child.admissionStatus || (child.isActive ? 'Admitted' : 'Disabled')} />
                      </div>
                    </Section>

                    <Section title="Personal Details" description="Identity and personal profile information" icon={User} tone="violet">
                      <div className="grid gap-x-6 md:grid-cols-2">
                        <DetailItem icon={User} label="First Name" value={child.firstName} />
                        <DetailItem icon={User} label="Last Name" value={child.lastName} />
                        <DetailItem icon={Cake} label="Date of Birth" value={formatDate(child.dateOfBirth)} />
                        <DetailItem icon={Baby} label="Gender" value={child.gender} />
                        <DetailItem icon={Droplet} label="Blood Group" value={child.bloodGroup} />
                        <DetailItem icon={User} label="Category" value={child.category} />
                        <DetailItem icon={User} label="Religion" value={child.religion} />
                        <DetailItem icon={Mail} label="Mother Tongue" value={child.motherTongue} />
                        <DetailItem icon={Home} label="Nationality" value={child.nationality} />
                      </div>
                    </Section>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                    <Section title="Parent / Guardian Details" description="Contact information recorded by the school" icon={UsersRound} tone="amber">
                      <ParentLine title="Father" name={child.fatherName} phone={child.fatherPhone} />
                      <ParentLine title="Mother" name={child.motherName} phone={child.motherPhone} />
                    </Section>

                    <Section title="Address" description="Residential address available on student record" icon={MapPin} tone="emerald">
                      <DetailItem icon={MapPin} label="Address" value={child.address} />
                    </Section>
                  </div>
                </div>
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      <Separator className="bg-primary/5" />

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <IndianRupee className="size-3.5" />
          Fee details open in the parent fee page.
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarCheck className="size-3.5" />
          Attendance opens monthly attendance view.
        </span>
      </div>
    </div>
  )
}
