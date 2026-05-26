'use client'

import { useParams } from 'next/navigation'
import { AddTeacherPage } from '@/features/people/pages/add-teacher-page'

export default function EditTeacherRoute() {
  const params = useParams<{ id: string }>()
  return <AddTeacherPage teacherId={params.id} />
}
