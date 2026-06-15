/**
 * Pure React component that turns an `AdmitCardData` shape into a printable
 * hall ticket. Used by:
 *  - the bulk print page (`src/app/print/admit-cards/[examId]/page.tsx`)
 *  - the admin preview panel on the admit-card generate screen
 *
 * Visual decisions live here; the generator decides *what* to show. The signed
 * QR token is rendered to an image client-side via the `qrcode` package, the
 * same approach as the ID-card renderer.
 */

'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import type { AdmitCardData } from '@/features/exams/lib/admit-card-generator'

interface Props {
  data: AdmitCardData
  className?: string
}

export function AdmitCardRenderer({ data, className }: Props) {
  const { school, examMeta, student, datesheet, instructions, qrPayload } = data
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!qrPayload) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(qrPayload, { width: 256, margin: 0, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [qrPayload])

  return (
    <div
      className={cn(
        'admit-card-page mx-auto w-full max-w-[210mm] bg-white text-[11px] leading-tight text-gray-900 print:max-w-none print:shadow-none',
        className,
      )}
    >
      <div className="border-2 border-gray-800">
        {/* Header */}
        <header className="flex items-center gap-3 border-b-2 border-gray-800 px-4 py-3">
          {school.logo ? (
            <img
              src={school.logo}
              alt=""
              className="size-16 shrink-0 object-contain"
              crossOrigin="anonymous"
            />
          ) : null}
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold uppercase tracking-wide">{school.name}</h1>
            {school.address ? <p className="text-[10px] text-gray-700">{school.address}</p> : null}
            <p className="mt-0.5 text-[10px] text-gray-600">
              {school.affiliationNumber ? `Affiliation No: ${school.affiliationNumber}` : null}
              {school.affiliationNumber && school.udiseNumber ? '  ·  ' : null}
              {school.udiseNumber ? `UDISE: ${school.udiseNumber}` : null}
            </p>
            {school.contact ? <p className="text-[10px] text-gray-600">{school.contact}</p> : null}
          </div>
        </header>

        {/* Title band */}
        <div className="border-b-2 border-gray-800 bg-gray-100 px-4 py-1.5 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">{data.title}</p>
          <p className="text-[10px] text-gray-700">
            {examMeta.paradigm ? `${examMeta.paradigm} · ` : ''}
            {examMeta.group ? `${examMeta.group} · ` : ''}
            {examMeta.name} · {examMeta.academicYear}
            {examMeta.dateRange ? ` · ${examMeta.dateRange}` : ''}
          </p>
        </div>

        {/* Student block + photo + QR */}
        <section className="flex items-stretch gap-3 border-b-2 border-gray-800 px-4 py-3">
          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5">
            <Field label="Name" value={student.fullName} strong />
            <Field label="Roll No." value={student.rollNumber} strong />
            <Field label="Admission No." value={student.admissionNumber} />
            <Field label="Class / Section" value={`${student.className} — ${student.sectionName}`} />
            <Field label="Father's Name" value={student.fatherName} />
            <Field label="Mother's Name" value={student.motherName} />
            <Field label="Date of Birth" value={student.dateOfBirth} />
            <Field label="Gender" value={student.gender} />
          </div>

          <div className="flex shrink-0 flex-col items-center gap-2">
            <div className="flex size-24 items-center justify-center overflow-hidden border border-gray-400 bg-gray-50">
              {student.profileImage ? (
                <img
                  src={student.profileImage}
                  alt=""
                  className="size-full object-cover"
                  crossOrigin="anonymous"
                />
              ) : (
                <span className="text-3xl font-semibold uppercase text-gray-400">
                  {student.fullName.charAt(0) || '?'}
                </span>
              )}
            </div>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Verification QR" className="size-20" />
            ) : (
              <div className="size-20 border border-dashed border-gray-300" />
            )}
          </div>
        </section>

        {/* Datesheet */}
        <section className="border-b-2 border-gray-800 px-4 py-3">
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
            Examination Schedule
          </h2>
          {datesheet.length === 0 ? (
            <p className="py-2 text-center text-[11px] italic text-gray-500">
              The datesheet will be announced separately.
            </p>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-y border-gray-400 bg-gray-50 text-left">
                  <th className="px-2 py-1 font-semibold">#</th>
                  <th className="px-2 py-1 font-semibold">Subject</th>
                  <th className="px-2 py-1 font-semibold">Date</th>
                  <th className="px-2 py-1 font-semibold">Time</th>
                  <th className="px-2 py-1 font-semibold">Duration</th>
                  <th className="px-2 py-1 font-semibold">Room</th>
                </tr>
              </thead>
              <tbody>
                {datesheet.map((row, i) => (
                  <tr key={`${row.subjectName}-${i}`} className="border-b border-gray-200">
                    <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                    <td className="px-2 py-1 font-medium">{row.subjectName}</td>
                    <td className="px-2 py-1">{row.date}</td>
                    <td className="px-2 py-1">{row.time}</td>
                    <td className="px-2 py-1">{row.duration}</td>
                    <td className="px-2 py-1">{row.room}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Instructions */}
        {instructions.length > 0 ? (
          <section className="border-b-2 border-gray-800 px-4 py-3">
            <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
              Instructions
            </h2>
            <ol className="list-decimal space-y-0.5 pl-4 text-[10px] text-gray-700">
              {instructions.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* Signatures */}
        <footer className="flex items-end justify-between gap-4 px-4 pb-5 pt-10">
          <Signature label="Candidate's Signature" />
          <Signature label="Controller of Examinations" />
          <Signature label="Principal" image={school.principalSignature} />
        </footer>
      </div>
    </div>
  )
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-gray-500">{label}:</span>
      <span className={cn('min-w-0 break-words', strong ? 'font-semibold' : '')}>{value}</span>
    </div>
  )
}

function Signature({ label, image }: { label: string; image?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {image ? (
        <img src={image} alt="" className="h-8 object-contain" crossOrigin="anonymous" />
      ) : (
        <div className="h-8" />
      )}
      <div className="w-36 border-t border-gray-500" />
      <span className="text-[10px] text-gray-600">{label}</span>
    </div>
  )
}
