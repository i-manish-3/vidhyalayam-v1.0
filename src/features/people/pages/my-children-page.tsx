'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Baby, Receipt, CalendarCheck, ShieldOff, AlertTriangle } from 'lucide-react'

interface ChildInfo {
  id: string
  admissionNumber: string | null
  firstName: string
  lastName: string
  fullName: string
  rollNumber: string | null
  gender: string | null
  profileImage: string | null
  admissionStatus: string | null
  isActive: boolean
  className: string | null
  sectionName: string | null
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

export function MyChildrenPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchChildren = useCallback(async () => {
    try {
      const data = await api.get<{ children: ChildInfo[] }>('/api/parent/children')
      setChildren(data?.children || [])
    } catch {
      toast({
        title: "Couldn't load your children",
        description: 'Please refresh the page. If this continues, contact the school.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchChildren()
  }, [fetchChildren])

  if (loading) return <LoadingState />

  const active = children.filter((c) => c.isActive)
  const disabled = children.filter((c) => !c.isActive)

  return (
    <div className="space-y-6">
      <PageHeader title="My Children" description={`${children.length} linked to your account`} />

      {children.length === 0 ? (
        <EmptyState
          icon={Baby}
          title="No children linked"
          description="No students are linked to your account yet. Please contact the school administration."
        />
      ) : (
        <div className="space-y-4">
          {active.map((child) => (
            <Card key={child.id}>
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {child.profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={child.profileImage} alt={child.fullName} className="size-full object-cover" />
                  ) : (
                    initials(child.fullName)
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{child.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {child.className || 'Class -'}
                    {child.sectionName ? ` - ${child.sectionName}` : ''}
                    {child.rollNumber ? ` • Roll: ${child.rollNumber}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {child.admissionNumber && (
                      <Badge variant="outline" className="font-mono text-[10px]">{child.admissionNumber}</Badge>
                    )}
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10 text-[10px]">
                      {child.admissionStatus || 'Admitted'}
                    </Badge>
                    {child.gender && <span className="text-xs text-muted-foreground">{child.gender}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" onClick={() => router.push(`/my-children/fees?studentId=${child.id}`)}>
                    <Receipt className="mr-1.5 size-4" /> Fee Details
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/my-children/attendance?studentId=${child.id}`)}
                  >
                    <CalendarCheck className="mr-1.5 size-4" /> Attendance
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {disabled.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center gap-2">
                <ShieldOff className="size-4 text-destructive" />
                <p className="text-sm font-medium text-destructive">Disabled Students</p>
                <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">
                  {disabled.length}
                </Badge>
              </div>
              {disabled.map((child) => (
                <Card key={child.id} className="border-destructive/30 bg-destructive/5 opacity-80">
                  <CardContent className="flex items-center gap-4 py-5">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-lg font-bold text-destructive">
                      {initials(child.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-destructive line-through decoration-destructive/50">
                        {child.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {child.className || 'Class -'}
                        {child.sectionName ? ` - ${child.sectionName}` : ''}
                      </p>
                    </div>
                    <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10 gap-1 text-[10px]">
                      <ShieldOff className="size-3" /> Disabled
                    </Badge>
                  </CardContent>
                </Card>
              ))}
              <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  These students have been disabled by the school. Their fees and attendance are unavailable. Please
                  contact the school administration.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
