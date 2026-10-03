import { Suspense } from 'react'
import { ParentHomeworkPage } from '@/features/homework/pages/parent-homework-page'
import { Loader2 } from 'lucide-react'

export const metadata = {
  title: 'Daily Homework Diary | Vidhyalayam ERP',
}

export default function ParentHomeworkRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <ParentHomeworkPage />
    </Suspense>
  )
}
