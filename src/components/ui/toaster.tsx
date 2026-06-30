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
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react"

function ToastIcon({ variant }: { variant?: string }) {
  switch (variant) {
    case "success":
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
    case "destructive":
      return <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
    case "warning":
      return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
    case "info":
      return <Info className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />
    default:
      return null
  }
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
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex items-start gap-3">
              <ToastIcon variant={variant} />
              <div className="grid gap-1 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
