import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { isChatbotConfigured, CHATBOT_MODEL } from '@/lib/chatbot/client'
import { isChatbotEnabledForSchool } from '@/lib/chatbot/access'
import { buildChatContext } from '@/lib/chatbot/context'
import { consumeChatQuota } from '@/lib/chatbot/rate-limit'
import { runChatTurn, type PriorTurn } from '@/lib/chatbot/run'

// Long-lived stream + Prisma + ioredis require the Node runtime, never cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Roles allowed to use the chatbot.
const ALLOWED_ROLES = new Set(['SCHOOL_ADMIN', 'STAFF', 'TEACHER', 'PARENT'])
// How many prior turns to feed back as memory.
const HISTORY_TURNS = 10
const MAX_MESSAGE_LEN = 2000

export async function POST(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!user.schoolId || !ALLOWED_ROLES.has(user.role)) {
    return new Response('Forbidden', { status: 403 })
  }
  // Authoritative per-school access gate (super admin controlled, OFF by default).
  if (!(await isChatbotEnabledForSchool(user.schoolId))) {
    return new Response(JSON.stringify({ error: 'The assistant is not enabled for your school.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!isChatbotConfigured()) {
    return new Response(JSON.stringify({ error: 'The assistant is not configured on this server.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await request.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null
  if (!message) {
    return new Response(JSON.stringify({ error: 'Please enter a message.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return new Response(JSON.stringify({ error: 'Message is too long.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Per-user daily quota.
  const quota = await consumeChatQuota(user.userId)
  if (!quota.allowed) {
    return new Response(JSON.stringify({ error: "You've reached today's chat limit. Please try again tomorrow." }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ctx = await buildChatContext(user)

  // Resolve / create the conversation (tenant + owner scoped).
  let conversation = conversationId
    ? await db.chatConversation.findFirst({
        where: { id: conversationId, schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        select: { id: true },
      })
    : null
  if (!conversation) {
    conversation = await db.chatConversation.create({
      data: {
        schoolId: user.schoolId,
        userId: user.userId,
        userRole: user.role,
        title: message.slice(0, 80),
      },
      select: { id: true },
    })
  }
  const convId = conversation.id

  // Load prior turns for short-term memory (oldest first).
  const priorMessages = await db.chatMessage.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  })
  const history: PriorTurn[] = priorMessages
    .reverse()
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))

  // Persist the user message now so it survives even if the stream drops.
  await db.chatMessage.create({
    data: { conversationId: convId, role: 'user', content: message },
  })

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          /* controller already closed */
        }
      }

      send('meta', { conversationId: convId, remaining: quota.remaining })

      let finalText = ''
      let toolNames: string[] = []
      let inputTokens = 0
      let outputTokens = 0
      let errored = false

      try {
        for await (const ev of runChatTurn({ user, ctx, history, userMessage: message })) {
          if (ev.type === 'text') {
            send('delta', { text: ev.text })
          } else if (ev.type === 'tool') {
            send('tool', { name: ev.name })
          } else if (ev.type === 'done') {
            finalText = ev.finalText
            toolNames = ev.toolNames
            inputTokens = ev.inputTokens
            outputTokens = ev.outputTokens
          } else if (ev.type === 'error') {
            errored = true
            send('error', { message: ev.message })
          }
        }
      } catch (err) {
        console.error('[chatbot] stream error:', err)
        errored = true
        send('error', { message: 'The assistant ran into a problem.' })
      }

      // Persist the assistant answer + usage for history and audit.
      if (!errored && finalText) {
        try {
          await db.chatMessage.create({
            data: {
              conversationId: convId,
              role: 'assistant',
              content: finalText,
              toolCalls: toolNames.length > 0 ? JSON.stringify(toolNames) : null,
              inputTokens,
              outputTokens,
              model: CHATBOT_MODEL,
            },
          })
          await db.chatConversation.update({ where: { id: convId }, data: { updatedAt: new Date() } })
        } catch (err) {
          console.error('[chatbot] persist assistant message failed:', err)
        }
      }

      send('done', { ok: !errored })
      closed = true
      try {
        controller.close()
      } catch {
        /* already closed */
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
