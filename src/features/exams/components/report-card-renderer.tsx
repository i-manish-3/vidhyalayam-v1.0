/**
 * Pure React component that turns a `ReportCardData` shape into printable
 * HTML. Used by:
 *  - the bulk print page (`src/app/print/report-cards/[examId]/page.tsx`)
 *  - the admin preview panel inside the template editor / results screens
 *
 * Keeps all visual decisions here. The generator only decides *what* to show;
 * this file decides *how* it looks. Tailwind is used so the same component
 * works in the in-app preview and in the print sheet without extra CSS.
 */

import { cn } from '@/lib/utils'
import type { ReportCardData } from '@/features/exams/lib/report-card-generator'

interface Props {
  data: ReportCardData
  className?: string
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'pass':
      return { label: 'PASS', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'fail':
      return { label: 'FAIL', cls: 'bg-red-50 text-red-700 border-red-200' }
    case 'absent':
      return { label: 'ABSENT', cls: 'bg-gray-100 text-gray-700 border-gray-300' }
    case 'partial':
      return { label: 'PARTIAL', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'promoted':
      return { label: 'PROMOTED', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'detained':
      return { label: 'DETAINED', cls: 'bg-red-50 text-red-700 border-red-200' }
    case 'conditional':
      return { label: 'CONDITIONAL', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'withheld':
      return { label: 'WITHHELD', cls: 'bg-gray-100 text-gray-700 border-gray-300' }
    case 'not_applicable':
      return { label: 'N/A', cls: 'bg-gray-50 text-gray-500 border-gray-200' }
    default:
      return { label: status.toUpperCase(), cls: 'bg-gray-50 text-gray-700 border-gray-200' }
  }
}

export function ReportCardRenderer({ data, className }: Props) {
  const { school, examMeta, studentFields, subjects, totals, attendance, promotion, signatures, options, lifecycle } = data
  const overall = statusBadge(totals.status)

  // Build a stable list of component column names across subjects. Some subjects
  // have different components (e.g. Practical only for Science). Union of names
  // becomes the column header set; missing cells render as "—".
  const componentColumns: string[] = options.showComponents
    ? Array.from(
        new Set(
          subjects.flatMap((s) => s.components.map((c) => c.name)),
        ),
      )
    : []

  return (
    <div
      className={cn(
        'report-card-page mx-auto w-full max-w-[210mm] bg-white text-[11px] leading-tight text-gray-900 print:max-w-none print:shadow-none',
        className,
      )}
    >
      <div className="border-2 border-gray-800">
        {/* Header */}
        <header className="flex items-center gap-3 border-b-2 border-gray-800 px-4 py-3">
          {options.showLogo && school.logo ? (
            <img
              src={school.logo}
              alt=""
              className="size-16 shrink-0 object-contain"
              crossOrigin="anonymous"
            />
          ) : null}
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold uppercase tracking-wide">{school.name}</h1>
            {options.showAddress && school.address ? (
              <p className="text-[10px] text-gray-700">{school.address}</p>
            ) : null}
            <p className="mt-0.5 text-[10px] text-gray-600">
              {options.showAffiliation && school.affiliation ? `Affiliation No: ${school.affiliation}` : null}
              {options.showAffiliation && school.affiliation && school.udise ? '  ·  ' : null}
              {school.udise ? `UDISE: ${school.udise}` : null}
            </p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-wider">{data.title}</p>
            <p className="text-[10px] text-gray-600">
              {examMeta.paradigm ? `${examMeta.paradigm} · ` : ''}
              {examMeta.name}
              {' · '}Academic Year {examMeta.academicYear || school.academicYear}
            </p>
          </div>
        </header>

        {/* Lifecycle banner — shows withdrawal or mid-session-joiner status. */}
        {lifecycle.withdrawnOn ? (
          <div className="border-b border-red-300 bg-red-50 px-4 py-1.5 text-center text-[11px] font-semibold text-red-700">
            WITHDRAWN ON {lifecycle.withdrawnOn}
            {lifecycle.withdrawalReason ? ` · ${lifecycle.withdrawalReason}` : ''}
          </div>
        ) : lifecycle.joinedMidSession ? (
          <div className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-medium text-amber-800">
            Joined mid-session — some exams marked NA where the student was not enrolled.
          </div>
        ) : null}

        {/* Student block */}
        <section className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-gray-300 px-4 py-2 text-[11px]">
          {studentFields.map((f) => (
            <div key={f.key} className="flex border-b border-dotted border-gray-300 py-0.5">
              <span className="w-32 shrink-0 font-medium text-gray-600">{f.label}:</span>
              <span className="flex-1 font-semibold">{f.value || '—'}</span>
            </div>
          ))}
        </section>

        {/* Subjects table */}
        <section className="px-4 py-2">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b-2 border-gray-700 bg-gray-100 text-left">
                <th className="px-2 py-1.5 font-semibold">Subject</th>
                {componentColumns.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-center font-semibold">
                    {c}
                  </th>
                ))}
                {options.showMaxMarks && (
                  <th className="px-2 py-1.5 text-center font-semibold">Max</th>
                )}
                <th className="px-2 py-1.5 text-center font-semibold">Obtained</th>
                {options.showPercentage && (
                  <th className="px-2 py-1.5 text-center font-semibold">%</th>
                )}
                {options.showGrade && (
                  <th className="px-2 py-1.5 text-center font-semibold">Grade</th>
                )}
                <th className="px-2 py-1.5 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {subjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + componentColumns.length}
                    className="px-2 py-3 text-center text-gray-500"
                  >
                    No subjects to display.
                  </td>
                </tr>
              ) : (
                subjects.map((s) => {
                  const subjStatus = statusBadge(s.status)
                  return (
                    <tr key={s.subjectId} className="border-b border-gray-200">
                      <td className="px-2 py-1 font-medium">{s.subjectName}</td>
                      {componentColumns.map((c) => {
                        const comp = s.components.find((cc) => cc.name === c)
                        return (
                          <td key={c} className="px-2 py-1 text-center tabular-nums">
                            {comp ? `${comp.obtained}/${comp.max}` : '—'}
                          </td>
                        )
                      })}
                      {options.showMaxMarks && (
                        <td className="px-2 py-1 text-center tabular-nums">{s.totalMarks}</td>
                      )}
                      <td className="px-2 py-1 text-center font-semibold tabular-nums">
                        {s.obtainedMarks}
                      </td>
                      {options.showPercentage && (
                        <td className="px-2 py-1 text-center tabular-nums">
                          {s.percentage.toFixed(1)}
                        </td>
                      )}
                      {options.showGrade && (
                        <td className="px-2 py-1 text-center font-semibold">
                          {s.grade ?? '—'}
                        </td>
                      )}
                      <td className="px-2 py-1 text-center">
                        <span
                          className={cn(
                            'inline-block rounded border px-1.5 py-0.5 text-[9px] font-medium',
                            subjStatus.cls,
                          )}
                        >
                          {subjStatus.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-50 font-semibold">
                <td className="px-2 py-1.5">Total</td>
                {componentColumns.map((c) => (
                  <td key={c} className="px-2 py-1.5" />
                ))}
                {options.showMaxMarks && (
                  <td className="px-2 py-1.5 text-center tabular-nums">{totals.totalMarks}</td>
                )}
                <td className="px-2 py-1.5 text-center tabular-nums">{totals.obtainedMarks}</td>
                {options.showPercentage && (
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {totals.percentage.toFixed(2)}%
                  </td>
                )}
                {options.showGrade && (
                  <td className="px-2 py-1.5 text-center">{totals.grade ?? '—'}</td>
                )}
                <td className="px-2 py-1.5 text-center">
                  <span
                    className={cn(
                      'inline-block rounded border px-1.5 py-0.5 text-[9px] font-medium',
                      overall.cls,
                    )}
                  >
                    {overall.label}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Rank + attendance + promotion */}
        <section className="grid grid-cols-3 gap-2 border-t border-gray-300 px-4 py-2 text-[10px]">
          {options.showRank ? (
            <div className="rounded border border-gray-200 p-2">
              <div className="font-semibold text-gray-600">Rank</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums">
                {totals.rankInClass != null ? `${totals.rankInClass}` : '—'}
                {totals.rankInClass != null && (
                  <span className="ml-1 text-[10px] font-normal text-gray-500">in class</span>
                )}
              </div>
              {totals.rankInSection != null && (
                <div className="text-[10px] text-gray-600 tabular-nums">
                  {totals.rankInSection} in section
                </div>
              )}
            </div>
          ) : null}

          {options.showAttendance && attendance ? (
            <div className="rounded border border-gray-200 p-2">
              <div className="font-semibold text-gray-600">Attendance</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums">
                {attendance.percentage.toFixed(1)}%
              </div>
              {attendance.totalDays > 0 && (
                <div className="text-[10px] text-gray-600 tabular-nums">
                  {attendance.presentDays}/{attendance.totalDays} days
                </div>
              )}
            </div>
          ) : null}

          {promotion ? (
            <div className="rounded border border-gray-200 p-2">
              <div className="font-semibold text-gray-600">Promotion</div>
              <div className="mt-0.5 text-sm font-bold uppercase">
                {promotion.status === 'pending' ? '—' : promotion.status}
              </div>
              {promotion.remarks ? (
                <div className="text-[10px] text-gray-600">{promotion.remarks}</div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Signatures */}
        <footer className="grid grid-cols-3 gap-3 border-t-2 border-gray-700 px-4 py-3 text-[10px]">
          {signatures.slice(0, 3).map((label, i) => (
            <div key={`${label}-${i}`} className="flex flex-col items-center justify-end">
              {label === 'Principal' && school.principalSignature ? (
                <img
                  src={school.principalSignature}
                  alt=""
                  className="h-8 object-contain"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="h-8" />
              )}
              <div className="mt-1 w-full border-t border-gray-500 pt-0.5 text-center font-medium text-gray-700">
                {label}
              </div>
            </div>
          ))}
        </footer>
      </div>
    </div>
  )
}
