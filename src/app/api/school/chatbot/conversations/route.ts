import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { isChatbotEnabledForSchool } from '@/lib/chatbot/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/school/chatbot/conversations?id=<id>
//  - without id: list the caller's recent conversations
//  - with id: return that conversation's messages (owner + tenant scoped)
export async function GET(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user || !user.schoolId) return new Response('Unauthorized', { status: 401 })
  if (!(await isChatbotEnabledForSchool(user.schoolId))) {
    return new Response('Forbidden', { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')

  if (id) {
    const conversation = await db.chatConversation.findFirst({
      where: { id, schoolId: user.schoolId, userId: user.userId, deletedAt: null },
      select: {
        id: true,
        title: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, toolCalls: true, createdAt: true },
        },
      },
    })
    if (!conversation) return new Response('Not found', { status: 404 })
    return NextResponse.json({ conversation })
  }

  const conversations = await db.chatConversation.findMany({
    where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, title: true, updatedAt: true },
  })
  return NextResponse.json({ conversations })
}
