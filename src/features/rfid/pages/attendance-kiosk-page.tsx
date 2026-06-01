'use client'

/**
 * Attendance kiosk — single-page station for tapping cards at a gate or
 * classroom. Designed to run full-screen on a wall-mounted tablet or PC.
 *
 * Inputs handled (via <UidCaptureInput>):
 *   - USB HID keyboard-emulation reader (default; Windows-FC etc.)
 *   - Web NFC on Android Chrome (auto-detected)
 *   - Manual entry (testing / fallback)
 *
 * Every tap POSTs to /api/school/attendance/tap and is rendered in a
 * recent-feed list. The big result banner flashes green/red/amber based
 * on outcome with a soft beep so the gate attendant gets non-visual
 * confirmation too.
 *
 * Recent taps and sound preference persist in localStorage so a refresh
 * (or accidental tab close) does not wipe the operator's context. The
 * server is still the source of truth for attendance; the local feed is
 * a UX aid only.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, Info, Volume2, VolumeX,
  CreditCard, Trash2, History, ScanLine,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { UidCaptureInput } from '@/features/rfid/components/uid-capture-input'

type ResultCode =
  | 'marked'
  | 'updated'
  | 'duplicate'
  | 'unknown_card'
  | 'card_revoked'
  | 'enrollment_missing'
  | 'finalized'
  | 'non_teaching'
  | 'invalid_uid'

interface TapResponse {
  result: ResultCode
  student?: {
    id: string
    firstName: string
    lastName: string
    profileImage: string | null
    admissionNumber: string | null
    rollNumber: string | null
    className: string | null
    sectionName: string | null
  }
  date?: string
  academicYear?: string
  message?: string
}

interface FeedEntry {
  id: string
  at: Date
  uid: string
  resp: TapResponse
}

interface PersistedFeedEntry {
  id: string
  at: string
  uid: string
  resp: TapResponse
}

const SUCCESS_RESULTS: ResultCode[] = ['marked', 'updated', 'duplicate']
const WARN_RESULTS: ResultCode[] = ['finalized', 'non_teaching']

const STORAGE_KEY_FEED = 'rfid_kiosk_v1.feed'
const STORAGE_KEY_SOUND = 'rfid_kiosk_v1.sound'
const FEED_CAP = 25

function classify(result: ResultCode): 'success' | 'warn' | 'error' {
  if (SUCCESS_RESULTS.includes(result)) return 'success'
  if (WARN_RESULTS.includes(result)) return 'warn'
  return 'error'
}

function initials(first?: string, last?: string): string {
  return `${first?.charAt(0) ?? ''}${last?.charAt(0) ?? ''}`.toUpperCase() || '··'
}

function isToday(d: Date): boolean {
  const now = new Date()
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  )
}

function formatFeedTime(d: Date): string {
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (isToday(d)) return time
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  return `${date} ${time}`
}

export function AttendanceKioskPage() {
  const [uid, setUid] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [latest, setLatest] = useState<TapResponse | null>(null)
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Hydrate persisted state on mount (client-only) ───────────────────────
  useEffect(() => {
    try {
      const rawFeed = localStorage.getItem(STORAGE_KEY_FEED)
      if (rawFeed) {
        const parsed = JSON.parse(rawFeed) as PersistedFeedEntry[]
        if (Array.isArray(parsed)) {
          setFeed(
            parsed
              .map((e) => ({ ...e, at: new Date(e.at) }))
              // Drop any entry whose `at` failed to parse to a real Date
              .filter((e) => !Number.isNaN(e.at.getTime())),
          )
        }
      }
      const rawSound = localStorage.getItem(STORAGE_KEY_SOUND)
      if (rawSound !== null) setSoundOn(rawSound === 'true')
    } catch {
      // Corrupt or unavailable storage: keep defaults, no crash
    } finally {
      setHydrated(true)
    }
  }, [])

  // ── Persist feed (skip until after first hydration to avoid wiping it) ──
  useEffect(() => {
    if (!hydrated) return
    try {
      const serialized: PersistedFeedEntry[] = feed.map((e) => ({
        ...e,
        at: e.at.toISOString(),
      }))
      localStorage.setItem(STORAGE_KEY_FEED, JSON.stringify(serialized))
    } catch {
      // ignore quota / security errors — kiosk must keep working
    }
  }, [feed, hydrated])

  // ── Persist sound preference ─────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY_SOUND, String(soundOn))
    } catch {
      // ignore
    }
  }, [soundOn, hydrated])

  const announce = useCallback(
    (response: TapResponse) => {
      if (!soundOn) return
      try {
        const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
        if (!synth) return
        // Cancel anything still queued so rapid taps don't pile up.
        synth.cancel()
        const utter = new SpeechSynthesisUtterance(buildAnnouncement(response))
        utter.rate = 1.05
        utter.pitch = 1
        utter.volume = 1
        utter.lang = 'en-IN'
        synth.speak(utter)
      } catch {
        // Speech failure must not break the tap workflow.
      }
    },
    [soundOn],
  )

  const handleCapture = useCallback(
    async (normalizedUid: string) => {
      if (submitting) return
      setSubmitting(true)
      try {
        const res = await fetch('/api/school/attendance/tap', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            uid: normalizedUid,
            tappedAt: new Date().toISOString(),
          }),
        })
        const data: TapResponse = await res.json()
        setLatest(data)
        setFeed((prev) =>
          [
            { id: crypto.randomUUID(), at: new Date(), uid: normalizedUid, resp: data },
            ...prev,
          ].slice(0, FEED_CAP),
        )
        announce(data)
      } catch (err) {
        const fallback: TapResponse = {
          result: 'invalid_uid',
          message: err instanceof Error ? err.message : 'Network error',
        }
        setLatest(fallback)
        announce(fallback)
      } finally {
        setSubmitting(false)
        setUid('')
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
        flashTimerRef.current = setTimeout(() => setLatest(null), 4000)
      }
    },
    [submitting, announce],
  )

  const clearFeed = useCallback(() => {
    setFeed([])
  }, [])

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      try {
        window.speechSynthesis?.cancel()
      } catch {
        // ignore — page is unmounting anyway
      }
    },
    [],
  )

  // Derived counts for the today-only stats strip
  const todayStats = (() => {
    let success = 0
    let warn = 0
    let error = 0
    for (const e of feed) {
      if (!isToday(e.at)) continue
      const t = classify(e.resp.result)
      if (t === 'success') success++
      else if (t === 'warn') warn++
      else error++
    }
    return { success, warn, error, total: success + warn + error }
  })()

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-3 p-3 md:p-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ScanLine className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-tight">
              Attendance Kiosk
            </h1>
            <p className="text-xs text-muted-foreground leading-tight">
              Tap a card to mark attendance for the current academic year.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {todayStats.total > 0 && (
            <div className="hidden sm:flex items-center gap-1 text-[11px] mr-1">
              <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-800">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {todayStats.success}
              </Badge>
              {todayStats.warn > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  {todayStats.warn}
                </Badge>
              )}
              {todayStats.error > 0 && (
                <Badge variant="outline" className="gap-1 border-rose-200 bg-rose-50 text-rose-800">
                  <span className="size-1.5 rounded-full bg-rose-500" />
                  {todayStats.error}
                </Badge>
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundOn((s) => !s)}
            className="h-8 gap-1.5 text-xs"
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Sound on' : 'Sound off'}
          >
            {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            <span className="hidden sm:inline">{soundOn ? 'Sound' : 'Muted'}</span>
          </Button>
        </div>
      </div>

      {/* ── Result banner ──────────────────────────────────────────────── */}
      <ResultBanner response={latest} />

      {/* ── UID input ───────────────────────────────────────────────────── */}
      <Card className="border-2 border-dashed border-primary/30 bg-primary/[0.02] p-4">
        <div className="flex items-center gap-2 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <CreditCard className="size-3.5" />
          Tap or scan card
        </div>
        <UidCaptureInput
          id="kiosk-uid"
          value={uid}
          onChange={setUid}
          onCapture={handleCapture}
          autoFocus
          disabled={submitting}
          hint="Reader will tap-and-fire automatically. For NFC, switch to NFC mode."
        />
      </Card>

      {/* ── Recent taps ─────────────────────────────────────────────────── */}
      <Card className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Recent taps</h2>
            {feed.length > 0 && (
              <Badge variant="secondary" className="h-5 text-[10px] tabular-nums">
                {feed.length}
              </Badge>
            )}
          </div>
          {feed.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFeed}
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3" />
              Clear
            </Button>
          )}
        </div>
        {feed.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1.5 p-4 text-muted-foreground">
            <ScanLine className="size-5 opacity-50" />
            <p className="text-xs">Waiting for the first tap…</p>
          </div>
        ) : (
          <ul className="divide-y">
            {feed.map((e) => (
              <FeedRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function ResultBanner({ response }: { response: TapResponse | null }) {
  if (!response) {
    return (
      <Card className="flex h-32 flex-col items-center justify-center gap-1.5 border-dashed bg-muted/20 p-4 text-muted-foreground">
        <Info className="size-6 opacity-60" />
        <p className="text-sm font-medium">Ready for the next tap</p>
      </Card>
    )
  }
  const tone = classify(response.result)
  const palette =
    tone === 'success'
      ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-950 dark:from-emerald-950/40 dark:to-emerald-900/30 dark:text-emerald-50 dark:border-emerald-800/50'
      : tone === 'warn'
        ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-950 dark:from-amber-950/40 dark:to-amber-900/30 dark:text-amber-50 dark:border-amber-800/50'
        : 'border-rose-300 bg-gradient-to-br from-rose-50 to-rose-100/50 text-rose-950 dark:from-rose-950/40 dark:to-rose-900/30 dark:text-rose-50 dark:border-rose-800/50'

  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : XCircle

  return (
    <Card className={cn('flex items-center gap-4 border-2 p-4 shadow-sm transition-all', palette)}>
      <Icon className="size-12 shrink-0" />
      <div className="min-w-0 flex-1 text-center">
        {response.student ? (
          <>
            <div className="text-xl font-bold leading-tight">
              {response.student.firstName} {response.student.lastName}
            </div>
            <div className="text-sm opacity-80 mt-0.5">
              {response.student.className}
              {response.student.sectionName ? ` · ${response.student.sectionName}` : ''}
              {response.student.admissionNumber ? ` · Adm ${response.student.admissionNumber}` : ''}
            </div>
          </>
        ) : (
          <div className="text-lg font-bold leading-tight">
            {response.message || resultLabel(response.result)}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-xs">
          <Badge variant="outline" className="border-current font-semibold">
            {resultLabel(response.result)}
          </Badge>
          {response.message && response.student && (
            <span className="opacity-80">{response.message}</span>
          )}
        </div>
      </div>
      {response.student?.profileImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={response.student.profileImage}
          alt=""
          className="size-20 shrink-0 rounded-lg object-cover ring-2 ring-white/60 dark:ring-white/10"
        />
      ) : response.student ? (
        <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-white/60 dark:bg-white/10 text-xl font-bold tracking-wider">
          {initials(response.student.firstName, response.student.lastName)}
        </div>
      ) : null}
    </Card>
  )
}

function FeedRow({ entry }: { entry: FeedEntry }) {
  const { resp } = entry
  const tone = classify(resp.result)
  const left =
    tone === 'success'
      ? 'border-l-emerald-500'
      : tone === 'warn'
        ? 'border-l-amber-500'
        : 'border-l-rose-500'
  const bgHover =
    tone === 'success'
      ? 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20'
      : tone === 'warn'
        ? 'hover:bg-amber-50/50 dark:hover:bg-amber-950/20'
        : 'hover:bg-rose-50/50 dark:hover:bg-rose-950/20'

  return (
    <li className={cn('flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm transition-colors', left, bgHover)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
        {resp.student ? initials(resp.student.firstName, resp.student.lastName) : '··'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight">
          {resp.student
            ? `${resp.student.firstName} ${resp.student.lastName}`
            : resp.message || resultLabel(resp.result)}
        </div>
        <div className="truncate text-[11px] text-muted-foreground leading-tight mt-0.5">
          {resp.student?.className
            ? `${resp.student.className}${resp.student.sectionName ? ` · ${resp.student.sectionName}` : ''}`
            : null}
          {resp.student?.className && <span> · </span>}
          <span className="font-mono">{entry.uid}</span>
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">
        {resultLabel(resp.result)}
      </Badge>
      <span className="hidden sm:inline-block w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {formatFeedTime(entry.at)}
      </span>
    </li>
  )
}

function buildAnnouncement(r: TapResponse): string {
  const name = r.student ? `${r.student.firstName} ${r.student.lastName}` : null
  switch (r.result) {
    case 'marked':
      return name ? `${name}. Present marked.` : 'Present marked.'
    case 'updated':
      return name ? `${name}. Updated to present.` : 'Updated to present.'
    case 'duplicate':
      return name ? `${name}. Already present.` : 'Already present.'
    case 'unknown_card':
      return 'Unknown card.'
    case 'card_revoked':
      return 'Card revoked.'
    case 'enrollment_missing':
      return name ? `${name}. Not enrolled.` : 'Student not enrolled.'
    case 'finalized':
      return 'Day already finalized.'
    case 'non_teaching':
      return 'Non teaching day.'
    case 'invalid_uid':
      return 'Invalid card.'
  }
}

function resultLabel(code: ResultCode): string {
  switch (code) {
    case 'marked':
      return 'Marked present'
    case 'updated':
      return 'Updated to present'
    case 'duplicate':
      return 'Already present'
    case 'unknown_card':
      return 'Unknown card'
    case 'card_revoked':
      return 'Card revoked'
    case 'enrollment_missing':
      return 'Not enrolled'
    case 'finalized':
      return 'Day finalized'
    case 'non_teaching':
      return 'Non-teaching day'
    case 'invalid_uid':
      return 'Invalid UID'
  }
}
