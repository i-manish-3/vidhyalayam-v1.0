'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sparkles, Check, Loader2, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  IdCardHtmlRenderer,
  DEMO_HTML_CARD,
  type HtmlRenderTemplate,
} from './id-card-html-renderer'
import type { IdCardPreset } from '@/features/id-cards/presets'

interface PresetGalleryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (preset: IdCardPreset) => void
  busy?: boolean
}

const CATEGORY_LABELS: Record<IdCardPreset['category'], string> = {
  modern: 'Modern',
  classic: 'Classic',
  vibrant: 'Vibrant',
  corporate: 'Corporate',
  compact: 'Compact',
}

const CATEGORY_GRADIENT: Record<IdCardPreset['category'], string> = {
  modern: 'from-violet-500 to-fuchsia-500',
  classic: 'from-amber-600 to-orange-600',
  vibrant: 'from-pink-500 to-orange-500',
  corporate: 'from-slate-700 to-slate-900',
  compact: 'from-emerald-500 to-teal-600',
}

function presetToTemplate(preset: IdCardPreset): HtmlRenderTemplate {
  return {
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    frontHtml: preset.frontHtml,
    frontCss: preset.frontCss,
    backHtml: preset.backHtml,
    backCss: preset.backCss,
    hasBackSide: preset.hasBackSide,
  }
}

function thumbScale(widthMm: number, heightMm: number): number {
  const longest = Math.max(widthMm, heightMm)
  return Math.min(0.55, 130 / (longest * 3.78))
}

export function PresetGalleryDialog({ open, onOpenChange, onApply, busy }: PresetGalleryDialogProps) {
  const [presets, setPresets] = useState<IdCardPreset[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || presets.length) return
    setLoading(true)
    api
      .get<{ presets: IdCardPreset[] }>('/api/school/id-cards/presets')
      .then((res) => {
        setPresets(res.presets)
        if (res.presets[0]) setSelectedId(res.presets[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, presets.length])

  const selected = useMemo(
    () => presets.find((p) => p.id === selectedId) || null,
    [presets, selectedId],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl gap-0 p-0">
        <DialogHeader className="space-y-1 border-b bg-gradient-to-br from-violet-50 via-fuchsia-50 to-amber-50 px-6 py-5 dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-amber-950/20">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
              <Sparkles className="size-3.5" />
            </span>
            Pick a starter template
          </DialogTitle>
          <DialogDescription>
            Hand-designed templates ready to print. Pick one, then customise the HTML/CSS afterwards.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-[500px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading designs…
          </div>
        ) : (
          <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
            {/* LEFT — preset grid (visual) */}
            <div className="border-r bg-muted/20 p-4">
              <ScrollArea className="h-[540px] pr-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  {presets.map((p) => {
                    const isSelected = selectedId === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          'group relative flex flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition',
                          isSelected
                            ? 'border-primary shadow-md shadow-primary/10'
                            : 'border-transparent hover:border-primary/30',
                        )}
                      >
                        <div
                          className="relative flex h-44 items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900"
                          style={{
                            backgroundImage:
                              'radial-gradient(circle at 30% 30%, rgba(99,102,241,0.08), transparent 50%), radial-gradient(circle at 70% 70%, rgba(236,72,153,0.08), transparent 50%)',
                          }}
                        >
                          <div className="pointer-events-none">
                            <IdCardHtmlRenderer
                              template={presetToTemplate(p)}
                              card={DEMO_HTML_CARD}
                              schoolLogo={null}
                              scale={thumbScale(p.widthMm, p.heightMm)}
                              side="front"
                            />
                          </div>
                          {isSelected && (
                            <div className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                              <Check className="size-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5 border-t p-3">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold leading-tight">{p.name}</h3>
                            <Badge
                              className={cn(
                                'h-4 shrink-0 border-0 bg-gradient-to-r px-1.5 py-0 text-[9px] uppercase tracking-wide text-white',
                                CATEGORY_GRADIENT[p.category],
                              )}
                            >
                              {CATEGORY_LABELS[p.category]}
                            </Badge>
                          </div>
                          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                            {p.description}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="font-mono">
                              {p.widthMm}×{p.heightMm}mm
                            </span>
                            <span>·</span>
                            <span className="capitalize">{p.orientation}</span>
                            {p.hasBackSide && (
                              <>
                                <span>·</span>
                                <span>Front + Back</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* RIGHT — large preview + apply button */}
            <div className="flex flex-col bg-card">
              {selected ? (
                <>
                  <div
                    className="flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 50% 0%, rgba(99,102,241,0.06), transparent 70%)',
                    }}
                  >
                    <div className="pointer-events-none">
                      <IdCardHtmlRenderer
                        template={presetToTemplate(selected)}
                        card={DEMO_HTML_CARD}
                        schoolLogo={null}
                        scale={selected.orientation === 'portrait' ? 1.5 : 1.8}
                        side="front"
                      />
                    </div>
                    {selected.hasBackSide && (
                      <>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          back side
                        </div>
                        <div className="pointer-events-none">
                          <IdCardHtmlRenderer
                            template={presetToTemplate(selected)}
                            card={DEMO_HTML_CARD}
                            schoolLogo={null}
                            scale={selected.orientation === 'portrait' ? 1.3 : 1.5}
                            side="back"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-3 border-t bg-card p-5">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-semibold">{selected.name}</h3>
                        <Badge
                          className={cn(
                            'h-5 border-0 bg-gradient-to-r text-[10px] uppercase tracking-wide text-white',
                            CATEGORY_GRADIENT[selected.category],
                          )}
                        >
                          {CATEGORY_LABELS[selected.category]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{selected.description}</p>
                    </div>
                    <Button
                      onClick={() => onApply(selected)}
                      disabled={busy}
                      className="group w-full gap-2"
                      size="lg"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Creating template…
                        </>
                      ) : (
                        <>
                          Use this template
                          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Select a template to preview it.
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
