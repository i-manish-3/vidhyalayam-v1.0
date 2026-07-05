"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      closeButton
      duration={4000}
      visibleToasts={3}
      gap={12}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-primary/20 !bg-gradient-to-br !from-primary/10 !via-background !to-sky-500/10 !px-4 !py-3.5 !shadow-xl !shadow-primary/10 !backdrop-blur-sm",
          success: "!border-emerald-200/90 !from-emerald-50 !via-white !to-teal-50 dark:!border-emerald-500/30 dark:!from-emerald-500/20 dark:!via-card dark:!to-teal-500/10",
          error: "!border-red-200/90 !from-red-50 !via-white !to-rose-50 dark:!border-red-500/30 dark:!from-red-500/20 dark:!via-card dark:!to-rose-500/10",
          warning: "!border-amber-200/90 !from-amber-50 !via-white !to-orange-50 dark:!border-amber-500/30 dark:!from-amber-500/20 dark:!via-card dark:!to-orange-500/10",
          info: "!border-sky-200/90 !from-sky-50 !via-white !to-indigo-50 dark:!border-sky-500/30 dark:!from-sky-500/20 dark:!via-card dark:!to-indigo-500/10",
          title: "!text-sm !font-bold !tracking-tight",
          description: "!mt-1 !text-xs !leading-relaxed !text-muted-foreground",
          closeButton: "!border-border/60 !bg-background/80 !text-foreground !shadow-sm hover:!bg-background",
          actionButton: "!rounded-lg !bg-primary !text-primary-foreground",
          cancelButton: "!rounded-lg !bg-muted !text-muted-foreground",
        },
      }}
      icons={{
        success: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
            <circle cx="9" cy="9" r="9" className="fill-emerald-500 dark:fill-emerald-400" />
            <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        error: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
            <circle cx="9" cy="9" r="9" className="fill-red-500 dark:fill-red-400" />
            <path d="M6.5 6.5L11.5 11.5M11.5 6.5L6.5 11.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ),
        warning: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
            <circle cx="9" cy="9" r="9" className="fill-amber-500 dark:fill-amber-400" />
            <path d="M9 6V10M9 12.5V12" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ),
        info: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
            <circle cx="9" cy="9" r="9" className="fill-slate-500 dark:fill-slate-400" />
            <path d="M9 6V6.5M9 8.5V12.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ),
      }}
      {...props}
    />
  )
}

export { Toaster }
