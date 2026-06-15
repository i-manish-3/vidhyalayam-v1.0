'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2, AlertCircle } from 'lucide-react'

export interface ExamComponentRow {
  id?: string
  name: string
  shortCode: string | null
  sequence: number
  maxMarks: number
  passingMarks: number
  gradeOnly: boolean
}

interface ComponentEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  totalMarks: number
  initialComponents: ExamComponentRow[]
  // gradeOnly subject configs don't enforce sum-to-total because they don't
  // carry numeric components — the editor still allows grade-only channels.
  isGradeOnlySubject?: boolean
  saving?: boolean
  onSave: (components: ExamComponentRow[]) => void | Promise<void>
  subjectLabel?: string
}

const PRESETS: Array<{ name: string; build: (total: number) => ExamComponentRow[] }> = [
  {
    name: 'Theory only',
    build: (total) => [
      { name: 'Theory', shortCode: 'TH', sequence: 0, maxMarks: total, passingMarks: 0, gradeOnly: false },
    ],
  },
  {
    name: 'Theory 80 + Practical 20',
    build: (total) => [
      { name: 'Theory', shortCode: 'TH', sequence: 0, maxMarks: Math.round(total * 0.8), passingMarks: 0, gradeOnly: false },
      { name: 'Practical', shortCode: 'PR', sequence: 1, maxMarks: total - Math.round(total * 0.8), passingMarks: 0, gradeOnly: false },
    ],
  },
  {
    name: 'Theory 80 + Internal 20 (CBSE)',
    build: (total) => [
      { name: 'Theory', shortCode: 'TH', sequence: 0, maxMarks: Math.round(total * 0.8), passingMarks: 0, gradeOnly: false },
      { name: 'Internal', shortCode: 'IN', sequence: 1, maxMarks: total - Math.round(total * 0.8), passingMarks: 0, gradeOnly: false },
    ],
  },
  {
    name: 'Theory 70 + Practical 20 + Internal 10',
    build: (total) => {
      const th = Math.round(total * 0.7)
      const pr = Math.round(total * 0.2)
      return [
        { name: 'Theory', shortCode: 'TH', sequence: 0, maxMarks: th, passingMarks: 0, gradeOnly: false },
        { name: 'Practical', shortCode: 'PR', sequence: 1, maxMarks: pr, passingMarks: 0, gradeOnly: false },
        { name: 'Internal', shortCode: 'IN', sequence: 2, maxMarks: total - th - pr, passingMarks: 0, gradeOnly: false },
      ]
    },
  },
]

function makeBlankRow(sequence: number, gradeOnly: boolean): ExamComponentRow {
  return {
    name: '',
    shortCode: null,
    sequence,
    maxMarks: gradeOnly ? 0 : 0,
    passingMarks: 0,
    gradeOnly,
  }
}

export function ComponentEditor({
  open,
  onOpenChange,
  totalMarks,
  initialComponents,
  isGradeOnlySubject = false,
  saving = false,
  onSave,
  subjectLabel,
}: ComponentEditorProps) {
  const [rows, setRows] = useState<ExamComponentRow[]>(initialComponents)

  // Reset rows whenever the dialog opens on a different subject config.
  useEffect(() => {
    if (open) {
      setRows(initialComponents.length > 0 ? initialComponents : [])
    }
  }, [open, initialComponents])

  const numericSum = useMemo(
    () => rows.filter((r) => !r.gradeOnly).reduce((s, r) => s + (Number(r.maxMarks) || 0), 0),
    [rows],
  )

  const seenNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) {
      const key = r.name.trim().toLowerCase()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [rows])

  const rowErrors = rows.map((r) => {
    if (!r.name.trim()) return 'Name required.'
    if (seenNames.get(r.name.trim().toLowerCase())! > 1) return 'Duplicate name.'
    if (!r.gradeOnly) {
      if (!Number.isFinite(r.maxMarks) || r.maxMarks < 0) return 'Max marks must be ≥ 0.'
      if (r.passingMarks < 0 || r.passingMarks > r.maxMarks) return 'Passing marks must be between 0 and max.'
    }
    return null
  })

  const sumValid = isGradeOnlySubject || rows.length === 0 || Math.abs(numericSum - totalMarks) < 0.01
  const canSave = !saving && rowErrors.every((e) => e === null) && sumValid

  function updateRow(idx: number, patch: Partial<ExamComponentRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }
  function addRow(gradeOnly = false) {
    setRows((prev) => [...prev, makeBlankRow(prev.length, gradeOnly || isGradeOnlySubject)])
  }
  function applyPreset(preset: typeof PRESETS[number]) {
    setRows(preset.build(totalMarks))
  }

  async function handleSave() {
    if (!canSave) return
    // Trim names + normalize shortCodes before sending up.
    const cleaned = rows.map((r, i) => ({
      ...r,
      name: r.name.trim(),
      shortCode: r.shortCode?.trim() || null,
      sequence: r.sequence ?? i,
    }))
    await onSave(cleaned)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Components{subjectLabel ? ` — ${subjectLabel}` : ''}</DialogTitle>
          <DialogDescription>
            {isGradeOnlySubject
              ? 'Grade-only subject. Add channels that capture grades (no numeric marks).'
              : `Split the ${totalMarks}-mark total across scoring channels. Component max marks must sum to ${totalMarks}.`}
          </DialogDescription>
        </DialogHeader>

        {!isGradeOnlySubject && rows.length === 0 && (
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
            <p className="col-span-full text-xs text-muted-foreground">Start from a preset:</p>
            {PRESETS.map((p) => (
              <Button
                key={p.name}
                type="button"
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                onClick={() => applyPreset(p)}
              >
                {p.name}
              </Button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 rounded-md border bg-card p-2"
            >
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</Label>
                <Input
                  className="h-8"
                  placeholder="Theory"
                  value={row.name}
                  onChange={(e) => updateRow(idx, { name: e.target.value })}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Code</Label>
                <Input
                  className="h-8"
                  placeholder="TH"
                  value={row.shortCode ?? ''}
                  onChange={(e) => updateRow(idx, { shortCode: e.target.value })}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Max</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8"
                  disabled={row.gradeOnly}
                  value={row.maxMarks}
                  onChange={(e) =>
                    updateRow(idx, { maxMarks: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Pass</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8"
                  disabled={row.gradeOnly}
                  value={row.passingMarks}
                  onChange={(e) =>
                    updateRow(idx, { passingMarks: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <div className="col-span-9 flex items-center gap-2 sm:col-span-1">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={row.gradeOnly}
                    onCheckedChange={(v) => updateRow(idx, { gradeOnly: Boolean(v), maxMarks: 0, passingMarks: 0 })}
                  />
                  Grade
                </label>
              </div>
              <div className="col-span-3 flex items-end justify-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => removeRow(idx)}
                  aria-label="Remove component"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {rowErrors[idx] && (
                <p className="col-span-12 flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="size-3" /> {rowErrors[idx]}
                </p>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => addRow(false)}>
                <Plus className="size-3.5" /> Add component
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => addRow(true)}>
                <Plus className="size-3.5" /> Add grade-only
              </Button>
            </div>
            {!isGradeOnlySubject && rows.length > 0 && (
              <span
                className={
                  'text-xs font-medium ' +
                  (sumValid ? 'text-emerald-600' : 'text-destructive')
                }
              >
                Sum: {numericSum} / {totalMarks}
                {!sumValid && ` (off by ${(numericSum - totalMarks).toFixed(2)})`}
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save components'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
