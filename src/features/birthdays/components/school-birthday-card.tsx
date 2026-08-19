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

function Candle({ color }: { color: string }) {
  return (
    <div className="relative h-[26px] w-[5px] rounded-[2px]" style={{ background: color }}>
      <div className="absolute -top-[9px] left-1/2 h-[9px] w-[5px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#ffdf8a,#ff9d3d)] shadow-[0_0_6px_rgba(255,180,60,0.7)]" />
    </div>
  )
}

const imageDataUrlCache = new Map<string, string>()

function fetchAsDataUrl(url: string): Promise<string | null> {
  const cached = imageDataUrlCache.get(url)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'blob'
    xhr.onload = () => {
      if (xhr.status !== 200) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        imageDataUrlCache.set(url, dataUrl)
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

export const SchoolBirthdayCard = forwardRef<HTMLDivElement, SchoolBirthdayCardProps>(
  ({ student, school }, ref) => {
    const schoolName = school.name || 'Our School'
    const photo = student.profileImage || student.admission?.profileImage || null
    const initials = `${student.firstName?.[0] ?? ''}${student.lastName?.[0] ?? ''}`.toUpperCase() || '?'
    const classLine = [
      student.class?.name ? `Class ${student.class.name}` : null,
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
        className="relative flex h-[960px] w-[540px] max-w-none shrink-0 flex-col items-center overflow-hidden rounded-[14px] shadow-[0_24px_70px_rgba(0,0,0,0.32)] bg-[radial-gradient(circle_at_10%_6%,rgba(201,66,119,0.10),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(207,155,63,0.18),transparent_26%),radial-gradient(circle_at_88%_92%,rgba(201,66,119,0.12),transparent_30%),radial-gradient(circle_at_6%_94%,rgba(207,155,63,0.10),transparent_28%),linear-gradient(160deg,#fff8f0_0%,#fdeef1_55%,#ffffff_100%)]"
      >
        {/* Top strip */}
        <div className="absolute inset-x-0 top-0 z-[3] h-2 bg-[linear-gradient(90deg,#c94277,#1c2a52)]" />

        {/* Frame */}
        <div className="pointer-events-none absolute inset-3 z-[4] rounded-lg border border-[#cf9b3f]/55">
          <div className="pointer-events-none absolute inset-[5px] rounded-md border border-[#cf9b3f]/25" />
        </div>

        {/* Corners */}
        <div className="pointer-events-none absolute left-[14px] top-[14px] z-[4] h-[46px] w-[46px] opacity-85">
          <CornerOrnament />
        </div>
        <div className="pointer-events-none absolute right-[14px] top-[14px] z-[4] h-[46px] w-[46px] rotate-90 opacity-85">
          <CornerOrnament />
        </div>
        <div className="pointer-events-none absolute bottom-[14px] left-[14px] z-[4] h-[46px] w-[46px] -rotate-90 opacity-85">
          <CornerOrnament />
        </div>
        <div className="pointer-events-none absolute bottom-[14px] right-[14px] z-[4] h-[46px] w-[46px] rotate-180 opacity-85">
          <CornerOrnament />
        </div>

        {/* Confetti */}
        <div className="absolute left-[60px] top-[90px] size-[6px] rounded-full bg-[#cf9b3f] opacity-80" />
        <div className="absolute left-[470px] top-[140px] size-[4px] rounded-full bg-[#c94277] opacity-70" />
        <div className="absolute left-[40px] top-[250px] size-[5px] rounded-full bg-[#1c2a52] opacity-50" />
        <div className="absolute bottom-[220px] left-[480px] size-[6px] rounded-full bg-[#c94277] opacity-70" />
        <div className="absolute bottom-[300px] left-[50px] size-[4px] rounded-full bg-[#cf9b3f] opacity-80" />
        <div className="absolute left-[490px] top-[190px] size-2 rotate-45 bg-[#e8c374] opacity-70" />
        <div className="absolute bottom-[260px] left-[30px] size-2 rotate-45 bg-[#e8c374] opacity-70" />

        {/* Balloons */}
        <Balloon color="#c94277" className="left-[26px] top-[130px] h-[44px] w-[34px] -rotate-[8deg]" />
        <Balloon color="#e8c374" className="left-[56px] top-[175px] h-[32px] w-[24px] rotate-[6deg]" />
        <Balloon color="#1c2a52" className="bottom-[360px] left-[22px] h-[40px] w-[30px] rotate-[7deg]" />
        <Balloon color="#c94277" className="right-[26px] top-[130px] h-[44px] w-[34px] rotate-[8deg]" />
        <Balloon color="#e8c374" className="right-[56px] top-[175px] h-[32px] w-[24px] -rotate-[6deg]" />
        <Balloon color="#1c2a52" className="bottom-[360px] right-[22px] h-[40px] w-[30px] -rotate-[7deg]" />

        {/* Top: logo + school tagline */}
        <div className="z-[2] flex w-full flex-col items-center pt-10">
          {school.logo ? (
            <img
              src={logoSrc ?? ''}
              alt=""
              className="h-[74px] w-[74px] rounded-full border-2 border-[#cf9b3f]/60 bg-white/65 object-contain p-1 shadow-[0_4px_10px_rgba(0,0,0,0.08)]"
            />
          ) : (
            <div className="flex h-[74px] w-[74px] items-center justify-center rounded-full border-2 border-dashed border-[#9c2e5a] bg-white/65 p-1 text-center text-[9.5px] font-semibold leading-[1.3] text-[#9c2e5a] shadow-[0_4px_10px_rgba(0,0,0,0.08)]">
              SCHOOL
              <br />
              LOGO
            </div>
          )}
          <div className="mt-[10px] max-w-[400px] rounded-[2px] bg-[linear-gradient(135deg,#1c2a52,#131d3d)] px-5 py-2 text-center shadow-[0_4px_10px_rgba(0,0,0,0.15)]">
            <p className="truncate text-[13px] font-semibold tracking-[0.8px] text-[#e8c374]">
              {schoolName}
            </p>
            {addressLine && (
              <p className="mx-auto mt-0.5 max-w-[360px] truncate text-[9px] tracking-[0.4px] text-white/80">
                {addressLine}
              </p>
            )}
            {school.contactPhone && (
              <p className="text-[9px] tracking-[0.4px] text-white/60">{school.contactPhone}</p>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="z-[2] mt-[22px] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[4px] text-[#cf9b3f]">
            A Special Wish For You
          </p>
          <h2
            style={{ fontFamily: 'var(--font-fraunces), serif' }}
            className="mt-2 text-[44px] font-extrabold leading-[1.15] tracking-[0.5px] text-[#1c2a52]"
          >
            Happy
          </h2>
          <p
            style={{ fontFamily: 'var(--font-great-vibes), cursive' }}
            className="mt-1 bg-gradient-to-b from-[#c94277] to-[#9c2e5a] bg-clip-text pb-1.5 text-[60px] leading-[1.3] text-transparent"
          >
            Birthday!
          </p>
          <div className="mx-auto mt-3 flex w-[200px] items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#cf9b3f] to-transparent" />
            <div className="size-[6px] rotate-45 bg-[#cf9b3f]" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#cf9b3f] to-transparent" />
          </div>
        </div>

        {/* Photo */}
        <div className="z-[2] mt-4 h-[260px] w-[260px] rounded-[10px] bg-[linear-gradient(160deg,#e8c374,#cf9b3f_60%,#e8c374)] p-[7px] shadow-[0_14px_30px_rgba(28,42,82,0.22)]">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[6px] border-2 border-dashed border-[#9c2e5a] bg-[repeating-linear-gradient(45deg,rgba(201,66,119,0.07),rgba(201,66,119,0.07)_9px,rgba(255,255,255,0.55)_9px,rgba(255,255,255,0.55)_18px)]">
            {photo ? (
              <img src={photoSrc ?? ''} alt={student.fullName} className="size-full object-cover" />
            ) : (
              <span className="text-[40px] font-bold uppercase text-[#9c2e5a]">{initials}</span>
            )}
          </div>
        </div>

        {/* Name banner */}
        <div className="relative z-[2] mt-5 w-fit rounded-[3px] bg-[linear-gradient(135deg,#1c2a52_0%,#131d3d_100%)] px-[30px] py-[10px] text-center text-[14px] font-semibold tracking-[0.4px] text-white shadow-[0_8px_18px_rgba(28,42,82,0.3)]">
          <span className="absolute -left-[9px] top-0 h-full w-[9px] bg-[#cf9b3f] opacity-90 [clip-path:polygon(0_0,100%_0,100%_100%)]" />
          <span className="absolute -right-[9px] top-0 h-full w-[9px] bg-[#cf9b3f] opacity-90 [clip-path:polygon(0_0,100%_0,0_100%)]" />
          {student.fullName}
          {classLine !== '—' ? ` · ${classLine}` : ''}
        </div>

        {/* Message */}
        <p className="z-[2] mt-3 max-w-[360px] text-center text-[12.5px] leading-[1.7] text-[#4a4a4a]">
          Wishing you a day filled with happiness, love, and wonderful memories. May this year bring
          you success, good health, and all the joy you deserve.
        </p>

        {/* Cake */}
        <div className="z-[2] mt-3 flex flex-col items-center">
          <div className="flex items-end justify-center gap-[5px]">
            <Candle color="#cf9b3f" />
            <Candle color="#c94277" />
            <Candle color="#1c2a52" />
            <Candle color="#e8c374" />
          </div>
          <div className="relative mt-[5px] h-[50px] w-[110px] rounded-t-[8px] rounded-b-[3px] bg-[linear-gradient(180deg,#ffe3ef_0%,#c94277_130%)] shadow-[0_8px_16px_rgba(201,66,119,0.25)]">
            <div className="absolute -top-[7px] left-0 h-[15px] w-full rounded-t-full bg-white" />
            <div className="absolute bottom-[7px] left-[9px] right-[9px] h-[2px] bg-[#e8c374] opacity-70" />
          </div>
        </div>

        {/* Footer message */}
        <p className="z-[2] mt-3 max-w-[300px] text-center text-[12px] font-medium italic leading-[1.5] text-[#4a4a4a]">
          Keep shining and inspiring everyone around you.
        </p>

        {/* Ribbon */}
        <div className="relative z-[2] mt-2 w-fit bg-[linear-gradient(135deg,#c94277_0%,#9c2e5a_100%)] px-6 py-[7px] text-center shadow-[0_6px_14px_rgba(156,46,90,0.3)]">
          <span
            style={{ fontFamily: 'var(--font-great-vibes), cursive' }}
            className="text-2xl text-[#fff8f0]"
          >
            Fantastic Birthday!
          </span>
          <span className="absolute -left-[11px] top-0 border-y-[18px] border-r-[11px] border-y-transparent border-r-[#9c2e5a]" />
          <span className="absolute -right-[11px] top-0 border-y-[18px] border-l-[11px] border-y-transparent border-l-[#9c2e5a]" />
        </div>

        {/* From */}
        <div className="z-[2] mb-6 mt-[22px] text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[2.5px] text-[#666]">From</p>
          <p
            style={{ fontFamily: 'var(--font-fraunces), serif' }}
            className="mt-1 text-[19px] font-extrabold tracking-[0.3px] text-[#1c2a52]"
          >
            {schoolName}
          </p>
          <div className="mx-auto mt-2 h-[2px] w-[44px] bg-[#cf9b3f]" />
        </div>
      </div>
    )
  },
)

SchoolBirthdayCard.displayName = 'SchoolBirthdayCard'

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
      const dataUrl = await toPng(cardRef.current, {
        width: 540,
        height: 960,
        pixelRatio: 2,
        cacheBust: true,
        imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
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
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-rose-500/20 bg-card p-0 shadow-2xl shadow-rose-500/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <GradientDialogHeader
          icon={Cake}
          title={student ? `${student.fullName}'s birthday card` : 'Birthday card'}
          description="School-template birthday card — preview and download as a high-resolution PNG."
        />

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-rose-500/[0.04] via-background to-amber-500/[0.055] p-4 sm:p-5">
          {!student ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Select a student to preview their card.</p>
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