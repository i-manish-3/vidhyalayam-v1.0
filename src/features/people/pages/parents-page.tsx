'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Users } from 'lucide-react'

interface Child {
  id: string
  firstName: string
  lastName: string
  class?: { name: string }
  section?: { name: string }
}

interface Parent {
  id: string
  fatherName: string
  motherName: string
  phone: string
  email: string
  occupation?: string
  children?: Child[]
}

export function ParentsPage() {
  const { toast } = useToast()
  const [parents, setParents] = useState<Parent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null)
  const [showChildren, setShowChildren] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ parents: Parent[] }>('/api/school/parents')
      setParents(res.parents || [])
    } catch {
      toast({ title: 'Couldn\'t Load Parents', description: 'We couldn\'t load the parents. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const columns: Column<Parent>[] = [
    { key: 'fatherName', label: 'Father Name', render: (p: Parent) => <span className="font-medium">{p.fatherName || '-'}</span> },
    { key: 'motherName', label: 'Mother Name', render: (p: Parent) => p.motherName || '-' },
    { key: 'phone', label: 'Phone', render: (p: Parent) => <span className="font-mono text-sm">{p.phone || '-'}</span> },
    { key: 'email', label: 'Email', render: (p: Parent) => <span className="text-sm">{p.email || '-'}</span> },
    { key: 'occupation', label: 'Occupation', render: (p: Parent) => p.occupation || '-' },
  ]

  const actions = (p: Parent): ActionItem[] => [
    { label: 'View Children', onClick: () => { setSelectedParent(p); setShowChildren(true) } },
  ]

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Parents" description={`${parents.length} parents`} />

      {parents.length === 0 ? (
        <EmptyState icon={Users} title="No Parents" description="Parent records will appear when students are enrolled." />
      ) : (
        <DataTable columns={columns} data={parents} searchKey="fatherName" searchPlaceholder="Search parents..." actions={actions} />
      )}

      <Dialog open={showChildren} onOpenChange={setShowChildren}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Children of {selectedParent?.fatherName || 'Parent'}</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-64">
            {selectedParent?.children && selectedParent.children.length > 0 ? (
              <div className="space-y-3 py-4">
                {selectedParent.children.map(child => (
                  <div key={child.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{child.firstName} {child.lastName}</p>
                      <p className="text-xs text-muted-foreground">
                        {child.class?.name || '-'} {child.section ? `• Section: ${child.section.name}` : ''}
                      </p>
                    </div>
                    <Badge variant="secondary">Student</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No children linked</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
