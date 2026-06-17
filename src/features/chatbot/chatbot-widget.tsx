'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Send, X, Loader2, Sparkles } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  tool?: string | null
}

const ALLOWED_ROLES = new Set(['SCHOOL_ADMIN', 'STAFF', 'TEACHER', 'PARENT'])

const SUGGESTIONS_BY_ROLE: Record<string, string[]> = {
  PARENT: ["What are my child's pending fees?", 'How do I pay fees online?'],
  TEACHER: ['How do I mark attendance?', 'How do I add a hostel room?'],
  SCHOOL_ADMIN: ['What is the total outstanding fee?', 'How do I collect a partial fee?'],
  STAFF: ['How do I sell a store item on due?', 'Which students owe fees?'],
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function ChatbotWidget() {
  const user = useAppStore((s) => s.user)
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const currentSchool = useAppStore((s) => s.currentSchool)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [streaming, setStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const role = user?.role || ''
  // The school must have been granted access by the super admin (chatbotEnabled).
  // The server enforces this too; hiding the widget is a convenience.
  const enabled = isAuthenticated && ALLOWED_ROLES.has(role) && currentSchool?.chatbotEnabled === true

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open])

  if (!enabled) return null

  const suggestions = SUGGESTIONS_BY_ROLE[role] || SUGGESTIONS_BY_ROLE.SCHOOL_ADMIN

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    setInput('')
    const userMsg: ChatMsg = { id: uid(), role: 'user', content: trimmed }
    const assistantId = uid()
    setMessages((m) => [...m, userMsg, { id: assistantId, role: 'assistant', content: '', tool: null }])
    setStreaming(true)

    const patchAssistant = (fn: (prev: ChatMsg) => ChatMsg) =>
      setMessages((m) => m.map((msg) => (msg.id === assistantId ? fn(msg) : msg)))

    try {
      const res = await fetch('/api/school/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: trimmed, conversationId }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Something went wrong.' }))
        patchAssistant((p) => ({ ...p, content: err.error || 'Something went wrong.', tool: null }))
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // Parse the SSE stream (event:/data: blocks separated by a blank line).
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''
        for (const block of blocks) {
          const eventLine = block.split('\n').find((l) => l.startsWith('event:'))
          const dataLine = block.split('\n').find((l) => l.startsWith('data:'))
          if (!eventLine || !dataLine) continue
          const event = eventLine.slice(6).trim()
          let data: Record<string, unknown> = {}
          try {
            data = JSON.parse(dataLine.slice(5).trim())
          } catch {
            continue
          }
          if (event === 'meta' && typeof data.conversationId === 'string') {
            setConversationId(data.conversationId)
          } else if (event === 'delta' && typeof data.text === 'string') {
            patchAssistant((p) => ({ ...p, content: p.content + data.text, tool: null }))
          } else if (event === 'tool' && typeof data.name === 'string') {
            patchAssistant((p) => ({ ...p, tool: String(data.name) }))
          } else if (event === 'error' && typeof data.message === 'string') {
            patchAssistant((p) => ({ ...p, content: p.content || String(data.message), tool: null }))
          }
        }
      }
    } catch {
      patchAssistant((p) => ({ ...p, content: p.content || 'Connection failed. Please try again.', tool: null }))
    } finally {
      setStreaming(false)
    }
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="bg-brand fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
        >
          <Bot className="size-6" />
          <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center">
            <Sparkles className="size-3.5 text-amber-300" />
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[560px] max-h-[calc(100svh-2.5rem)] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <div className="bg-brand flex shrink-0 items-center justify-between px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/20">
                <Bot className="size-4" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">School Assistant</p>
                <p className="text-[11px] text-white/70">Ask about fees, attendance, how-to…</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 hover:bg-white/15">
              <X className="size-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Hi! I can answer questions about your school data and how to use the app. Try:</p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-lg border bg-muted/40 px-3 py-2 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted rounded-bl-sm'
                  }`}
                >
                  {m.content || (m.role === 'assistant' && (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      {m.tool ? 'Looking that up…' : 'Thinking…'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex shrink-0 items-end gap-2 border-t p-3"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder="Ask anything…"
              rows={1}
              className="max-h-28 min-h-[40px] resize-none"
              disabled={streaming}
            />
            <Button type="submit" size="icon" disabled={streaming || !input.trim()} className="size-10 shrink-0">
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
