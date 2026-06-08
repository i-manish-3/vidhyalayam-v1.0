'use client'

import { useMemo, useRef, useState, Fragment } from 'react'
import Papa from 'papaparse'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Loader2,
  Users,
} from 'lucide-react'
import {
  BULK_TEMPLATE_COLUMNS,
  QUICK_TEMPLATE_COLUMNS,
  type RawRow,
  type RowDiagnostic,
  type NormalizedRow,
} from '@/lib/bulk-admission'

type Phase = 'upload' | 'preview' | 'committing' | 'done'

type ValidateResponse = {
  academicYear: string
  counts: { valid: number; warning: number; invalid: number }
  diagnostics: RowDiagnostic[]
}

type CommitResponse = {
  created: Array<{ index: number; studentId: string; admissionNumber: string; feesAssigned: boolean }>
  failed: Array<{ index: number; reason: string }>
}

const COMMIT_CHUNK_SIZE = 50

/**
 * Three sample rows that double as in-template documentation. Each one shows
 * a real scenario the school will hit during onboarding:
 *
 *   1. Vanilla student with full parent details.
 *   2. Sibling of (1) — same fatherPhone → shares familyId + parent login.
 *   3. Migrating student — admissionNumber override, no mother data.
 *
 * Keeping these in the template means the school doesn't need to read docs
 * to figure out the format. They overwrite these rows with their own data.
 */
const SAMPLE_ROWS: Array<Partial<Record<(typeof BULK_TEMPLATE_COLUMNS)[number], string>>> = [
  {
    firstName: 'Aarav',
    lastName: 'Sharma',
    dateOfBirth: '2014-05-12',
    gender: 'Boy',
    className: 'Class 5',
    sectionName: 'A',
    feesGroupName: 'Regular',
    fatherName: 'Rajesh Sharma',
    fatherPhone: '9876543210',
    motherName: 'Priya Sharma',
    motherPhone: '9876543211',
    rollNumber: '15',
    admissionNumber: '',
    address: '12 MG Road',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    pincode: '462001',
    bloodGroup: 'O+',
    religion: 'Hindu',
    category: 'General',
    nationality: 'Indian',
  },
  {
    // SAME fatherPhone as row 1 → sibling. Will share familyId + parent login.
    firstName: 'Diya',
    lastName: 'Sharma',
    dateOfBirth: '2016-08-23',
    gender: 'Girl',
    className: 'Class 3',
    sectionName: 'B',
    feesGroupName: 'Regular',
    fatherName: 'Rajesh Sharma',
    fatherPhone: '9876543210',
    motherName: 'Priya Sharma',
    motherPhone: '9876543211',
    rollNumber: '22',
    admissionNumber: '',
  },
  {
    // Migrating from old system: brings their existing admission number.
    // No mother data — Mother parent row will not be created.
    firstName: 'Vivaan',
    lastName: 'Kumar',
    dateOfBirth: '2014-03-15',
    gender: 'Boy',
    className: 'Class 5',
    sectionName: 'A',
    feesGroupName: 'Regular',
    fatherName: 'Anil Kumar',
    fatherPhone: '9123456789',
    motherName: '',
    motherPhone: '',
    rollNumber: '16',
    admissionNumber: 'STD-2024-047',
  },
]

export function BulkAdmissionPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [validation, setValidation] = useState<ValidateResponse | null>(null)
  const [validating, setValidating] = useState(false)
  const [filter, setFilter] = useState<'all' | 'valid' | 'warning' | 'invalid'>('all')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  const [commitProgress, setCommitProgress] = useState({ done: 0, total: 0 })
  const [commitResult, setCommitResult] = useState<CommitResponse>({ created: [], failed: [] })
  // Global toggle applied to every row in the batch — when true, server skips
  // join-month pro-rating in the fee assignment for all imported students.
  const [chargeFullYearFees, setChargeFullYearFees] = useState(false)

  // ─── Template download ────────────────────────────────────────────────────
  const downloadTemplate = (variant: 'quick' | 'advanced') => {
    const columns: readonly string[] =
      variant === 'quick' ? QUICK_TEMPLATE_COLUMNS : BULK_TEMPLATE_COLUMNS

    const header = columns.join(',')
    const rows = SAMPLE_ROWS.map((sample) =>
      columns
        .map((col) => csvEscape((sample as Record<string, string | undefined>)[col] ?? ''))
        .join(','),
    )
    const csv = [header, ...rows, ''].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download =
      variant === 'quick' ? 'student-admission-template.csv' : 'student-admission-template-advanced.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── File upload + parse ──────────────────────────────────────────────────
  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: 'Unsupported File',
        description: 'Please save your Excel file as CSV first and upload that.',
        variant: 'destructive',
      })
      return
    }

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: async (results) => {
        const cleaned: RawRow[] = results.data
          .map((row) => {
            const out: RawRow = {}
            for (const col of BULK_TEMPLATE_COLUMNS) {
              const v = (row as Record<string, unknown>)[col]
              if (typeof v === 'string') out[col] = v.trim()
            }
            return out
          })
          // Drop rows that are entirely empty (e.g. trailing blank line)
          .filter((row) => Object.values(row).some((v) => v && v.length > 0))

        if (cleaned.length === 0) {
          toast({
            title: 'Empty File',
            description: 'No data rows found in the CSV.',
            variant: 'destructive',
          })
          return
        }

        setFileName(file.name)
        setRawRows(cleaned)
        await runValidate(cleaned)
      },
      error: (err) => {
        toast({
          title: "Couldn't Read CSV",
          description: err.message,
          variant: 'destructive',
        })
      },
    })
  }

  const runValidate = async (rows: RawRow[]) => {
    setValidating(true)
    try {
      const res = await api.post<ValidateResponse>('/api/school/admissions/bulk/validate', { rows })
      setValidation(res)
      setPhase('preview')
    } catch (err) {
      toast({
        title: 'Validation Failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setValidating(false)
    }
  }

  const resetUpload = () => {
    setFileName(null)
    setRawRows([])
    setValidation(null)
    setCommitResult({ created: [], failed: [] })
    setCommitProgress({ done: 0, total: 0 })
    setExpandedRow(null)
    setPhase('upload')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Commit ───────────────────────────────────────────────────────────────
  const startCommit = async () => {
    if (!validation) return

    // Only commit valid + warning rows. Invalid are always skipped.
    const importable: Array<{ raw: RawRow; index: number }> = []
    for (const d of validation.diagnostics) {
      if (d.status !== 'invalid' && d.parsed) {
        importable.push({ raw: rawRowFromParsed(d.parsed), index: d.index })
      }
    }

    if (importable.length === 0) {
      toast({ title: 'Nothing To Import', description: 'No valid rows in the upload.', variant: 'destructive' })
      return
    }

    setPhase('committing')
    setCommitProgress({ done: 0, total: importable.length })
    setCommitResult({ created: [], failed: [] })

    const aggregated: CommitResponse = { created: [], failed: [] }
    for (let i = 0; i < importable.length; i += COMMIT_CHUNK_SIZE) {
      const chunk = importable.slice(i, i + COMMIT_CHUNK_SIZE)
      try {
        const res = await api.post<CommitResponse>('/api/school/admissions/bulk/commit', {
          rows: chunk.map((c) => c.raw),
          chargeFullYearFees,
        })
        // The server returns indexes relative to the chunk (0..chunk.length-1).
        // Re-map to original CSV indexes for the summary.
        for (const c of res.created) {
          aggregated.created.push({ ...c, index: chunk[c.index].index })
        }
        for (const f of res.failed) {
          aggregated.failed.push({ ...f, index: chunk[f.index].index })
        }
      } catch (err) {
        // Whole chunk failed (network/server). Mark every row in the chunk failed.
        const reason = err instanceof Error ? err.message : 'Network error'
        for (const c of chunk) {
          aggregated.failed.push({ index: c.index, reason })
        }
      }
      setCommitResult({ ...aggregated })
      setCommitProgress({ done: Math.min(i + chunk.length, importable.length), total: importable.length })
    }

    setPhase('done')
    toast({
      title: 'Bulk Import Finished',
      description: `${aggregated.created.length} admitted, ${aggregated.failed.length} failed.`,
    })
  }

  // Convert a NormalizedRow back to RawRow shape so the commit endpoint can
  // re-validate from the same input format. The original raw row is preferred
  // (preserves exact user input).
  const rawRowByIndex = useMemo(() => {
    const m = new Map<number, RawRow>()
    rawRows.forEach((r, i) => m.set(i, r))
    return m
  }, [rawRows])

  const rawRowFromParsed = (parsed: NormalizedRow): RawRow => {
    // Look up the original raw row by index via diagnostics — fallback to
    // synthesizing one from the parsed values.
    const diag = validation?.diagnostics.find((d) => d.parsed === parsed)
    if (diag) {
      const raw = rawRowByIndex.get(diag.index)
      if (raw) return raw
    }
    return {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      dateOfBirth: parsed.dateOfBirth,
      gender: parsed.gender,
      className: parsed.className,
      sectionName: parsed.sectionName ?? '',
      feesGroupName: parsed.feesGroupName,
      admissionNumber: parsed.admissionNumberOverride ?? '',
      rollNumber: parsed.rollNumber ?? '',
      fatherName: parsed.fatherName,
      fatherPhone: parsed.fatherPhone,
      motherName: parsed.motherName ?? '',
      motherPhone: parsed.motherPhone ?? '',
      address: parsed.address ?? '',
      city: parsed.city ?? '',
      state: parsed.state ?? '',
      pincode: parsed.pincode ?? '',
      aadhaarNumber: parsed.aadhaarNumber ?? '',
      bloodGroup: parsed.bloodGroup ?? '',
      religion: parsed.religion ?? '',
      category: parsed.category ?? '',
      nationality: parsed.nationality,
      previousSchool: parsed.previousSchool ?? '',
      // parsed drops the original sibling admission number (only the resolved
      // id survives); the by-index raw row is used in practice so this is blank.
      siblingAdmissionNumber: '',
      routeName: parsed.transportRouteName ?? '',
      stopName: parsed.transportStopName ?? '',
    }
  }

  // ─── Report download ──────────────────────────────────────────────────────
  const downloadReport = () => {
    const lines: string[] = ['rowIndex,status,admissionNumber,reason']
    for (const c of commitResult.created) {
      lines.push(`${c.index + 1},created,${c.admissionNumber},${c.feesAssigned ? 'fees assigned' : 'fees skipped'}`)
    }
    for (const f of commitResult.failed) {
      lines.push(`${f.index + 1},failed,,${csvEscape(f.reason)}`)
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bulk-admission-report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const filteredDiagnostics = useMemo(() => {
    if (!validation) return []
    if (filter === 'all') return validation.diagnostics
    return validation.diagnostics.filter((d) => d.status === filter)
  }, [validation, filter])

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 items-stretch gap-3">
        <span aria-hidden className="bg-brand mt-0.5 w-1 shrink-0 self-stretch rounded-full" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground/90">Bulk Admission</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Admit up to 1,000 students at once by uploading a CSV. Use this when onboarding a school for the first time.
          </p>
        </div>
      </div>

      {phase === 'upload' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="size-4" />
                Upload CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-6 py-12 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                {validating ? (
                  <>
                    <Loader2 className="size-8 text-primary animate-spin" />
                    <span className="text-sm font-medium">Validating rows…</span>
                  </>
                ) : (
                  <>
                    <FileText className="size-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Click to choose a CSV file</span>
                    <span className="text-xs text-muted-foreground">.csv only. Save Excel files as CSV first.</span>
                  </>
                )}
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="size-4" />
                Get the Template
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Most schools only need the Quick template. It already has 3 example rows showing common scenarios — just overwrite them with your data.
              </p>
              <Button variant="default" className="w-full gap-2" onClick={() => downloadTemplate('quick')}>
                <Download className="size-4" />
                Download Quick Template (13 columns)
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={() => downloadTemplate('advanced')}>
                <Download className="size-4" />
                Advanced Template (23 columns)
              </Button>

              <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-2">
                <div>
                  <p className="font-semibold text-foreground">Required (must be filled in every row)</p>
                  <p className="text-muted-foreground mt-0.5">
                    firstName, lastName, dateOfBirth, gender, className, feesGroupName, fatherName, fatherPhone
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Optional (Quick template)</p>
                  <p className="text-muted-foreground mt-0.5">
                    sectionName, motherName, motherPhone, rollNumber, admissionNumber
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Optional (Advanced template only)</p>
                  <p className="text-muted-foreground mt-0.5">
                    address, city, state, pincode, aadhaarNumber, bloodGroup, religion, category, nationality, previousSchool, siblingAdmissionNumber, routeName, stopName
                  </p>
                </div>
              </div>

              <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1.5">
                <p className="font-semibold text-foreground">Tips</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>Date format: <code>YYYY-MM-DD</code> or <code>DD/MM/YYYY</code>.</li>
                  <li>Gender: Boy, Girl, or Other.</li>
                  <li>Siblings: use the same <code>fatherPhone</code> — they&apos;ll automatically share family ID and one parent login.</li>
                  <li>Migrating from another system: paste your old admission number into the <code>admissionNumber</code> column to keep it.</li>
                  <li>If <code>admissionNumber</code> is blank, one will be auto-generated (STD-{new Date().getFullYear()}-001, etc).</li>
                  <li>Link to an already-enrolled sibling: put their admission number in <code>siblingAdmissionNumber</code> (Advanced) — shares family ID and parent login.</li>
                  <li>Transport: fill both <code>routeName</code> and <code>stopName</code> (Advanced) — the stop must have a fare configured for this year. Monthly transport fees are added automatically.</li>
                  <li>If no fee structure exists for a class+group, the student is still admitted — without fees. Set it up later and assign.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {phase === 'preview' && validation && (
        <PreviewSection
          validation={validation}
          filter={filter}
          setFilter={setFilter}
          filteredDiagnostics={filteredDiagnostics}
          expandedRow={expandedRow}
          setExpandedRow={setExpandedRow}
          fileName={fileName}
          onReset={resetUpload}
          onCommit={startCommit}
          chargeFullYearFees={chargeFullYearFees}
          setChargeFullYearFees={setChargeFullYearFees}
        />
      )}

      {phase === 'committing' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              Importing students
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={(commitProgress.done / Math.max(commitProgress.total, 1)) * 100} />
            <p className="text-sm text-muted-foreground">
              {commitProgress.done} of {commitProgress.total} processed — please keep this tab open.
            </p>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600">✓ {commitResult.created.length} admitted</span>
              <span className="text-destructive">✗ {commitResult.failed.length} failed</span>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="size-4 text-green-600" />
              Bulk Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryStat
                label="Admitted"
                value={commitResult.created.length}
                tone="success"
                icon={<Users className="size-4" />}
              />
              <SummaryStat
                label="Fees Skipped"
                value={commitResult.created.filter((c) => !c.feesAssigned).length}
                tone="warning"
                icon={<AlertTriangle className="size-4" />}
              />
              <SummaryStat
                label="Failed"
                value={commitResult.failed.length}
                tone="destructive"
                icon={<XCircle className="size-4" />}
              />
            </div>

            {commitResult.failed.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>{commitResult.failed.length} rows failed</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
                    {commitResult.failed.slice(0, 30).map((f) => (
                      <li key={f.index}>
                        Row {f.index + 1}: {f.reason}
                      </li>
                    ))}
                    {commitResult.failed.length > 30 && (
                      <li>… and {commitResult.failed.length - 30} more. Download the report for full details.</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadReport} variant="outline" className="gap-2">
                <Download className="size-4" />
                Download Report
              </Button>
              <Button onClick={resetUpload} className="gap-2">
                <Upload className="size-4" />
                Upload Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Preview section (extracted to keep the main component readable)
// ────────────────────────────────────────────────────────────────────────────

function PreviewSection({
  validation,
  filter,
  setFilter,
  filteredDiagnostics,
  expandedRow,
  setExpandedRow,
  fileName,
  onReset,
  onCommit,
  chargeFullYearFees,
  setChargeFullYearFees,
}: {
  validation: ValidateResponse
  filter: 'all' | 'valid' | 'warning' | 'invalid'
  setFilter: (f: 'all' | 'valid' | 'warning' | 'invalid') => void
  filteredDiagnostics: RowDiagnostic[]
  expandedRow: number | null
  setExpandedRow: (n: number | null) => void
  fileName: string | null
  onReset: () => void
  onCommit: () => void
  chargeFullYearFees: boolean
  setChargeFullYearFees: (v: boolean) => void
}) {
  const importable = validation.counts.valid + validation.counts.warning
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <FileText className="size-4" />
            {fileName} — {validation.diagnostics.length} rows · {validation.academicYear}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onReset}>
              Upload Another
            </Button>
            <Button size="sm" disabled={importable === 0} onClick={onCommit} className="gap-1">
              <Upload className="size-3.5" />
              Import {importable} row{importable === 1 ? '' : 's'}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border/70 bg-muted/30 p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="bulkChargeFullYearFees"
              checked={chargeFullYearFees}
              onCheckedChange={(v) => setChargeFullYearFees(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="bulkChargeFullYearFees" className="text-sm font-medium leading-snug cursor-pointer">
                Charge full academic-year fees for every imported student
              </Label>
              <p className="text-[11.5px] text-muted-foreground leading-snug">
                By default, each student is billed only from their admission month onwards
                (monthly fees pro-rated). Tick this if every student in this batch should be
                billed for the full academic year regardless of admission date — pre-join months
                will be created as overdue. Applies to all rows in the import.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label={`All (${validation.diagnostics.length})`}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterChip
            label={`Valid (${validation.counts.valid})`}
            active={filter === 'valid'}
            tone="success"
            onClick={() => setFilter('valid')}
          />
          <FilterChip
            label={`Warnings (${validation.counts.warning})`}
            active={filter === 'warning'}
            tone="warning"
            onClick={() => setFilter('warning')}
          />
          <FilterChip
            label={`Errors (${validation.counts.invalid})`}
            active={filter === 'invalid'}
            tone="destructive"
            onClick={() => setFilter('invalid')}
          />
        </div>

        {validation.counts.invalid > 0 && (
          <Alert variant="destructive">
            <AlertTitle>{validation.counts.invalid} row(s) have errors</AlertTitle>
            <AlertDescription>
              Invalid rows are skipped during import. Fix them in your CSV and re-upload to admit them.
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2 w-24">Status</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Class / Section</th>
                <th className="px-3 py-2">Fees Group</th>
                <th className="px-3 py-2">Father</th>
                <th className="px-3 py-2 w-32">Adm. No.</th>
              </tr>
            </thead>
            <tbody>
              {filteredDiagnostics.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No rows in this filter.
                  </td>
                </tr>
              )}
              {filteredDiagnostics.map((d) => {
                const isOpen = expandedRow === d.index
                const tone =
                  d.status === 'invalid' ? 'bg-destructive/5' : d.status === 'warning' ? 'bg-amber-500/5' : ''
                return (
                  <Fragment key={d.index}>
                    <tr
                      className={`cursor-pointer border-t hover:bg-muted/30 ${tone}`}
                      onClick={() => setExpandedRow(isOpen ? null : d.index)}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{d.index + 1}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="px-3 py-2">
                        {d.parsed ? `${d.parsed.firstName} ${d.parsed.lastName}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {d.parsed?.className ?? '—'}
                        {d.parsed?.sectionName ? ` · ${d.parsed.sectionName}` : ''}
                      </td>
                      <td className="px-3 py-2">{d.parsed?.feesGroupName ?? '—'}</td>
                      <td className="px-3 py-2">{d.parsed?.fatherName ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {d.parsed?.admissionNumberOverride ?? <span className="text-muted-foreground">auto</span>}
                      </td>
                    </tr>
                    {isOpen && (d.errors.length > 0 || d.warnings.length > 0) && (
                      <tr className={`border-t ${tone}`}>
                        <td colSpan={7} className="px-3 py-3 text-xs">
                          {d.errors.length > 0 && (
                            <div className="mb-2">
                              <p className="font-medium text-destructive">Errors</p>
                              <ul className="mt-1 list-disc pl-5 space-y-0.5 text-destructive">
                                {d.errors.map((e, i) => (
                                  <li key={i}>{e}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {d.warnings.length > 0 && (
                            <div>
                              <p className="font-medium text-amber-700 dark:text-amber-500">Warnings</p>
                              <ul className="mt-1 list-disc pl-5 space-y-0.5 text-amber-700 dark:text-amber-500">
                                {d.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function FilterChip({
  label,
  active,
  tone,
  onClick,
}: {
  label: string
  active: boolean
  tone?: 'success' | 'warning' | 'destructive'
  onClick: () => void
}) {
  const variant = active
    ? tone === 'destructive'
      ? 'destructive'
      : tone === 'warning'
        ? 'default'
        : tone === 'success'
          ? 'default'
          : 'default'
    : 'outline'
  return (
    <Badge
      variant={variant as 'default' | 'destructive' | 'outline'}
      className="cursor-pointer select-none"
      onClick={onClick}
    >
      {label}
    </Badge>
  )
}

function StatusBadge({ status }: { status: 'valid' | 'warning' | 'invalid' }) {
  if (status === 'valid') {
    return (
      <Badge variant="outline" className="gap-1 text-green-700 border-green-500/40">
        <CheckCircle2 className="size-3" /> Valid
      </Badge>
    )
  }
  if (status === 'warning') {
    return (
      <Badge variant="outline" className="gap-1 text-amber-700 border-amber-500/40">
        <AlertTriangle className="size-3" /> Warning
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="size-3" /> Error
    </Badge>
  )
}

function SummaryStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'success' | 'warning' | 'destructive'
  icon: React.ReactNode
}) {
  const color =
    tone === 'success'
      ? 'text-green-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-destructive'
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${color}`}>
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
