'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { GradientDialogHeader } from '@/components/shared'
import { useToast } from '@/hooks/use-toast'
import { Cake, Download, Loader2 } from 'lucide-react'

export interface BirthdayCardStudent {
  id: string
  fullName: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  profileImage: string | null
  admissionNumber: string | null
  rollNumber: string | null
  class?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
  admission?: { profileImage: string | null } | null
}

export interface BirthdayCardSchool {
  name?: string | null
  logo?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  contactPhone?: string | null
  academicYear?: string | null
}

interface SchoolBirthdayCardProps {
  student: BirthdayCardStudent
  school: BirthdayCardSchool
}

function CornerOrnament() {
  return (
    <svg viewBox="0 0 46 46" fill="none">
      <path d="M2 2 Q2 24 24 24" stroke="#cf9b3f" strokeWidth="1.4" />
      <path d="M2 2 Q24 2 24 24" stroke="#cf9b3f" strokeWidth="1.4" opacity="0.5" />
      <circle cx="2" cy="2" r="3" fill="#cf9b3f" />
    </svg>
  )
}

function Balloon({
  color,
  className,
}: {
  color: string
  className: string
}) {
  return (
    <div className={`absolute rounded-full ${className}`} style={{ background: color, opacity: 0.85 }}>
      <div
        className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 border-x-[4px] border-t-[6px] border-x-transparent"
        style={{ borderTopColor: color }}
      />
      <div className="absolute -bottom-[22px] left-1/2 h-[26px] w-px bg-[#1c2a52]/25" />
    </div>
  )
}

const imageDataUrlCache = new Map<string, string>()

function proxiedUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }
  return url
}

function fetchAsDataUrl(url: string): Promise<string | null> {
  const key = proxiedUrl(url)
  const cached = imageDataUrlCache.get(key)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', key, true)
    xhr.responseType = 'blob'
    xhr.onload = () => {
      if (xhr.status !== 200) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        imageDataUrlCache.set(key, dataUrl)
        resolve(dataUrl)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(xhr.response as Blob)
    }
    xhr.onerror = () => resolve(null)
    xhr.onabort = () => resolve(null)
    xhr.send()
  })
}

function useEmbeddedImage(src: string | null | undefined): string | null {
  const [bySrc, setBySrc] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!src || bySrc[src]) return
    let cancelled = false
    void fetchAsDataUrl(src).then((dataUrl) => {
      if (!cancelled && dataUrl) {
        setBySrc((prev) => (prev[src] === dataUrl ? prev : { ...prev, [src]: dataUrl }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [src, bySrc])
  return (src && bySrc[src]) ?? src ?? null
}

// Force every <img> inside the card to a data URL and wait for it to decode
// before capture. html-to-image cannot fetch cross-origin URLs when drawing the
// PNG, so without this the photo/school logo render as blank placeholders.
export async function embedCardImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src
      if (!src || src.startsWith('data:')) return
      const dataUrl = await fetchAsDataUrl(src)
      if (dataUrl && dataUrl !== img.src) img.src = dataUrl
    }),
  )
  await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)))
}

export const SchoolBirthdayCard = forwardRef<HTMLDivElement, SchoolBirthdayCardProps>(
  ({ student, school }, ref) => {
    const schoolName = school.name || 'Our School'
    const photo = student.profileImage || student.admission?.profileImage || null
    const initials = `${student.firstName?.[0] ?? ''}${student.lastName?.[0] ?? ''}`.toUpperCase() || '?'
    const classLine = [
      student.class?.name ? `Class ${student.class.name.replace(/^class\s+/i, '')}` : null,
      student.section?.name ?? null,
    ].filter(Boolean).join(' · ') || '—'
    const addressLine = [school.address, school.city, school.state, school.pincode]
      .filter(Boolean)
      .join(', ')
    const logoSrc = useEmbeddedImage(school.logo)
    const photoSrc = useEmbeddedImage(photo)

    return (
      <div
        ref={ref}
        style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
        className="relative flex h-[1080px] w-[1080px] max-w-none shrink-0 flex-col items-center overflow-hidden rounded-[20px] shadow-[0_24px_70px_rgba(0,0,0,0.32)] bg-[radial-gradient(circle_at_10%_6%,rgba(201,66,119,0.10),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(207,155,63,0.18),transparent_26%),radial-gradient(circle_at_88%_92%,rgba(201,66,119,0.12),transparent_30%),radial-gradient(circle_at_6%_94%,rgba(207,155,63,0.10),transparent_28%),linear-gradient(160deg,#fff8f0_0%,#fdeef1_55%,#ffffff_100%)]"
      >
        {/* Top strip */}
        <div className="absolute inset-x-0 top-0 z-[3] h-3 bg-[linear-gradient(90deg,#c94277,#1c2a52)]" />

        {/* Frame */}
        <div className="pointer-events-none absolute inset-4 z-[4] rounded-xl border border-[#cf9b3f]/55">
          <div className="pointer-events-none absolute inset-[8px] rounded-lg border border-[#cf9b3f]/25" />
        </div>

        {/* Corners */}
        <div className="pointer-events-none absolute left-[18px] top-[18px] z-[4] h-[64px] w-[64px] opacity-85">
          <CornerOrnament />
        </div>
        <div className="pointer-events-none absolute right-[18px] top-[18px] z-[4] h-[64px] w-[64px] rotate-90 opacity-85">
          <CornerOrnament />
        </div>
        <div className="pointer-events-none absolute bottom-[18px] left-[18px] z-[4] h-[64px] w-[64px] -rotate-90 opacity-85">
          <CornerOrnament />
        </div>
        <div className="pointer-events-none absolute bottom-[18px] right-[18px] z-[4] h-[64px] w-[64px] rotate-180 opacity-85">
          <CornerOrnament />
        </div>

        {/* Confetti */}
        <div className="absolute left-[110px] top-[120px] size-2 rounded-full bg-[#cf9b3f] opacity-80" />
        <div className="absolute left-[920px] top-[180px] size-[5px] rounded-full bg-[#c94277] opacity-70" />
        <div className="absolute left-[70px] top-[340px] size-[7px] rounded-full bg-[#1c2a52] opacity-50" />
        <div className="absolute bottom-[300px] left-[950px] size-2 rounded-full bg-[#c94277] opacity-70" />
        <div className="absolute bottom-[410px] left-[90px] size-[5px] rounded-full bg-[#cf9b3f] opacity-80" />
        <div className="absolute left-[960px] top-[260px] size-[10px] rotate-45 bg-[#e8c374] opacity-70" />
        <div className="absolute bottom-[360px] left-[50px] size-[10px] rotate-45 bg-[#e8c374] opacity-70" />

        {/* Balloons */}
        <Balloon color="#c94277" className="left-[40px] top-[160px] h-[58px] w-[46px] -rotate-[8deg]" />
        <Balloon color="#e8c374" className="left-[80px] top-[220px] h-[42px] w-[32px] rotate-[6deg]" />
        <Balloon color="#1c2a52" className="bottom-[430px] left-[34px] h-[52px] w-[40px] rotate-[7deg]" />
        <Balloon color="#c94277" className="right-[40px] top-[160px] h-[58px] w-[46px] rotate-[8deg]" />
        <Balloon color="#e8c374" className="right-[80px] top-[220px] h-[42px] w-[32px] -rotate-[6deg]" />
        <Balloon color="#1c2a52" className="bottom-[430px] right-[34px] h-[52px] w-[40px] -rotate-[7deg]" />

        {/* Top: logo + school tagline */}
        <div className="z-[2] flex w-full flex-col items-center pt-6">
          {school.logo ? (
            <img
              src={logoSrc ?? ''}
              alt=""
              className="h-[104px] w-[104px] rounded-full border-[3px] border-[#cf9b3f]/60 bg-white/65 object-contain p-2 shadow-[0_6px_14px_rgba(0,0,0,0.08)]"
            />
          ) : (
            <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full border-[3px] border-dashed border-[#9c2e5a] bg-white/65 p-2 text-center text-[12px] font-semibold leading-[1.3] text-[#9c2e5a] shadow-[0_6px_14px_rgba(0,0,0,0.08)]">
              SCHOOL
              <br />
              LOGO
            </div>
          )}
          <div className="mt-3 rounded-md bg-[linear-gradient(135deg,#1c2a52,#131d3d)] px-8 py-2.5 text-center shadow-[0_6px_14px_rgba(0,0,0,0.15)]">
            <p className="truncate text-[25px] font-semibold tracking-[1.2px] text-[#e8c374]">
              {schoolName}
            </p>
            {addressLine && (
              <p className="mx-auto mt-0.5 max-w-[700px] truncate text-[13px] tracking-[0.6px] text-white/80">
                {addressLine}
              </p>
            )}
            {school.contactPhone && (
              <p className="text-[13px] tracking-[0.6px] text-white/60">{school.contactPhone}</p>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="z-[2] mt-4 text-center">
          <p className="text-[15px] font-semibold uppercase tracking-[6px] text-[#cf9b3f]">
            A Special Wish For You
          </p>
          <h2
            style={{ fontFamily: 'var(--font-fraunces), serif' }}
            className="mt-3 text-[58px] font-extrabold leading-[1.1] tracking-[0.8px] text-[#1c2a52]"
          >
            Happy
          </h2>
          <p
            style={{ fontFamily: 'var(--font-great-vibes), cursive' }}
            className="mt-1 bg-gradient-to-b from-[#c94277] to-[#9c2e5a] bg-clip-text pb-1.5 text-[78px] leading-[1.25] text-transparent"
          >
            Birthday!
          </p>
          <div className="mx-auto mt-3 flex w-[300px] items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#cf9b3f] to-transparent" />
            <div className="size-2 rotate-45 bg-[#cf9b3f]" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#cf9b3f] to-transparent" />
          </div>
        </div>

        {/* Photo */}
        <div className="z-[2] mt-4 h-[320px] w-[320px] rounded-[14px] bg-[linear-gradient(160deg,#e8c374,#cf9b3f_60%,#e8c374)] p-[10px] shadow-[0_18px_38px_rgba(28,42,82,0.22)]">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[9px] border-[3px] border-dashed border-[#9c2e5a] bg-[repeating-linear-gradient(45deg,rgba(201,66,119,0.07),rgba(201,66,119,0.07)_9px,rgba(255,255,255,0.55)_9px,rgba(255,255,255,0.55)_18px)]">
            {photo ? (
              <img src={photoSrc ?? ''} alt={student.fullName} className="size-full object-cover" />
            ) : (
              <span className="text-[56px] font-bold uppercase text-[#9c2e5a]">{initials}</span>
            )}
          </div>
        </div>

        {/* Name banner */}
        <div className="relative z-[2] mt-4 w-fit rounded-[4px] bg-[linear-gradient(135deg,#1c2a52_0%,#131d3d_100%)] px-[44px] py-[11px] text-center text-[19px] font-semibold tracking-[0.5px] text-white shadow-[0_10px_22px_rgba(28,42,82,0.3)]">
          <span className="absolute -left-[12px] top-0 h-full w-[12px] bg-[#cf9b3f] opacity-90 [clip-path:polygon(0_0,100%_0,100%_100%)]" />
          <span className="absolute -right-[12px] top-0 h-full w-[12px] bg-[#cf9b3f] opacity-90 [clip-path:polygon(0_0,100%_0,0_100%)]" />
          {student.fullName}
          {classLine !== '—' ? ` · ${classLine}` : ''}
        </div>

        {/* Message */}
        <p className="z-[2] mt-3 max-w-[740px] text-center text-[22px] leading-[1.65] text-[#4a4a4a]">
          Wishing you a day filled with happiness, love, and wonderful memories. May this year bring
          you success, good health, and all the joy you deserve.
        </p>

        {/* Ribbon */}
        <div className="relative z-[2] mt-auto mb-12 w-fit bg-[linear-gradient(135deg,#c94277_0%,#9c2e5a_100%)] px-10 py-[10px] text-center shadow-[0_8px_18px_rgba(156,46,90,0.3)]">
          <span
            style={{ fontFamily: 'var(--font-great-vibes), cursive' }}
            className="text-4xl text-[#fff8f0]"
          >
            Fantastic Birthday!
          </span>
          <span className="absolute -left-[13px] top-0 border-y-[24px] border-r-[13px] border-y-transparent border-r-[#9c2e5a]" />
          <span className="absolute -right-[13px] top-0 border-y-[24px] border-l-[13px] border-y-transparent border-l-[#9c2e5a]" />
        </div>
      </div>
    )
  },
)

SchoolBirthdayCard.displayName = 'SchoolBirthdayCard'

const CARD_W = 1080
const CARD_H = 1080

// Renders the 1080×1080 card scaled down to fit the modal width. The ref lands
// on the inner (unscaled) card so html-to-image still captures the full-res PNG.
export const ScaledBirthdayCard = forwardRef<HTMLDivElement, SchoolBirthdayCardProps>(
  ({ student, school }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)

    useEffect(() => {
      const el = containerRef.current
      if (!el) return
      const update = () => {
        setScale(Math.min(1, (el.clientWidth - 8) / CARD_W))
      }
      update()
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    return (
      <div ref={containerRef} className="w-full">
        <div
          className="mx-auto overflow-hidden rounded-2xl shadow-[0_18px_50px_rgba(28,42,82,0.25)]"
          style={{ width: CARD_W * scale, height: CARD_H * scale }}
        >
          <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <SchoolBirthdayCard ref={ref} student={student} school={school} />
          </div>
        </div>
      </div>
    )
  },
)

ScaledBirthdayCard.displayName = 'ScaledBirthdayCard'

interface SchoolBirthdayCardDialogProps {
  open: boolean
  student: BirthdayCardStudent | null
  school: BirthdayCardSchool
  onClose: () => void
}

export function SchoolBirthdayCardDialog({
  open,
  student,
  school,
  onClose,
}: SchoolBirthdayCardDialogProps) {
  const { toast } = useToast()
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    if (!cardRef.current || !student || downloading) return
    setDownloading(true)
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
      a.download = `birthday-${student.fullName.replace(/\s+/g, '-').toLowerCase()}.png`
      a.click()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not download card',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !downloading && !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-rose-500/20 bg-card p-0 shadow-2xl shadow-rose-500/15 sm:max-w-3xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <GradientDialogHeader
          icon={Cake}
          title={student ? `${student.fullName}'s birthday card` : 'Birthday card'}
          description="1080×1080 — a square birthday card. Download as a high-resolution PNG."
        />

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-rose-500/[0.04] via-background to-amber-500/[0.055] p-4 sm:p-5">
          {!student ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Select a student to preview their card.</p>
          ) : (
            <ScaledBirthdayCard ref={cardRef} student={student} school={school} />
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
            disabled={!student || downloading}
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