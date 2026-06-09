'use client'

import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useAppStore, type LiveNotification } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'

/**
 * Subscribes the current session to the real-time notification stream (SSE).
 *
 * - Seeds the store with the current unread count + latest notifications.
 * - Opens an EventSource to /api/school/notifications/stream (cookie-authed,
 *   same-origin). The browser auto-reconnects on transient drops.
 * - High/urgent notifications also raise a toast.
 *
 * The existing 30s polling in app-shell remains as a fallback, so if SSE is
 * unavailable the unread badge still updates.
 */
export function useNotificationStream() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const userId = useAppStore((s) => s.user?.id)
  const setUnreadCount = useAppStore((s) => s.setUnreadCount)
  const setLatestNotifications = useAppStore((s) => s.setLatestNotifications)
  const prependNotification = useAppStore((s) => s.prependNotification)
  const { toast } = useToast()
  const sourceRef = useRef<EventSource | null>(null)

  // Seed initial state.
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<{ notifications: LiveNotification[]; unreadCount: number }>(
          '/api/school/notifications',
          { limit: '20' },
        )
        if (cancelled) return
        setUnreadCount(res.unreadCount || 0)
        setLatestNotifications(res.notifications || [])
      } catch {
        /* polling fallback in app-shell will catch up */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, setUnreadCount, setLatestNotifications])

  // Open the SSE stream.
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined' || typeof EventSource === 'undefined') return

    const source = new EventSource('/api/school/notifications/stream', { withCredentials: true })
    sourceRef.current = source

    const onNew = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as LiveNotification & { broadcast?: boolean }
        prependNotification({
          id: data.id,
          title: data.title,
          message: data.message,
          type: data.type ?? 'info',
          priority: data.priority,
          actionUrl: data.actionUrl ?? null,
          createdAt: data.createdAt ?? new Date().toISOString(),
        })
        if (data.priority === 'high' || data.priority === 'urgent') {
          toast({ title: data.title, description: data.message })
        }
      } catch {
        /* ignore malformed event */
      }
    }

    const onUnreadCount = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { unreadCount: number }
        if (typeof data.unreadCount === 'number') setUnreadCount(data.unreadCount)
      } catch {
        /* ignore */
      }
    }

    source.addEventListener('notification:new', onNew as EventListener)
    source.addEventListener('announcement:new', onNew as EventListener)
    source.addEventListener('notification:unread_count', onUnreadCount as EventListener)

    return () => {
      source.removeEventListener('notification:new', onNew as EventListener)
      source.removeEventListener('announcement:new', onNew as EventListener)
      source.removeEventListener('notification:unread_count', onUnreadCount as EventListener)
      source.close()
      sourceRef.current = null
    }
    // Re-open if the user identity changes (login/logout/impersonation).
  }, [isAuthenticated, userId, prependNotification, setUnreadCount, toast])
}
