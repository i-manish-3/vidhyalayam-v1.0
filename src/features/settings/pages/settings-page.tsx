'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, Loader2, Palette, Save, School, Type } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore, type School as SchoolInfo } from '@/lib/store'
import { DASHBOARD_FONT_OPTIONS, SCHOOL_THEME_PALETTES, findDashboardFont, findSchoolThemePalette } from '@/lib/theme-palettes'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function SettingsPage() {
  const { toast } = useToast()
  const { currentSchool, setCurrentSchool, user } = useAppStore()
  const currentPalette = useMemo(
    () => findSchoolThemePalette(currentSchool?.primaryColor),
    [currentSchool?.primaryColor]
  )
  const [selectedColor, setSelectedColor] = useState(currentPalette.primary)
  const [selectedFont, setSelectedFont] = useState(findDashboardFont(currentSchool?.dashboardFont).id)
  const [saving, setSaving] = useState(false)

  const selectedPalette = useMemo(
    () => findSchoolThemePalette(selectedColor),
    [selectedColor]
  )
  const selectedFontOption = useMemo(
    () => findDashboardFont(selectedFont),
    [selectedFont]
  )
  const hasChanges =
    selectedColor.toLowerCase() !== (currentSchool?.primaryColor || currentPalette.primary).toLowerCase() ||
    selectedFont !== findDashboardFont(currentSchool?.dashboardFont).id

  const saveTheme = async () => {
    setSaving(true)
    try {
      const res = await api.patch<{ school: SchoolInfo }>('/api/school/info', {
        primaryColor: selectedColor,
        dashboardFont: selectedFont,
      })
      setCurrentSchool(res.school)
      toast({ title: 'Theme Updated', description: 'School dashboard theme has been applied.' })
    } catch (err) {
      toast({
        title: "Couldn't Update Theme",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (user?.role !== 'SCHOOL_ADMIN') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Palette className="mb-3 size-10 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold">School settings are available for school admins.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Open a school account to manage its dashboard theme.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage school branding and dashboard appearance.</p>
        </div>
        <Button onClick={saveTheme} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Theme
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Palette className="size-5 text-primary" />
                School Color Palette
              </CardTitle>
              <CardDescription>
                Selected palette and font apply to the logged-in school dashboard, top bar, menu bar, buttons, focus rings, and charts.
              </CardDescription>
            </div>
            <Badge variant="secondary">{selectedPalette.name}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SCHOOL_THEME_PALETTES.map((palette) => {
              const isSelected = selectedColor.toLowerCase() === palette.primary.toLowerCase()
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => setSelectedColor(palette.primary)}
                  className={cn(
                    'rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md',
                    isSelected && 'border-primary ring-2 ring-primary/25'
                  )}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="size-8 rounded-full border shadow-inner" style={{ backgroundColor: palette.primary }} />
                      <span className="font-semibold">{palette.name}</span>
                    </div>
                    {isSelected && (
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" />
                      </span>
                    )}
                  </div>
                  <div className="flex overflow-hidden rounded-md border">
                    {palette.chart.map((color) => (
                      <span key={color} className="h-8 flex-1" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Type className="size-4 text-primary" />
                  Dashboard Font
                </h3>
                <p className="text-xs text-muted-foreground">Choose the font style used across the admin dashboard.</p>
              </div>
              <Badge variant="outline">{selectedFontOption.name}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {DASHBOARD_FONT_OPTIONS.map((font) => {
                const isSelected = selectedFont === font.id
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setSelectedFont(font.id)}
                    className={cn(
                      'rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md',
                      isSelected && 'border-primary ring-2 ring-primary/25'
                    )}
                    style={{ fontFamily: font.stack }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-base font-semibold">{font.name}</span>
                      {isSelected && (
                        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-4" />
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{font.description}</p>
                    <p className="mt-3 text-lg font-bold tracking-tight">Academic Dashboard</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div
              className="rounded-lg border p-4"
              style={{
                '--preview-primary': selectedPalette.primary,
                '--preview-foreground': selectedPalette.foreground,
                '--preview-accent': selectedPalette.sidebarAccent,
                fontFamily: selectedFontOption.stack,
              } as CSSProperties}
            >
              <div className="mb-4 flex items-center justify-between rounded-md px-4 py-3 text-sm font-medium" style={{ backgroundColor: 'var(--preview-primary)', color: 'var(--preview-foreground)' }}>
                <span>{currentSchool?.name || 'School Dashboard'}</span>
                <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>Admin</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {['Students', 'Fees', 'Attendance'].map((label, index) => (
                  <div key={label} className="rounded-md border bg-background p-3">
                    <div className="mb-3 size-8 rounded-md" style={{ backgroundColor: index === 0 ? 'var(--preview-primary)' : 'var(--preview-accent)' }} />
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground">Dashboard module</p>
                  </div>
                ))}
              </div>
            </div>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <School className="size-5" />
                </div>
                <p className="text-sm font-semibold">{currentSchool?.name || 'Current School'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{currentSchool?.subdomain || 'school'} dashboard theme</p>
                <div className="mt-4 flex items-center gap-2 text-xs">
                  <span className="size-4 rounded-full border" style={{ backgroundColor: selectedColor }} />
                  <span className="font-mono">{selectedColor}</span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <Type className="size-4 text-muted-foreground" />
                  <span>{selectedFontOption.name}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
