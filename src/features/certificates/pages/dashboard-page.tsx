'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, TintedStatCard, LoadingState, GradientEmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Award,
  FileText,
  Plus,
  ScrollText,
  Clock3,
  ShieldAlert,
  ChevronRight,
  UserRoundCheck,
  Settings2,
  History,
} from 'lucide-react'
import { CERTIFICATE_TYPES, certificateTypeDef } from '../lib/certificate-types'
import { certificateStatusMeta } from '../lib/certificate-ui'

interface TemplateSummary {
  id: string
  type: string
  name: string
  isDefault: boolean
  isActive: boolean
}

interface CertificateRow {
  id: string
  certificateNumber: string
  type: string
  issueDate: string
  isTemporary: boolean
  status: string
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNumber: string | null
    class: { name: string } | null
    section: { name: string } | null
  } | null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function CertificatesDashboardPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [records, setRecords] = useState<CertificateRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<{ templates: TemplateSummary[] }>('/api/school/certificates/templates').catch(() => ({ templates: [] })),
      api.get<{ records: CertificateRow[] }>('/api/school/certificates?pageSize=8').catch(() => ({ records: [] })),
    ])
      .then(([tplRes, recRes]) => {
        setTemplates(tplRes.templates)
        setRecords(recRes.records)
      })
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const temporary = records.filter((r) => r.isTemporary).length
    const voided = records.filter((r) => r.status === 'void').length
    return { temporary, voided }
  }, [records])

  const activeTemplates = templates.filter((t) => t.isActive).length

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <GradientHero
        icon={Award}
        title="Certificates"
        badge={`${templates.length} template${templates.length === 1 ? '' : 's'}`}
        description="Issue TCs, bonafide, character, study & other certificates. Issuing never changes the student's enrollment."
        primaryAction={{
          label: 'Issue Certificate',
          icon: Plus,
          onClick: () => router.push('/certificates/issue'),
        }}
        secondaryAction={{
          label: 'New Template',
          icon: FileText,
          onClick: () => router.push('/certificates/templates/new'),
        }}
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <TintedStatCard tone="sky" icon={FileText} label="Active templates" value={activeTemplates} note={`${templates.length} total`} />
        <TintedStatCard tone="violet" icon={ScrollText} label="Certificate types" value={CERTIFICATE_TYPES.length} note="TC, bonafide, character & more" />
        <TintedStatCard tone="amber" icon={Clock3} label="Temporary issued" value={stats.temporary} note="In recent records" />
        <TintedStatCard tone="emerald" icon={ShieldAlert} label="Voided" value={stats.voided} note="Kept for audit" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          className="group cursor-pointer gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10"
          onClick={() => router.push('/certificates/issue')}
        >
          <div className="flex items-center gap-3 border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-cyan-500/[0.08] p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md">
              <UserRoundCheck className="size-5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold leading-tight">Issue a certificate</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Temporary TC, bonafide, character & more — no side-effects on the student record.
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Card>

        <Card
          className="group cursor-pointer gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10"
          onClick={() => router.push('/certificates/templates')}
        >
          <div className="flex items-center gap-3 border-b border-current/10 bg-gradient-to-r from-violet-500/[0.08] via-white/40 to-purple-500/[0.08] p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md">
              <Settings2 className="size-5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold leading-tight">Manage templates</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Create or edit certificate designs with live {'{{placeholders}}'} for student &amp; school data.
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <div className="flex items-center justify-between border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-white">
              <History className="size-3 text-white" />
            </span>
            Recent certificates
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => router.push('/certificates/records')}>
            View all <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <CardContent className="p-3">
          {records.length === 0 ? (
            <GradientEmptyState
              icon={Award}
              title="No certificates issued yet"
              description="Issue a temporary TC, bonafide or any other certificate to see it here."
              actionLabel="Issue certificate"
              onAction={() => router.push('/certificates/issue')}
            />
          ) : (
            <ul className="space-y-2">
              {records.map((r) => {
                const status = certificateStatusMeta(r.status)
                return (
                  <li
                    key={r.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-sky-100/80 bg-white/70 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-sky-500/20 dark:bg-card/60"
                    onClick={() => router.push(`/print/certificates/${r.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {r.student ? [r.student.firstName, r.student.lastName].filter(Boolean).join(' ') : 'Unknown student'}
                        </span>
                        <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">{certificateTypeDef(r.type).label}</Badge>
                        {r.isTemporary && (
                          <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">Temporary</Badge>
                        )}
                        <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">{r.certificateNumber}</span> · {formatDate(r.issueDate)}
                        {r.student?.class ? ` · ${r.student.class.name}${r.student.section ? `-${r.student.section.name}` : ''}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}