'use client'

/**
 * Printable Daily Collection Register — A4 landscape day-book of every receipt
 * collected on a given day, with mode-wise closing totals for the cashier.
 * Opened in a new tab from the Daily Register report tab; auto-fires print.
 */

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, AlertTriangle } from 'lucide-react'
import { SchoolPrintHeader } from '@/lib/print-header'

interface RegisterRow {
  receiptNumber: string | null
  time: string
  mode: string
  source: 'fees' | 'store'
  amount: number
  reference: string | null
  student: { name: string; admissionNumber: string | null; className: string | null; sectionName: string | null }
  heads: Array<{ name: string; amount: number }>
}

interface RegisterData {
  date: string
  grandTotal: number
  feesTotal: number
  storeTotal: number
  receiptCount: number
  rows: RegisterRow[]
  modeTotals: Array<{ mode: string; amount: number; count: number; fees: number; store: number }>
  school: any
}

function inr(n: number): string {
  return Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
}

function DailyCollectionPrint() {
  const sp = useSearchParams()
  const [data, setData] = useState<RegisterData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const printedOnce = useRef(false)

  const date = sp.get('date') || ''
  const mode = sp.get('mode') || ''
  const source = sp.get('source') || ''
  const classId = sp.get('classId') || ''

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (date) {
      const d = new Date(date)
      if (!isNaN(d.getTime())) params.set('date', d.toISOString())
    }
    if (mode) params.set('mode', mode)
    if (source) params.set('source', source)
    if (classId) params.set('classId', classId)
    params.set('forPrint', '1')
    fetch(`/api/school/fees/reports/daily-register?${params}`, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error('Could not load register'); return r.json() })
      .then((res) => { if (!cancelled) setData(res) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load register') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [date, mode, source, classId])

  useEffect(() => {
    if (!data || printedOnce.current) return
    printedOnce.current = true
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [data])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading register…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Couldn&apos;t load register</p>
            <p className="mt-0.5 text-xs">{error || 'Data unavailable.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const dateLabel = new Date(data.date).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-white p-4 text-black print:p-0">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-3 flex justify-end print:hidden">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 size-3.5" /> Print
          </Button>
        </div>

        {data.school && <SchoolPrintHeader school={data.school} />}

        <div className="my-3 text-center">
          <div className="text-base font-bold uppercase tracking-wide">Daily Collection Register</div>
          <div className="text-xs">{dateLabel}</div>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y-2 border-black bg-black/5">
              <th className="border border-black p-1 text-left">#</th>
              <th className="border border-black p-1 text-left">Time</th>
              <th className="border border-black p-1 text-left">Receipt</th>
              <th className="border border-black p-1 text-left">Student</th>
              <th className="border border-black p-1 text-left">Class</th>
              <th className="border border-black p-1 text-left">Source</th>
              <th className="border border-black p-1 text-left">Fee Heads</th>
              <th className="border border-black p-1 text-left">Mode</th>
              <th className="border border-black p-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={`${r.receiptNumber}-${i}`} className="break-inside-avoid">
                <td className="border border-black p-1 tabular-nums">{i + 1}</td>
                <td className="border border-black p-1 tabular-nums">
                  {new Date(r.time).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                </td>
                <td className="border border-black p-1 font-mono">{r.receiptNumber || '—'}</td>
                <td className="border border-black p-1">
                  {r.student.name}
                  {r.student.admissionNumber ? <span className="text-black/60"> ({r.student.admissionNumber})</span> : null}
                </td>
                <td className="border border-black p-1">
                  {r.student.className}{r.student.sectionName ? ` · ${r.student.sectionName}` : ''}
                </td>
                <td className="border border-black p-1">{r.source === 'store' ? 'Store' : 'Fees'}</td>
                <td className="border border-black p-1">
                  {r.heads.length ? r.heads.map((h) => h.name).join(', ') : 'Advance'}
                </td>
                <td className="border border-black p-1">{r.mode}</td>
                <td className="border border-black p-1 text-right tabular-nums">{inr(r.amount)}</td>
              </tr>
            ))}
            <tr className="border-y-2 border-black bg-black/5 font-bold">
              <td className="border border-black p-1" colSpan={8}>
                Total — {data.receiptCount} receipts (Fees {inr(data.feesTotal)} · Store {inr(data.storeTotal)})
              </td>
              <td className="border border-black p-1 text-right tabular-nums">{inr(data.grandTotal)}</td>
            </tr>
          </tbody>
        </table>

        {/* Mode-wise closing */}
        <div className="mt-4 flex flex-wrap gap-4">
          <div className="text-xs font-bold uppercase">Mode-wise closing:</div>
          {data.modeTotals.map((m) => (
            <div key={m.mode} className="text-xs">
              <span className="font-semibold">{m.mode}:</span> {inr(m.amount)}
              <span className="text-black/60"> (Fees {inr(m.fees)} · Store {inr(m.store)})</span>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-between text-[11px]">
          <div className="border-t border-black pt-1">Prepared by (Cashier)</div>
          <div className="border-t border-black pt-1">Verified by (Accountant)</div>
          <div className="border-t border-black pt-1">Principal</div>
        </div>
      </div>

      <style jsx global>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          html, body { background: white !important; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          thead { display: table-header-group; }
        }
      `}</style>
    </div>
  )
}

export default function DailyCollectionPrintPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <DailyCollectionPrint />
    </Suspense>
  )
}
