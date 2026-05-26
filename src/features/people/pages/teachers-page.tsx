'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, DataTable, type Column, type ActionItem } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { UserPlus } from 'lucide-react'

interface Teacher {
  id: string; firstName: string; lastName: string; employeeId: string; gender: string; qualification: string; specialization: string; experience: number; isActive: boolean
}

export function TeachersPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTeachers = useCallback(async () => {
    try {
      const data = await api.get<{ teachers: Teacher[] }>('/api/school/teachers')
      setTeachers(data.teachers || [])
    } catch { toast({ title: "Couldn't Load Teachers", description: "We couldn't load the teachers list. Please refresh the page.", variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchTeachers() }, [fetchTeachers])

  const columns: Column<Teacher>[] = [
    { key: 'employeeId', label: 'Emp ID', className: 'w-[80px]' },
    { key: 'name', label: 'Name', render: (t: Teacher) => `${t.firstName} ${t.lastName}` },
    { key: 'specialization', label: 'Subject', render: (t: Teacher) => <Badge variant="secondary">{t.specialization || '-'}</Badge> },
    { key: 'qualification', label: 'Qualification', render: (t: Teacher) => t.qualification || '-' },
    { key: 'experience', label: 'Exp (Yrs)', className: 'w-[90px]', render: (t: Teacher) => t.experience || 0 },
    { key: 'status', label: 'Status', render: (t: Teacher) => <Badge variant={t.isActive ? 'default' : 'destructive'}>{t.isActive ? 'Active' : 'Inactive'}</Badge> },
  ]

  const actions = (_t: Teacher): ActionItem[] => [{ label: 'View Details', onClick: () => {} }]

  return (
    <div className="space-y-6">
      <PageHeader title="Teachers" description={`${teachers.length} teachers`} action={{ label: 'Add Teacher', icon: UserPlus, onClick: () => router.push('/teachers/new') }} />
      <DataTable columns={columns} data={teachers} searchKey="firstName" searchPlaceholder="Search teachers..." actions={actions} isLoading={loading} />
    </div>
  )
}
