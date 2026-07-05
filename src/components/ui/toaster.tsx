"use client"

import { useSyncExternalStore } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, AlertCircle, AlertTriangle, Bell, Info } from "lucide-react"
import { cn } from "@/lib/utils"

function ToastIcon({ variant }: { variant?: string }) {
  const iconClassName = "size-4 text-white"

  switch (variant) {
    case "success":
      return <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20"><CheckCircle2 className={iconClassName} /></span>
    case "destructive":
      return <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-md shadow-red-500/20"><AlertCircle className={iconClassName} /></span>
    case "warning":
      return <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20"><AlertTriangle className={iconClassName} /></span>
    case "info":
      return <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20"><Info className={iconClassName} /></span>
    default:
      return <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-white shadow-md shadow-primary/20"><Bell className={iconClassName} /></span>
  }
}

function ToastProgress({ variant }: { variant?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "toast-progress absolute inset-x-0 bottom-0 h-1 origin-left",
        variant === "success" && "bg-gradient-to-r from-emerald-500 to-teal-500",
        variant === "destructive" && "bg-gradient-to-r from-red-500 to-rose-500",
        variant === "warning" && "bg-gradient-to-r from-amber-500 to-orange-500",
        variant === "info" && "bg-gradient-to-r from-sky-500 to-indigo-500",
        (!variant || variant === "default") && "bg-gradient-to-r from-primary to-sky-500",
      )}
    />
  )
}

export function Toaster() {
  const { toasts } = useToast()
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )

  if (!mounted) return null

  return (
    <ToastProvider duration={4500} swipeDirection="up">
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <ToastIcon variant={variant} />
              <div className="min-w-0 flex-1 pt-0.5">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
            <ToastProgress variant={variant} />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
