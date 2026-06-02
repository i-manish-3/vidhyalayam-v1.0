'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IdCard, LayoutTemplate, Printer, Plus, ArrowRight } from 'lucide-react'

interface TemplateSummary {
  id: string
  name: string
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
  hasBackSide: boolean
  isDefault: boolean
  isActive: boolean
  updatedAt: string
}

export function IdCardDashboardPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ templates: TemplateSummary[] }>('/api/school/id-cards/templates')
      .then((res) => setTemplates(res.templates))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />

  const activeCount = templates.filter((t) => t.isActive).length
  const defaultTpl = templates.find((t) => t.isDefault) || null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student ID Cards"
        description="Design templates, pick students, and generate ID cards in bulk."
        action={{
          label: 'Generate Cards',
          icon: Printer,
          onClick: () => router.push('/id-cards/generate'),
        }}
        secondaryAction={{
          label: 'New Template',
          icon: Plus,
          onClick: () => router.push('/id-cards/templates/new'),
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Active templates" value={activeCount} icon={LayoutTemplate} />
        <StatCard label="Total templates" value={templates.length} icon={IdCard} />
        <StatCard
          label="Default template"
          value={defaultTpl?.name || '—'}
          icon={IdCard}
          small={!defaultTpl}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="cursor-pointer transition hover:border-primary/40 hover:shadow-md" onClick={() => router.push('/id-cards/templates')}>
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <h3 className="text-base font-semibold">Manage templates</h3>
              <p className="mt-1 text-sm text-muted-foreground">Create, edit, or duplicate ID card designs.</p>
            </div>
            <Button variant="ghost" size="icon" className="size-9">
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition hover:border-primary/40 hover:shadow-md" onClick={() => router.push('/id-cards/generate')}>
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <h3 className="text-base font-semibold">Generate ID cards</h3>
              <p className="mt-1 text-sm text-muted-foreground">Pick students, preview, then print or download.</p>
            </div>
            <Button variant="ghost" size="icon" className="size-9">
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {templates.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Recent templates</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.slice(0, 6).map((t) => (
              <Card
                key={t.id}
                className="cursor-pointer transition hover:border-primary/40"
                onClick={() => router.push(`/id-cards/templates/${t.id}`)}
              >
                <CardContent className="space-y-1.5 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="truncate text-sm font-medium">{t.name}</h4>
                    {t.isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  </div>
                  <p className="text-muted-foreground">
                    {t.widthMm}×{t.heightMm} mm · {t.orientation}
                    {t.hasBackSide ? ' · Front + Back' : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label, value, icon: Icon, small,
}: { label: string; value: string | number; icon: React.ElementType; small?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={small ? 'truncate text-sm font-medium' : 'truncate text-xl font-semibold'}>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
