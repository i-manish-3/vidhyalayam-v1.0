'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import {
  type CertificateSnapshot,
  formatClassInWords,
  formatDateInWords,
} from '../lib/certificate-types'

interface TransferCertificateRendererProps {
  snapshot: CertificateSnapshot
  certificateNumber: string
  issueDate: Date | string
  effectiveDate?: Date | string | null
  purpose?: string | null
  remarks?: string | null
  isTemporary?: boolean
  className?: string
  schoolOverride?: {
    name?: string
    logo?: string | null
    printHeader?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
    pincode?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
    board?: string | null
    registrationNumber?: string | null
    affiliationNumber?: string | null
    udiseNumber?: string | null
    principalName?: string | null
    principalSignature?: string | null
    trustName?: string | null
  }
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function TransferCertificateRenderer({
  snapshot,
  certificateNumber,
  issueDate,
  effectiveDate,
  purpose,
  remarks,
  isTemporary = false,
  className,
  schoolOverride,
}: TransferCertificateRendererProps) {
  const s = snapshot.student
  const sch = {
    ...snapshot.school,
    ...schoolOverride,
  }

  const schoolName = sch.name || 'DAYARAMKA INTERNATIONAL PUBLIC SCHOOL'
  const trustName = sch.trustName || 'Dayaramka Educational And Charitable Trust'
  const schoolAddress = [sch.address, sch.city, sch.state, sch.pincode].filter(Boolean).join(', ')
  const logoUrl = sch.logo || null
  const headerBanner = sch.printHeader || null

  const studentName = s.fullName || `${s.firstName} ${s.lastName || ''}`.trim()
  const fatherName = s.fatherName || '—'
  const motherName = s.motherName || '—'
  const gender = s.gender || '—'
  const nationality = s.nationality || 'Indian'
  const category = s.category || '—'
  const dobFigure = s.dateOfBirth || '—'
  const dobWords = formatDateInWords(s.dateOfBirth) || '—'
  const dateOfAdmission = s.dateOfAdmission || '—'
  const admissionClass = formatClassInWords(s.admissionClass || s.previousClass || s.className) || s.admissionClass || '—'
  const currentClass = formatClassInWords(s.className) || s.className || '—'
  const examResult = `${currentClass} Passed`.trim()
  const failedStatus = 'No'
  const subjectsStudied = s.subjectsStudied || 'English, Hindi, Maths, Science, Social, G.K., Moral and Computer.'
  const promotionStatus = 'Yes'
  const duesPaid = 'Yes'
  const workingDays = s.workingDays || '222'
  const presentDays = s.presentDays || '183'
  const attendanceRatio = `${workingDays}/${presentDays}`
  const nccStatus = 'None'
  const applicationDate = formatDate(effectiveDate || issueDate) || '28/04/2026'
  const issueDateStr = formatDate(issueDate) || '01/05/2026'
  const conduct = 'Good'
  const reasonForLeaving = purpose || remarks || 'Due to change of residence.'
  const pen = s.penNumber || '229/2013/561'
  const apaar = s.apaarId || '498266827646'
  const admissionNo = s.admissionNumber || '0300/022'

  // Split school name into two lines if it contains INTERNATIONAL
  const isDefaultSchool = /dayaramka/i.test(schoolName)
  const line1 = isDefaultSchool ? 'DAYARAMKA INTERNATIONAL' : schoolName
  const line2 = isDefaultSchool ? 'PUBLIC SCHOOL' : ''

  return (
    <div
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
      className={cn(
        'transfer-certificate-container relative mx-auto w-full max-w-[210mm] bg-white font-sans text-[11px] leading-tight text-slate-900 shadow-md print:m-0 print:p-0 print:w-full print:max-w-none print:shadow-none print:break-inside-avoid print:page-break-inside-avoid',
        className,
      )}
    >
      {/* Container with relative positioning for decorative corner graphics */}
      <div className="relative min-h-[1050px] bg-white p-4 sm:p-7 print:p-5">
        {/* ============================================================== */}
        {/* CORNER ORNAMENTS (Deep Navy with Gold Trim - Matching Image)    */}
        {/* ============================================================== */}
        {/* Top-Left Corner Wedge */}
        <div className="pointer-events-none absolute top-0 left-0 w-36 sm:w-44 h-24 overflow-hidden z-20">
          <svg viewBox="0 0 160 90" fill="none" className="size-full">
            <path d="M0,0 L160,0 C120,8 80,35 60,65 C50,80 30,88 0,90 Z" fill="#093563" />
            <path d="M0,0 L160,0 C120,8 80,35 60,65 C50,80 30,88 0,90" stroke="#c59b27" strokeWidth="4" />
            <path d="M0,0 L160,0 C120,8 80,35 60,65 C50,80 30,88 0,90" stroke="#f4d03f" strokeWidth="1" opacity="0.7" />
          </svg>
        </div>

        {/* Top-Right Corner Wedge */}
        <div className="pointer-events-none absolute top-0 right-0 w-36 sm:w-44 h-24 overflow-hidden z-20 scale-x-[-1]">
          <svg viewBox="0 0 160 90" fill="none" className="size-full">
            <path d="M0,0 L160,0 C120,8 80,35 60,65 C50,80 30,88 0,90 Z" fill="#093563" />
            <path d="M0,0 L160,0 C120,8 80,35 60,65 C50,80 30,88 0,90" stroke="#c59b27" strokeWidth="4" />
            <path d="M0,0 L160,0 C120,8 80,35 60,65 C50,80 30,88 0,90" stroke="#f4d03f" strokeWidth="1" opacity="0.7" />
          </svg>
        </div>

        {/* Bottom Sweeping Navy Wave with Gold Ribbon */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 w-full h-20 sm:h-24 overflow-hidden z-20">
          <svg viewBox="0 0 800 100" preserveAspectRatio="none" className="size-full">
            <path d="M0,100 L0,30 C120,25 240,65 400,65 C560,65 680,25 800,30 L800,100 Z" fill="#093563" />
            <path d="M0,30 C120,25 240,65 400,65 C560,65 680,25 800,30" stroke="#c59b27" strokeWidth="5" fill="none" />
            <path d="M0,33 C120,28 240,68 400,68 C560,68 680,28 800,33" stroke="#f4d03f" strokeWidth="1.5" fill="none" opacity="0.7" />
          </svg>
        </div>

        {/* ============================================================== */}
        {/* GOLD RECTANGULAR INNER FRAME (Framing the Entire Content)      */}
        {/* ============================================================== */}
        <div className="pointer-events-none absolute inset-3 sm:inset-5 border-[2px] border-[#c59b27] z-10" />

        {/* ============================================================== */}
        {/* CONTENT WRAPPER INSIDE THE GOLD RECTANGULAR FRAME              */}
        {/* ============================================================== */}
        <div className="relative z-10 px-3 sm:px-6 pt-3 sm:pt-4 pb-20 sm:pb-24">
          {/* ============================================================== */}
          {/* 1. REPORT CARD STYLE HEADER                                   */}
          {/* ============================================================== */}
          {headerBanner ? (
            <div className="-mx-3 -mt-3 sm:-mx-6 sm:-mt-4 overflow-hidden border-b border-[#c59b27]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={headerBanner}
                alt={schoolName}
                className="block w-full h-auto object-contain"
              />
            </div>
          ) : (
            <header className="mb-2">
              <div className="flex items-center justify-between gap-4">
                {/* Left School Logo Crest */}
                <div className="flex shrink-0 items-center justify-center">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt={schoolName}
                      className="size-24 sm:size-28 object-contain"
                    />
                  ) : (
                    /* Dayaramka International Public School Authentic Crest */
                    <div className="size-24 sm:size-28 flex items-center justify-center">
                      <svg viewBox="0 0 120 120" className="size-full">
                        {/* Outer gold ring */}
                        <circle cx="60" cy="55" r="46" fill="#093563" stroke="#c59b27" strokeWidth="3" />
                        <circle cx="60" cy="55" r="41" fill="none" stroke="#e5b839" strokeWidth="1.5" strokeDasharray="3 2" />
                        <circle cx="60" cy="55" r="37" fill="#ffffff" />
                        
                        {/* Inner Laurel Wreath in gold */}
                        <path d="M36,55 C35,42 45,30 60,30 C75,30 85,42 84,55 C83,67 72,75 60,75 C48,75 37,67 36,55 Z" fill="#f8fafc" stroke="#c59b27" strokeWidth="1" />
                        
                        {/* Torch Flame */}
                        <path d="M60,34 C63,39 67,42 65,47 C63,51 57,51 55,47 C53,43 57,39 60,34 Z" fill="#e67e22" />
                        <path d="M60,37 C61,40 64,42 63,45 C62,47 58,47 57,45 C56,43 58,40 60,37 Z" fill="#f1c40f" />
                        
                        {/* Torch Handle / Cup */}
                        <path d="M54,49 L66,49 L63,60 L57,60 Z" fill="#c59b27" />
                        <rect x="58" y="60" width="4" height="12" fill="#7f8c8d" />

                        {/* Open Book */}
                        <path d="M42,67 C48,63 56,65 60,67 C64,65 72,63 78,67 L78,74 C72,70 64,72 60,74 C56,72 48,70 42,74 Z" fill="#3498db" opacity="0.9" />

                        {/* Ribbon at bottom */}
                        <path d="M22,90 L98,90 L90,104 L60,100 L30,104 Z" fill="#093563" stroke="#c59b27" strokeWidth="1.5" />
                        <text x="60" y="97" textAnchor="middle" fill="#ffffff" fontSize="6.5" fontWeight="bold" letterSpacing="0.5">
                          KNOWLEDGE BUILDS FUTURE
                        </text>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Center School Details */}
                <div className="flex-1 text-center pr-2">
                  <h1 className="font-serif text-xl sm:text-2xl font-black uppercase tracking-wide text-[#093563] leading-tight">
                    {line1}
                  </h1>
                  {line2 && (
                    <h2 className="font-serif text-xl sm:text-2xl font-black uppercase tracking-wide text-[#093563] leading-tight">
                      {line2}
                    </h2>
                  )}
                  {trustName && (
                    <p className="mt-0.5 text-[11px] sm:text-xs font-bold text-slate-800">
                      ({trustName.replace(/^\(|\)$/g, '')})
                    </p>
                  )}
                  {schoolAddress && (
                    <p className="mt-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-700">
                      {schoolAddress}
                    </p>
                  )}
                  {(sch.email || sch.website) && (
                    <p className="mt-0.5 text-[9.5px] sm:text-[10px] text-slate-700">
                      {sch.email && <span>e-mail: <strong className="font-medium text-slate-900">{sch.email}</strong></span>}
                      {sch.email && sch.website && <span className="mx-2 text-slate-400">|</span>}
                      {sch.website && <span>website: <strong className="font-medium text-slate-900">{sch.website}</strong></span>}
                    </p>
                  )}
                  {sch.phone && (
                    <p className="text-[9.5px] sm:text-[10px] text-slate-700">
                      Contact: <strong className="font-semibold text-slate-900">{sch.phone}</strong>
                    </p>
                  )}
                  {(sch.board || sch.affiliationNumber || sch.udiseNumber) && (
                    <p className="mt-0.5 text-[9px] text-slate-500 font-medium">
                      {sch.board ? `Affiliated to ${sch.board}` : null}
                      {sch.affiliationNumber ? ` · Affiliation No: ${sch.affiliationNumber}` : null}
                      {sch.udiseNumber ? ` · UDISE: ${sch.udiseNumber}` : null}
                    </p>
                  )}
                </div>
              </div>

              {/* Horizontal Gold Line Separator */}
              <div className="w-full h-[1.5px] bg-[#c59b27] mt-2 mb-2" />
            </header>
          )}

          {/* ============================================================== */}
          {/* 2. TITLE BANNER (Notched / Beveled Plaque with Gold Lines)     */}
          {/* ============================================================== */}
          <div className="my-2 flex items-center justify-center gap-2">
            <div className="h-[1.5px] flex-1 max-w-[80px] sm:max-w-[120px] bg-[#c59b27]" />
            <span className="text-[#c59b27] text-xs">◆</span>
            <div className="relative rounded-md border-2 border-[#c59b27] bg-[#093563] px-8 sm:px-14 py-1 shadow-xs">
              <h2 className="font-serif text-sm sm:text-base md:text-lg font-black tracking-widest text-white uppercase text-center">
                {isTemporary ? 'TEMPORARY TRANSFER CERTIFICATE' : 'TRANSFER CERTIFICATE'}
              </h2>
            </div>
            <span className="text-[#c59b27] text-xs">◆</span>
            <div className="h-[1.5px] flex-1 max-w-[80px] sm:max-w-[120px] bg-[#c59b27]" />
          </div>

          {/* ============================================================== */}
          {/* 3. 4-FIELD METADATA BOX (Blue Border, Rounded)                 */}
          {/* ============================================================== */}
          <div className="mt-2 rounded-lg border-[1.5px] border-[#2980b9] bg-white px-4 py-2 text-[11px] sm:text-xs text-slate-800">
            <div className="flex items-center justify-between font-serif">
              <div>
                <span className="font-bold text-slate-900">Student&apos;s PEN:</span>{' '}
                <span className="font-semibold text-slate-900">{pen}</span>
              </div>
              <div>
                <span className="font-bold text-slate-900">APAAR ID:</span>{' '}
                <span className="font-semibold text-slate-900">{apaar}</span>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between font-serif">
              <div>
                <span className="font-bold text-slate-900">TC No.</span>{' '}
                <span className="font-semibold text-slate-900">{certificateNumber}</span>
              </div>
              <div>
                <span className="font-bold text-slate-900">Admission No.</span>{' '}
                <span className="font-semibold text-slate-900">{admissionNo}</span>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* 4. 21-ITEM NUMBERED FORM (Blue Border Box with Dotted Lines)   */}
          {/* ============================================================== */}
          <div className="relative mt-2 rounded-lg border-[1.5px] border-[#2980b9] bg-white p-3 sm:p-4 text-[10.5px] sm:text-[11.5px]">
            {/* Subtle Centered School Torch Logo Watermark */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.045]">
              <svg viewBox="0 0 100 100" className="size-80">
                <circle cx="50" cy="50" r="45" fill="#093563" />
                <path d="M50,20 C54,28 60,32 58,40 C55,46 45,46 42,40 C40,32 46,28 50,20 Z" fill="#e67e22" />
                <path d="M42,44 L58,44 L54,60 L46,60 Z" fill="#c59b27" />
              </svg>
            </div>

            {/* 21 Numbered Items Table */}
            <table className="relative z-1 w-full border-collapse">
              <tbody>
                {/* 1. Name of Pupil */}
                <tr>
                  <td className="w-6 sm:w-7 align-top py-0.5 font-serif font-medium text-slate-700">1.</td>
                  <td className="w-[54%] sm:w-[56%] align-top py-0.5 font-serif font-medium text-slate-800">
                    Name of Pupil in full (In block letters)
                  </td>
                  <td className="w-4 align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif font-bold text-slate-900">
                    {studentName}
                  </td>
                </tr>

                {/* 2. Father's name */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">2.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">Father&apos;s name</td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {fatherName}
                  </td>
                </tr>

                {/* 3. Mother's name */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">3.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">Mother&apos;s name</td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {motherName}
                  </td>
                </tr>

                {/* 4. Gender */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">4.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">Gender</td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {gender}
                  </td>
                </tr>

                {/* 5. Nationality */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">5.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">Nationality</td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {nationality}
                  </td>
                </tr>

                {/* 6. Category */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">6.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Whether the pupil belongs to (Schedule Caste/Tribe/OBC)
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {category}
                  </td>
                </tr>

                {/* 7. Date of Birth */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">7.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800 leading-tight">
                    Date of Birth (According to the Admission Register
                    <div className="text-[10px] text-slate-600">(In Figure: __))</div>
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    <div>{dobFigure}</div>
                    <div className="italic text-slate-700 text-[10px] leading-tight">
                      {dobWords}
                    </div>
                  </td>
                </tr>

                {/* Spacing Gap between Groups */}
                <tr className="h-2">
                  <td colSpan={4} />
                </tr>

                {/* 8. Date of First admission */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">8.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Date of First admission in the school
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {dateOfAdmission}
                  </td>
                </tr>

                {/* 9. Admission was sought in class */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">9.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Admission was sought in class
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {admissionClass}
                  </td>
                </tr>

                {/* 10. Class in which pupil last studied */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">10.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Class in which the pupil last studied (In Figure)
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {currentClass}
                  </td>
                </tr>

                {/* 11. School Annual Examination result */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">11.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    School Annual Examination last taken with result
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {examResult}
                  </td>
                </tr>

                {/* 12. Whether failed */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">12.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Whether failed, if so once/twice in the same class
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {failedStatus}
                  </td>
                </tr>

                {/* 13. Subject studied */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">13.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">Subject studied</td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif italic text-slate-800">
                    {subjectsStudied}
                  </td>
                </tr>

                {/* Spacing Gap between Groups */}
                <tr className="h-2">
                  <td colSpan={4} />
                </tr>

                {/* 14. Promotion status */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">14.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Whether qualified for promotion to the higher class
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {promotionStatus}
                  </td>
                </tr>

                {/* 15. Dues paid */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">15.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Whether the pupil has paid all dues to the school
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {duesPaid}
                  </td>
                </tr>

                {/* 16. Working days / Present days */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">16.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Total No. of Working days/Present days
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {attendanceRatio}
                  </td>
                </tr>

                {/* 17. NCC / Scout */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">17.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Whether NCC Cadet/Boy Scout/Girl Guide
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {nccStatus}
                  </td>
                </tr>

                {/* 18. Date of Application */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">18.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Date of Application for certificate
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {applicationDate}
                  </td>
                </tr>

                {/* 19. Date of Issue */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">19.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Date of Issue of Certificate
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {issueDateStr}
                  </td>
                </tr>

                {/* 20. General Conduct */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">20.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">General Conduct</td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif text-slate-900">
                    {conduct}
                  </td>
                </tr>

                {/* 21. Reasons for leaving */}
                <tr>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-700">21.</td>
                  <td className="align-top py-0.5 font-serif font-medium text-slate-800">
                    Reasons for leaving the school
                  </td>
                  <td className="align-top py-0.5 text-center font-bold text-slate-700">:</td>
                  <td className="border-b border-dotted border-slate-400/80 pb-0.5 pl-1 align-top py-0.5 font-serif italic text-slate-800">
                    {reasonForLeaving}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ============================================================== */}
          {/* 5. SIGNATURES & BOTTOM GOLD FLOURISH                           */}
          {/* ============================================================== */}
          <div className="mt-8 flex items-end justify-between px-6 text-xs">
            {/* Left: Checked By */}
            <div className="text-center w-52">
              <div className="mx-auto w-44 border-b-[1.5px] border-[#093563] mb-1.5" />
              <p className="font-bold text-[#093563] font-serif text-xs">Checked By:</p>
              <p className="italic text-[10px] text-slate-600 font-serif">(State full name and designation)</p>
            </div>

            {/* Center: Golden flourish */}
            <div className="flex items-center justify-center opacity-90">
              <svg className="w-20 h-8 text-[#c59b27]" viewBox="0 0 100 40" fill="currentColor">
                <path d="M50 8 C48 15, 38 18, 30 18 C38 20, 44 26, 45 32 C46 26, 52 20, 60 20 C52 18, 48 15, 50 8 Z" />
                <path d="M50 20 C42 16, 25 18, 15 25 C25 24, 38 27, 45 34 C43 27, 46 22, 50 20 Z" />
                <path d="M50 20 C58 16, 75 18, 85 25 C75 24, 62 27, 55 34 C57 27, 54 22, 50 20 Z" />
                <circle cx="50" cy="20" r="2.5" />
                <circle cx="32" cy="21" r="1.5" />
                <circle cx="68" cy="21" r="1.5" />
                <line x1="5" y1="20" x2="22" y2="20" stroke="currentColor" strokeWidth="1" />
                <line x1="78" y1="20" x2="95" y2="20" stroke="currentColor" strokeWidth="1" />
              </svg>
            </div>

            {/* Right: Signature of Principal */}
            <div className="text-center w-56">
              {sch.principalSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sch.principalSignature}
                  alt="Principal Signature"
                  className="mx-auto h-10 object-contain mb-1"
                />
              ) : (
                <div className="h-8" />
              )}
              <div className="mx-auto w-48 border-b-[1.5px] border-[#093563] mb-1.5" />
              <p className="font-bold text-[#093563] font-serif text-xs">Signature of Principal</p>
              <p className="italic text-[10px] text-slate-600 font-serif">(with seal and date)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
