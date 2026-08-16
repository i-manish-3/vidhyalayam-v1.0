'use client'

import { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'

export type AggregationRuleType = 'sum_all' | 'weighted' | 'best_of_n'

export interface WeightedComponent {
  // The referent id depends on level: at paradigm level it's an examGroupId; at
  // group level it's an examId. The builder is agnostic — it just stores the id.
  id: string
  weight: number
}

export interface AggregationRule {
  type: AggregationRuleType
  // weighted
  components?: WeightedComponent[]
  // best_of_n
  n?: number
  ids?: string[]
}

export interface AggregationRuleItem {
  id: string
  label: string
  // Optional context shown next to the label (e.g. "Term 1" for a group).
  hint?: string
}

interface AggregationRuleBuilderProps {
  value: AggregationRule
  onChange: (next: AggregationRule) => void
  // The pool of items available to reference. For paradigm-level builders, pass
  // the groups under that paradigm. For group-level, pass the exams under the
  // group.
  items: ReadonlyArray<AggregationRuleItem>
  itemNoun?: string // "group" | "exam" — used in copy
}

const PRESETS: Array<{ id: string; label: string; build: (items: ReadonlyArray<AggregationRuleItem>) => AggregationRule }> = [
  {
    id: 'sum_all',
    label: 'Sum all (state board annual style)',
    build: () => ({ type: 'sum_all' }),
  },
  {
    id: 'cbse_term_weighted',
    label: 'CBSE term weighted (50/50)',
    build: (items) => ({
      type: 'weighted',
      components: items.length >= 2
        ? [
            { id: items[0].id, weight: 50 },
            { id: items[1].id, weight: 50 },
          ]
        : items.map((i) => ({ id: i.id, weight: 100 })),
    }),
  },
  {
    id: 'coaching_best_of_n',
    label: 'Coaching best-of-N',
    build: (items) => ({
      type: 'best_of_n',
      n: Math.min(8, Math.max(1, items.length - 2)),
      ids: items.map((i) => i.id),
    }),
  },
]

function clampWeight(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, v))
}

export function AggregationRuleBuilder({
  value,
  onChange,
  items,
  itemNoun = 'item',
}: AggregationRuleBuilderProps) {
  const [presetOpen, setPresetOpen] = useState(false)

  // Coerce to a safe shape if value is partial — defensive against bad stored JSON.
  const rule: AggregationRule = useMemo(() => {
    if (!value || typeof value !== 'object') return { type: 'sum_all' }
    const t = value.type as AggregationRuleType | undefined
    if (t !== 'weighted' && t !== 'best_of_n' && t !== 'sum_all') return { type: 'sum_all' }
    return value
  }, [value])

  // Drop references to items that no longer exist when `items` changes.
  useEffect(() => {
    const validIds = new Set(items.map((i) => i.id))
    if (rule.type === 'weighted' && rule.components) {
      const cleaned = rule.components.filter((c) => validIds.has(c.id))
      if (cleaned.length !== rule.components.length) {
        onChange({ ...rule, components: cleaned })
      }
    } else if (rule.type === 'best_of_n' && rule.ids) {
      const cleaned = rule.ids.filter((id) => validIds.has(id))
      if (cleaned.length !== rule.ids.length) {
        onChange({ ...rule, ids: cleaned })
      }
    }
  }, [items, rule, onChange])

  const weightTotal =
    rule.type === 'weighted'
      ? (rule.components ?? []).reduce((s, c) => s + c.weight, 0)
      : 0

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label className="text-sm font-medium">Aggregation rule</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            How {itemNoun} scores combine into a single result.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={rule.type}
            onValueChange={(v) => {
              const next = v as AggregationRuleType
              if (next === 'sum_all') onChange({ type: 'sum_all' })
              else if (next === 'weighted') onChange({ type: 'weighted', components: rule.components ?? [] })
              else onChange({ type: 'best_of_n', n: rule.n ?? 1, ids: rule.ids ?? [] })
            }}
          >
            <SelectTrigger className="w-44 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sum_all">Sum all</SelectItem>
              <SelectItem value="weighted">Weighted</SelectItem>
              <SelectItem value="best_of_n">Best of N</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPresetOpen((o) => !o)}
          >
            Presets
          </Button>
        </div>
      </div>

      {presetOpen && (
        <div className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              size="sm"
              className="justify-start text-xs"
              onClick={() => {
                onChange(p.build(items))
                setPresetOpen(false)
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}

      {rule.type === 'sum_all' && (
        <p className="text-xs text-muted-foreground">
          Every {itemNoun}'s marks contribute fully to the total. No weighting.
        </p>
      )}

      {rule.type === 'weighted' && (
        <div className="space-y-2">
          {(rule.components ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add at least one weighted entry below.
            </p>
          )}
          {(rule.components ?? []).map((c, idx) => {
            const item = items.find((i) => i.id === c.id)
            return (
              <div key={`${c.id}-${idx}`} className="flex items-center gap-2">
                <Select
                  value={c.id}
                  onValueChange={(v) => {
                    const next = [...(rule.components ?? [])]
                    next[idx] = { ...next[idx], id: v }
                    onChange({ ...rule, components: next })
                  }}
                >
                  <SelectTrigger className="h-9 flex-1 bg-white dark:bg-input/30">
                    <SelectValue>
                      {item ? item.label : <span className="text-muted-foreground">Pick a {itemNoun}…</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((it) => (
                      <SelectItem key={it.id} value={it.id}>
                        {it.label}{it.hint ? ` — ${it.hint}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex w-32 items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    className="h-9 bg-white dark:bg-input/30"
                    value={c.weight}
                    onChange={(e) => {
                      const next = [...(rule.components ?? [])]
                      next[idx] = { ...next[idx], weight: clampWeight(e.target.value) }
                      onChange({ ...rule, components: next })
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => {
                    const next = (rule.components ?? []).filter((_, i) => i !== idx)
                    onChange({ ...rule, components: next })
                  }}
                  aria-label="Remove entry"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={items.length === 0}
              onClick={() => {
                const remaining = items.find(
                  (it) => !(rule.components ?? []).some((c) => c.id === it.id),
                )
                const next = [...(rule.components ?? []), { id: remaining?.id ?? '', weight: 0 }]
                onChange({ ...rule, components: next })
              }}
            >
              <Plus className="size-3.5" /> Add weighted {itemNoun}
            </Button>
            <span
              className={
                'text-xs font-medium ' +
                (Math.abs(weightTotal - 100) < 0.01
                  ? 'text-emerald-600'
                  : 'text-amber-600')
              }
            >
              Total weight: {weightTotal.toFixed(1)}%
              {Math.abs(weightTotal - 100) >= 0.01 && ' (should be 100)'}
            </span>
          </div>
        </div>
      )}

      {rule.type === 'best_of_n' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Take best</Label>
            <Input
              type="number"
              min={1}
              max={Math.max(1, (rule.ids ?? []).length)}
              className="h-9 w-20 bg-white dark:bg-input/30"
              value={rule.n ?? 1}
              onChange={(e) => {
                const n = Math.max(1, Math.trunc(Number(e.target.value) || 1))
                onChange({ ...rule, n })
              }}
            />
            <Label className="text-xs text-muted-foreground">
              of {(rule.ids ?? []).length} selected {itemNoun}(s)
            </Label>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {items.map((it) => {
              const checked = (rule.ids ?? []).includes(it.id)
              return (
                <label
                  key={it.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border bg-background p-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const set = new Set(rule.ids ?? [])
                      if (e.target.checked) set.add(it.id)
                      else set.delete(it.id)
                      const ids = Array.from(set)
                      onChange({ ...rule, ids, n: Math.min(rule.n ?? 1, ids.length || 1) })
                    }}
                  />
                  <span className="truncate">{it.label}</span>
                  {it.hint && <span className="ml-auto text-xs text-muted-foreground">{it.hint}</span>}
                </label>
              )
            })}
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground">No {itemNoun}s available yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
