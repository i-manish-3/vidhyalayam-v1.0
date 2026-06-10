'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore, type LiveNotification } from '@/lib/store'
import { useNotificationStream } from '@/hooks/use-notification-stream'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  normal: 'bg-primary',
  low: 'bg-muted-foreground',
}

/**
 * Bell + live unread badge + quick-peek dropdown. Self-contained: it opens the
 * SSE stream (via useNotificationStream), keeps a 30s polling fallback for the
 * unread count, and lets the user mark items read or jump to the full inbox.
 */
export function NotificationBell() {
  const router = useRouter()
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const userId = useAppStore((s) => s.user?.id)
  const unreadCount = useAppStore((s) => s.unreadCount)
  const latest = useAppStore((s) => s.latestNotifications)
  const setUnreadCount = useAppStore((s) => s.setUnreadCount)
  const setLatestNotifications = useAppStore((s) => s.setLatestNotifications)
  const [open, setOpen] = useState(false)

  // Open SSE + seed store.
  useNotificationStream()

  // Polling fallback for the unread count (covers SSE being unavailable).
  useEffect(() => {
    if (!isAuthenticated || !userId) return
    const poll = async () => {
      try {
        const data = await api.get<{ unreadCount?: number }>('/api/school/notifications', { limit: '1' })
        setUnreadCount(data.unreadCount || 0)
      } catch {
        /* ignore */
      }
    }
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, userId, setUnreadCount])

  const markRead = useCallback(
    async (n: LiveNotification) => {
      try {
        await api.patch('/api/school/notifications', { notificationId: n.id })
        setLatestNotifications(latest.filter((x) => x.id !== n.id))
        setUnreadCount(Math.max(0, unreadCount - 1))
      } catch {
        /* ignore */
      }
      if (n.actionUrl) {
        setOpen(false)
        router.push(n.actionUrl)
      }
    },
    [latest, unreadCount, setLatestNotifications, setUnreadCount, router],
  )

  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/api/school/notifications', { markAllRead: true })
      setLatestNotifications([])
      setUnreadCount(0)
    } catch {
      /* ignore */
    }
  }, [setLatestNotifications, setUnreadCount])

  const top = latest.slice(0, 5)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          className="size-9 relative text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground"
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[22rem] overflow-hidden rounded-xl border-border/60 p-0 shadow-xl shadow-black/10"
      >
        <div className="bg-brand-soft flex items-center justify-between gap-2 px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 shadow-inner ring-1 ring-white/20">
              <Bell className="size-4" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Notifications</span>
              <span className="text-[11px] text-white/75">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </span>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-md px-2 text-[11px] font-medium text-white hover:bg-white/20 hover:text-white"
              onClick={markAllRead}
            >
              <BellOff className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>

        {top.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/60">
              <Bell className="size-6" />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground">New notifications will show up here.</p>
            </div>
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto overscroll-contain">
            <ul className="divide-y divide-border/50">
              {top.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n)}
                    className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-offset-0',
                        PRIORITY_DOT[n.priority || 'normal'],
                        'ring-[color-mix(in_oklab,currentColor_18%,transparent)]',
                      )}
                    />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate text-sm font-semibold leading-snug">{n.title}</span>
                      <span className="block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {n.message}
                      </span>
                      <span className="block text-[11px] font-medium text-muted-foreground/60">
                        {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                      </span>
                    </span>
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                      <Check className="size-3.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-border/60 bg-muted/30 p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => {
              setOpen(false)
              router.push('/notifications')
            }}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
