import { HomeworkDetailPage } from '@/features/homework/pages/homework-detail-page'

export const metadata = {
  title: 'Homework Submissions & Grading | Vidhyalayam ERP',
}

export default async function HomeworkDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <HomeworkDetailPage homeworkId={id} />
}
