'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  type NormalizedRow,
  type RawRow,
  type RowDiagnostic,
} from '@/lib/bulk-admission'

type Phase = 'upload' | 'preview' | 'committing' | 'done'

type ValidateResponse = {
  academicYear: string
  counts: { valid: number; warning: number; invalid: number }
  diagnostics: RowDiagnostic[]
}

type CommitResponse = {
  created: Array<{ index: number; studentId: string; admissionNumber: string }>
  failed: Array<{ index: number; reason: string }>
}

const COMMIT_CHUNK_SIZE = 50

const SAMPLE_ROWS: Array<Partial<Record<(typeof BULK_TEMPLATE_COLUMNS)[number], string>>> = [
  {
    firstName: 'Aarav',
    lastName: 'Sharma',
    dateOfBirth: '2014-05-12',
    gender: 'Boy',
    className: 'Class 5',
    sectionName: 'A',
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
    firstName: 'Diya',
    lastName: 'Verma',
    dateOfBirth: '2016-08-23',
    gender: 'Girl',
    className: 'Class 3',
    sectionName: 'B',
    fatherName: 'Suresh Verma',
    fatherPhone: '9876543220',
    motherName: 'Neha Verma',
    motherPhone: '9876543221',
    rollNumber: '22',
    admissionNumber: '',
  },
  {
    firstName: 'Vivaan',
    lastName: 'Kumar',
    dateOfBirth: '2014-03-15',
    gender: 'Boy',
    className: 'Class 5',
    sectionName: 'A',
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

  const downloadTemplate = () => {
    const columns: readonly string[] = BULK_TEMPLATE_COLUMNS
    const rows = SAMPLE_ROWS.map((sample) =>
      columns.map((col) => csvEscape((sample as Record<string, string | undefined>)[col] ?? '')).join(','),
    )
    const csv = [columns.join(','), ...rows, ''].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'student-admission-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

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
      transformHeader: (header) => header.trim(),
      complete: async (results) => {
        const cleaned: RawRow[] = results.data
          .map((row) => {
            const out: RawRow = {}
            for (const col of BULK_TEMPLATE_COLUMNS) {
              const value = (row as Record<string, unknown>)[col]
              if (typeof value === 'string') out[col] = value.trim()
            }
            return out
          })
          .filter((row) => Object.values(row).some((value) => value && value.length > 0))

        if (cleaned.length === 0) {
          toast({ title: 'Empty File', description: 'No data rows found in the CSV.', variant: 'destructive' })
          return
        }

        setFileName(file.name)
        setRawRows(cleaned)
        await runValidate(cleaned)
      },
      error: (err) => {
        toast({ title: "Couldn't Read CSV", description: err.message, variant: 'destructive' })
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

  const rawRowByIndex = useMemo(() => {
    const rows = new Map<number, RawRow>()
    rawRows.forEach((row, index) => rows.set(index, row))
    return rows
  }, [rawRows])

  const rawRowFromParsed = (parsed: NormalizedRow): RawRow => {
    const diagnostic = validation?.diagnostics.find((item) => item.parsed === parsed)
    const raw = diagnostic ? rawRowByIndex.get(diagnostic.index) : null
    if (raw) return raw
    return {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      dateOfBirth: parsed.dateOfBirth,
      gender: parsed.gender,
      className: parsed.className,
      sectionName: parsed.sectionName ?? '',
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
    }
  }

  const startCommit = async () => {
    if (!validation) return

    const importable = validation.diagnostics
      .filter((diagnostic) => diagnostic.status !== 'invalid' && diagnostic.parsed)
      .map((diagnostic) => ({
        raw: rawRowFromParsed(diagnostic.parsed!),
        index: diagnostic.index,
      }))

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
          rows: chunk.map((item) => item.raw),
        })
        for (const created of res.created) {
          aggregated.created.push({ ...created, index: chunk[created.index].index })
        }
        for (const failed of res.failed) {
          aggregated.failed.push({ ...failed, index: chunk[failed.index].index })
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Network error'
        for (const row of chunk) aggregated.failed.push({ index: row.index, reason })
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

  const downloadReport = () => {
    const lines: string[] = ['rowIndex,status,admissionNumber,reason']
    for (const created of commitResult.created) lines.push(`${created.index + 1},created,${created.admissionNumber},`)
    for (const failed of commitResult.failed) lines.push(`${failed.index + 1},failed,,${csvEscape(failed.reason)}`)
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bulk-admission-report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredDiagnostics = useMemo(() => {
    if (!validation) return []
    if (filter === 'all') return validation.diagnostics
    return validation.diagnostics.filter((diagnostic) => diagnostic.status === filter)
  }, [validation, filter])

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 items-stretch gap-3">
        <span aria-hidden className="bg-brand mt-0.5 w-1 shrink-0 self-stretch rounded-full" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground/90">Bulk Admission</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Import student, parent, address, class, section, and admission number data. Fees and siblings are managed later.
          </p>
        </div>
      </div>

      {phase === 'upload' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
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
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-6 py-12 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                {validating ? (
                  <>
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <span className="text-sm font-medium">Validating rows...</span>
                  </>
                ) : (
                  <>
                    <FileText className="size-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Click to choose a CSV file</span>
                    <span className="text-xs text-muted-foreground">CSV only. Save Excel files as CSV first.</span>
                  </>
                )}
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="size-4" />
                Get the Template
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Download one simple CSV template, fill the student details, and upload it back.
              </p>
              <Button className="w-full gap-2" onClick={downloadTemplate}>
                <Download className="size-4" />
                Download Template
              </Button>

              <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
                <div>
                  <p className="font-semibold text-foreground">Required</p>
                  <p className="mt-0.5 text-muted-foreground">
                    firstName, lastName, dateOfBirth, gender, className, fatherName, fatherPhone
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Optional</p>
                  <p className="mt-0.5 text-muted-foreground">
                    sectionName, motherName, motherPhone, rollNumber, admissionNumber
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Profile details</p>
                  <p className="mt-0.5 text-muted-foreground">
                    address, city, state, pincode, aadhaarNumber, bloodGroup, religion, category, nationality, previousSchool
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 rounded-md border bg-muted/20 p-3 text-xs">
                <p className="font-semibold text-foreground">Tips</p>
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>Date format: <code>YYYY-MM-DD</code> or <code>DD/MM/YYYY</code>.</li>
                  <li>Gender: Boy, Girl, or Other.</li>
                  <li>Leave <code>admissionNumber</code> blank to auto-generate it.</li>
                  <li>Siblings can be added later from Edit Student.</li>
                  <li>No fee, transport fee, or hostel fee is created from bulk import.</li>
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
        />
      )}

      {phase === 'committing' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Loader2 className="size-4 animate-spin text-primary" />
              Importing students
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={(commitProgress.done / Math.max(commitProgress.total, 1)) * 100} />
            <p className="text-sm text-muted-foreground">
              {commitProgress.done} of {commitProgress.total} processed. Please keep this tab open.
            </p>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600">Imported: {commitResult.created.length}</span>
              <span className="text-destructive">Failed: {commitResult.failed.length}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-green-600" />
              Bulk Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryStat label="Admitted" value={commitResult.created.length} tone="success" icon={<Users className="size-4" />} />
              <SummaryStat label="Failed" value={commitResult.failed.length} tone="destructive" icon={<XCircle className="size-4" />} />
            </div>

            {commitResult.failed.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>{commitResult.failed.length} rows failed</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
                    {commitResult.failed.slice(0, 30).map((failed) => (
                      <li key={failed.index}>
                        Row {failed.index + 1}: {failed.reason}
                      </li>
                    ))}
                    {commitResult.failed.length > 30 && (
                      <li>And {commitResult.failed.length - 30} more. Download the report for full details.</li>
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
}: {
  validation: ValidateResponse
  filter: 'all' | 'valid' | 'warning' | 'invalid'
  setFilter: (filter: 'all' | 'valid' | 'warning' | 'invalid') => void
  filteredDiagnostics: RowDiagnostic[]
  expandedRow: number | null
  setExpandedRow: (index: number | null) => void
  fileName: string | null
  onReset: () => void
  onCommit: () => void
}) {
  const importable = validation.counts.valid + validation.counts.warning
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <FileText className="size-4" />
            {fileName} - {validation.diagnostics.length} rows - {validation.academicYear}
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
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label={`All (${validation.diagnostics.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label={`Valid (${validation.counts.valid})`} active={filter === 'valid'} tone="success" onClick={() => setFilter('valid')} />
          <FilterChip label={`Warnings (${validation.counts.warning})`} active={filter === 'warning'} tone="warning" onClick={() => setFilter('warning')} />
          <FilterChip label={`Errors (${validation.counts.invalid})`} active={filter === 'invalid'} tone="destructive" onClick={() => setFilter('invalid')} />
        </div>

        {validation.counts.invalid > 0 && (
          <Alert variant="destructive">
            <AlertTitle>{validation.counts.invalid} row(s) have errors</AlertTitle>
            <AlertDescription>Invalid rows are skipped during import. Fix them in your CSV and re-upload to admit them.</AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="w-12 px-3 py-2">#</th>
                <th className="w-24 px-3 py-2">Status</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Class / Section</th>
                <th className="px-3 py-2">Father</th>
                <th className="w-32 px-3 py-2">Adm. No.</th>
              </tr>
            </thead>
            <tbody>
              {filteredDiagnostics.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No rows in this filter.
                  </td>
                </tr>
              )}
              {filteredDiagnostics.map((diagnostic) => {
                const isOpen = expandedRow === diagnostic.index
                const tone =
                  diagnostic.status === 'invalid'
                    ? 'bg-destructive/5'
                    : diagnostic.status === 'warning'
                      ? 'bg-amber-500/5'
                      : ''
                return (
                  <Fragment key={diagnostic.index}>
                    <tr
                      className={`cursor-pointer border-t hover:bg-muted/30 ${tone}`}
                      onClick={() => setExpandedRow(isOpen ? null : diagnostic.index)}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{diagnostic.index + 1}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={diagnostic.status} />
                      </td>
                      <td className="px-3 py-2">
                        {diagnostic.parsed ? `${diagnostic.parsed.firstName} ${diagnostic.parsed.lastName}` : '-'}
                      </td>
                      <td className="px-3 py-2">
                        {diagnostic.parsed?.className ?? '-'}
                        {diagnostic.parsed?.sectionName ? ` / ${diagnostic.parsed.sectionName}` : ''}
                      </td>
                      <td className="px-3 py-2">{diagnostic.parsed?.fatherName ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {diagnostic.parsed?.admissionNumberOverride ?? <span className="text-muted-foreground">auto</span>}
                      </td>
                    </tr>
                    {isOpen && (diagnostic.errors.length > 0 || diagnostic.warnings.length > 0) && (
                      <tr className={`border-t ${tone}`}>
                        <td colSpan={6} className="px-3 py-3 text-xs">
                          {diagnostic.errors.length > 0 && (
                            <div className="mb-2">
                              <p className="font-medium text-destructive">Errors</p>
                              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-destructive">
                                {diagnostic.errors.map((error, index) => (
                                  <li key={index}>{error}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {diagnostic.warnings.length > 0 && (
                            <div>
                              <p className="font-medium text-amber-700 dark:text-amber-500">Warnings</p>
                              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-700 dark:text-amber-500">
                                {diagnostic.warnings.map((warning, index) => (
                                  <li key={index}>{warning}</li>
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
      <Badge variant="outline" className="gap-1 border-green-500/40 text-green-700">
        <CheckCircle2 className="size-3" /> Valid
      </Badge>
    )
  }
  if (status === 'warning') {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700">
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
  tone: 'success' | 'destructive'
  icon: React.ReactNode
}) {
  const color = tone === 'success' ? 'text-green-600' : 'text-destructive'
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
