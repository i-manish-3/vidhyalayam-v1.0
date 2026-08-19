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
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  SchoolBirthdayCard,
  type BirthdayCardSchool,
  type BirthdayCardStudent,
} from '@/features/birthdays/components/school-birthday-card'
import { Cake, Download, Loader2, PartyPopper } from 'lucide-react'

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
            class: null,
            section: null,
            admission: null,
          }
        : null,
    [person],
  )

  async function handleDownload() {
    if (!cardRef.current || !person || downloading) return
    onDownloading()
    try {
      const dataUrl = await toPng(cardRef.current, {
        width: 540,
        height: 960,
        pixelRatio: 2,
        cacheBust: true,
        imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
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
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-rose-500/20 bg-card p-0 shadow-2xl shadow-rose-500/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <GradientDialogHeader
          icon={Cake}
          title={person ? `${person.name}'s birthday card` : 'Birthday card'}
          description="540×960 — a classic 9:16 birthday card. Download as a high-resolution PNG."
        />

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-rose-500/[0.04] via-background to-amber-500/[0.055] p-4 sm:p-5">
          {!person || !student ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Select a person to preview their card.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <SchoolBirthdayCard ref={cardRef} student={student} school={school} />
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
          <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={onClose} disabled={downloading}>
            Close
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 px-4 text-xs"
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}