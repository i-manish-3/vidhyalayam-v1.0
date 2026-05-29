'use client'

import { Printer } from 'lucide-react'

export function SlipPrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium shadow-sm transition-colors"
    >
      <Printer className="size-4" />
      Save as PDF / Print
    </button>
  )
}
