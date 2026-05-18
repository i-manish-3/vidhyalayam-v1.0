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
