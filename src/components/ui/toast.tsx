"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed left-1/2 top-3 z-[100] flex max-h-screen w-full -translate-x-1/2 flex-col gap-2.5 px-3 sm:max-w-[440px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-xl border p-3.5 pr-10 shadow-xl backdrop-blur-sm transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-top-full data-[state=open]:slide-in-from-top-full",
  {
    variants: {
      variant: {
        default:
          "border-primary/25 bg-gradient-to-br from-primary/10 via-background to-sky-500/10 text-foreground shadow-primary/10",
        destructive:
          "border-red-200/90 bg-gradient-to-br from-red-50 via-white to-rose-50 text-red-900 shadow-red-500/10 dark:border-red-500/30 dark:from-red-500/20 dark:via-card dark:to-rose-500/10 dark:text-red-200",
        success:
          "border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-emerald-900 shadow-emerald-500/10 dark:border-emerald-500/30 dark:from-emerald-500/20 dark:via-card dark:to-teal-500/10 dark:text-emerald-200",
        warning:
          "border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-900 shadow-amber-500/10 dark:border-amber-500/30 dark:from-amber-500/20 dark:via-card dark:to-orange-500/10 dark:text-amber-200",
        info:
          "border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-indigo-50 text-sky-900 shadow-sky-500/10 dark:border-sky-500/30 dark:from-sky-500/20 dark:via-card dark:to-indigo-500/10 dark:text-sky-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      data-slot="toast-root"
      className={cn(toastVariants({ variant }), variant, className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-red-200 group-[.destructive]:hover:border-red-300 group-[.destructive]:hover:bg-red-100 group-[.destructive]:dark:border-red-800 group-[.destructive]:dark:hover:bg-red-900/40 group-[.success]:border-emerald-200 group-[.success]:hover:border-emerald-300 group-[.success]:hover:bg-emerald-100 group-[.success]:dark:border-emerald-800 group-[.success]:dark:hover:bg-emerald-900/40 group-[.warning]:border-amber-200 group-[.warning]:hover:border-amber-300 group-[.warning]:hover:bg-amber-100 group-[.warning]:dark:border-amber-800 group-[.warning]:dark:hover:bg-amber-900/40 group-[.info]:border-slate-200 group-[.info]:hover:border-slate-300 group-[.info]:hover:bg-slate-100 group-[.info]:dark:border-slate-700 group-[.info]:dark:hover:bg-slate-700/40",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-full border border-current/10 bg-background/45 p-1 opacity-55 transition-all hover:bg-background/80 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-current/20",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-bold leading-tight tracking-tight", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("mt-1 text-xs leading-relaxed opacity-75", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
