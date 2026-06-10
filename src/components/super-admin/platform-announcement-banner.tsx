'use client'

import { Info, AlertTriangle, AlertOctagon, X, ExternalLink } from 'lucide-react'
import { usePlatformAnnouncements } from '@/hooks/use-platform-announcements'
import type { AnnouncementSeverity } from '@/lib/platform-announcements-shared'
import { cn } from '@/lib/utils'

const SEVERITY_STYLES: Record<
  AnnouncementSeverity,
  { bar: string; link: string; Icon: React.ElementType }
> = {
  info: {
    bar: 'border-sky-300/60 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100',
    link: 'border-sky-400 hover:bg-sky-100 dark:border-sky-500/40 dark:hover:bg-sky-500/20',
    Icon: Info,
  },
  warning: {
    bar: 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    link: 'border-amber-400 hover:bg-amber-100 dark:border-amber-500/40 dark:hover:bg-amber-500/20',
    Icon: AlertTriangle,
  },
  critical: {
    bar: 'border-red-300/60 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
    link: 'border-red-400 hover:bg-red-100 dark:border-red-500/40 dark:hover:bg-red-500/20',
    Icon: AlertOctagon,
  },
}

/**
 * Platform-wide broadcast banners (set by SUPER_ADMIN). Rendered at the top of
 * the app shell, above the impersonation banner. Stacks multiple active notices,
 * severity-colored, optionally dismissible with an optional CTA link.
 */
export function PlatformAnnouncementBanner() {
  const { banners, dismiss } = usePlatformAnnouncements()

  if (banners.length === 0) return null

  return (
    <div>
      {banners.map((b) => {
        const style = SEVERITY_STYLES[b.severity] ?? SEVERITY_STYLES.info
        const { Icon } = style
        // Defense-in-depth: only ever render http(s) links (the API already
        // rejects other schemes, but never trust a single layer with an href).
        const safeHref = b.linkUrl && /^https?:\/\//i.test(b.linkUrl) ? b.linkUrl : null
        return (
          <div key={b.id} className={cn('border-b px-4 py-2 text-sm', style.bar)}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <strong className="font-semibold">{b.title}.</strong>{' '}
                  <span>{b.message}</span>
                  {safeHref && (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'ml-2 inline-flex items-center gap-1 rounded-md border bg-white/60 px-2 py-0.5 text-xs font-semibold dark:bg-white/10',
                        style.link,
                      )}
                    >
                      {b.linkLabel || 'Learn more'}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                </span>
              </div>
              {b.dismissible && (
                <button
                  type="button"
                  onClick={() => void dismiss(b.id)}
                  aria-label="Dismiss announcement"
                  className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
