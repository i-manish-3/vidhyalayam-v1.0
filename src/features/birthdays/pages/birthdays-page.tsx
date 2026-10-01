'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { GradientHero, LoadingState, GradientEmptyState, GradientDialogHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  ScaledBirthdayCard,
  embedCardImages,
  type BirthdayCardSchool,
  type BirthdayCardStudent,
} from '@/features/birthdays/components/school-birthday-card'
import { Cake, Download, Loader2, PartyPopper, Sparkles } from 'lucide-react'

interface BirthdayPerson {
  id: string
  type: 'student' | 'teacher' | 'staff'
  name: string
  firstName: string
  lastName: string | null
  dob: string
  month: number
  day: number
  ageTurning: number
  profileImage: string | null
  label: string | null
  className: string | null
  sectionName: string | null
}

interface BirthdaysResponse {
  birthdays: BirthdayPerson[]
  rangeDays: number
  date: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function isToday(person: BirthdayPerson, today: Date): boolean {
  return person.month === today.getMonth() + 1 && person.day === today.getDate()
}

function daysUntil(person: BirthdayPerson, today: Date): number {
  const start = today.getTime()
  const thisYear = new Date(today.getFullYear(), person.month - 1, person.day).getTime()
  const target = thisYear < start ? new Date(today.getFullYear() + 1, person.month - 1, person.day).getTime() : thisYear
  return Math.round((target - start) / 86400000)
}

function typeTone(type: string): string {
  switch (type) {
    case 'student':
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300'
    case 'teacher':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300'
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300'
  }
}

const TINTED_CARD =
  'border-rose-200/80 bg-gradient-to-r from-rose-50 via-white to-amber-50 shadow-sm dark:border-rose-500/25 dark:from-rose-500/12 dark:via-card dark:to-amber-500/10'

export function BirthdaysPage() {
  const { toast } = useToast()
  const school = useAppStore((s) => s.currentSchool)
  const [loading, setLoading] = useState(true)
  const [birthdays, setBirthdays] = useState<BirthdayPerson[]>([])
  const [rangeDays, setRangeDays] = useState(14)
  const [selected, setSelected] = useState<BirthdayPerson | null>(null)
  const [downloading, setDownloading] = useState(false)

  const today = useMemo(() => new Date(), [])

  const load = useCallback(
    async (days: number) => {
      setLoading(true)
      try {
        const res = await api.get<BirthdaysResponse>('/api/school/birthdays', { days: String(days) })
        setBirthdays(res.birthdays)
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Could not load birthdays',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    void load(rangeDays)
  }, [load, rangeDays])

  const groups = useMemo(() => {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return {
      today: birthdays.filter((b) => isToday(b, t)),
      week: birthdays.filter((b) => !isToday(b, t) && daysUntil(b, t) <= 7),
      later: birthdays.filter((b) => !isToday(b, t) && daysUntil(b, t) > 7),
    }
  }, [birthdays, today])

  return (
    <div className="space-y-4">
      <GradientHero
        icon={Cake}
        title="Birthdays"
        badge={MONTHS[today.getMonth()]}
        description="Upcoming birthdays of students, teachers, and staff. Create a beautiful 9:16 birthday card and download it as a PNG."
      />

      <Tabs value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
        <TabsList>
          <TabsTrigger value="7">Next 7 days</TabsTrigger>
          <TabsTrigger value="14">Next 14 days</TabsTrigger>
          <TabsTrigger value="30">Next 30 days</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <LoadingState />
      ) : birthdays.length === 0 ? (
        <GradientEmptyState
          icon={PartyPopper}
          title="No birthdays coming up"
          description={`No birthdays in the next ${rangeDays} days. Enjoy the quiet!`}
        />
      ) : (
        <div className="space-y-6">
          {groups.today.length > 0 && (
            <BirthdayGroup
              title={`Today's birthdays`}
              badge={groups.today.length}
              tone="rose"
              people={groups.today}
              onSelect={setSelected}
            />
          )}
          {groups.week.length > 0 && (
            <BirthdayGroup
              title="This week"
              badge={groups.week.length}
              tone="violet"
              people={groups.week}
              onSelect={setSelected}
            />
          )}
          {groups.later.length > 0 && (
            <BirthdayGroup
              title="Coming up"
              badge={groups.later.length}
              tone="sky"
              people={groups.later}
              onSelect={setSelected}
            />
          )}
        </div>
      )}

      <BirthdayCardDialog
        open={selected !== null}
        person={selected}
        school={{
          name: school?.name,
          logo: school?.logo,
        }}
        downloading={downloading}
        onClose={() => setSelected(null)}
        onDownloaded={() => setDownloading(false)}
        onDownloading={() => setDownloading(true)}
      />
    </div>
  )
}

interface BirthdayGroupProps {
  title: string
  badge: number
  tone: 'rose' | 'violet' | 'sky'
  people: BirthdayPerson[]
  onSelect: (p: BirthdayPerson) => void
}

function BirthdayGroup({ title, badge, tone, people, onSelect }: BirthdayGroupProps) {
  const accent = {
    rose: 'from-rose-500 to-pink-600',
    violet: 'from-violet-500 to-purple-600',
    sky: 'from-sky-500 to-blue-600',
  }[tone]

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <Badge variant="secondary" className="text-[10px]">{badge}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {people.map((p) => (
          <Card
            key={`${p.type}-${p.id}`}
            className={cn(
              'group cursor-pointer gap-0 overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-md',
              TINTED_CARD,
            )}
            onClick={() => onSelect(p)}
          >
            <div className={cn('h-1.5 bg-gradient-to-r', accent)} />
            <CardContent className="p-3">
              <div className="relative mx-auto size-14">
                <div className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-rose-100 to-amber-100 text-sm font-bold uppercase text-rose-700 dark:from-rose-500/15 dark:to-amber-500/15 dark:text-rose-300">
                  {p.firstName?.[0] ?? '?'}
                </div>
                {p.profileImage && (
                  <img
                    src={p.profileImage}
                    alt=""
                    className="absolute inset-0 size-14 rounded-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}
              </div>
              <p className="mt-2 truncate text-center text-sm font-semibold">{p.name}</p>
              <p className="text-center text-xs text-muted-foreground">
                {p.month}/{p.day} · Turning {p.ageTurning}
              </p>
              <div className="mt-1.5 flex justify-center">
                <Badge className={cn('text-[10px]', typeTone(p.type))}>{p.label ?? p.type}</Badge>
              </div>
              <p className="mt-2 flex items-center justify-center gap-1 text-[10px] font-medium text-rose-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-rose-400">
                <PartyPopper className="size-3" /> Make card
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

interface BirthdayCardDialogProps {
  open: boolean
  person: BirthdayPerson | null
  school: BirthdayCardSchool
  downloading: boolean
  onClose: () => void
  onDownloading: () => void
  onDownloaded: () => void
}

function BirthdayCardDialog({
  open,
  person,
  school,
  downloading,
  onClose,
  onDownloading,
  onDownloaded,
}: BirthdayCardDialogProps) {
  const { toast } = useToast()
  const cardRef = useRef<HTMLDivElement>(null)

  const student: BirthdayCardStudent | null = useMemo(
    () =>
      person
        ? {
            id: person.id,
            fullName: person.name,
            firstName: person.firstName,
            lastName: person.lastName ?? '',
            dateOfBirth: person.dob,
            profileImage: person.profileImage,
            admissionNumber: null,
            rollNumber: null,
            class: person.className ? { id: '', name: person.className } : null,
            section: person.sectionName ? { id: '', name: person.sectionName } : null,
            admission: null,
          }
        : null,
    [person],
  )

  async function handleDownload() {
    if (!cardRef.current || !person || downloading) return
    onDownloading()
    try {
      await embedCardImages(cardRef.current)
      const dataUrl = await toPng(cardRef.current, {
        width: 1080,
        height: 1080,
        pixelRatio: 2,
        cacheBust: true,
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `birthday-${person.name.replace(/\s+/g, '-').toLowerCase()}.png`
      a.click()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not download card',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      onDownloaded()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !downloading && !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-rose-500/20 bg-card p-0 shadow-2xl shadow-rose-500/15 sm:max-w-2xl lg:max-w-3xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#e11d48_0%,#c026d3_48%,#f59e0b_100%)] px-5 py-4 pr-12 text-white sm:px-6">
          <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
          <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-rose-300/20 blur-2xl" />
          <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-amber-300/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
              <Cake className="size-5 text-white" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold tracking-normal text-white">
                {person ? `${person.name}'s Birthday Card` : 'Birthday Card'}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/75">
                1080×1080 high-resolution greeting card · Ready to download & share
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-rose-500/[0.03] via-background to-amber-500/[0.055] p-4 sm:p-5">
          {!person || !student ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Select a person to preview their card.</p>
          ) : (
            <>
              {/* Section 1: Celebrant Overview */}
              <section className="relative overflow-hidden rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-4 shadow-sm dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-amber-500/10">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-rose-200/35 blur-xl dark:bg-rose-500/15" />
                <div className="relative mb-3 flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-sm">
                    <Sparkles className="size-4 text-white" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Celebrant Information</h3>
                    <p className="text-[10px] text-muted-foreground">Birthday details and digital card overview</p>
                  </div>
                </div>

                <div className="relative grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-rose-200/60 bg-white/80 p-2.5 dark:border-rose-500/20 dark:bg-card/60">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Name</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-foreground/90">{person.name}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200/60 bg-white/80 p-2.5 dark:border-rose-500/20 dark:bg-card/60">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Role / Class</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-foreground/90">
                      {person.label || person.className || (person.type.charAt(0).toUpperCase() + person.type.slice(1))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-rose-200/60 bg-white/80 p-2.5 dark:border-rose-500/20 dark:bg-card/60">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Card Format</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-rose-700 dark:text-rose-300">1080×1080 (1:1 PNG)</p>
                  </div>
                </div>
              </section>

              {/* Section 2: Card Live Preview */}
              <section className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-rose-50/40 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/10 dark:via-card dark:to-rose-500/10">
                <div className="relative mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm">
                      <Cake className="size-4 text-white" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">Birthday Card Preview</h3>
                      <p className="text-[10px] text-muted-foreground">High-resolution preview with school branding and photo</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-amber-300/80 bg-amber-50/60 text-[10px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    Ready to Export
                  </Badge>
                </div>

                <div className="flex justify-center overflow-hidden rounded-xl border border-rose-100 bg-white/70 p-2 shadow-inner dark:border-rose-900/30 dark:bg-card/70">
                  <ScaledBirthdayCard ref={cardRef} student={student} school={school} />
                </div>
              </section>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5 flex flex-row items-center justify-between sm:justify-between">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <PartyPopper className="size-3.5 text-rose-500" />
            <span>Optimized for WhatsApp status, Instagram & print</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={onClose} disabled={downloading}>
              Close
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-gradient-to-r from-rose-500 via-pink-600 to-amber-500 px-4 text-xs font-semibold text-white shadow-sm hover:from-rose-600 hover:to-pink-700 disabled:opacity-50"
              onClick={() => void handleDownload()}
              disabled={!person || downloading}
            >
              {downloading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Preparing…
                </>
              ) : (
                <>
                  <Download className="size-3.5" /> Download PNG
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}