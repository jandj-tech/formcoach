'use client'

import { PrinterIcon } from 'lucide-react'

// Triggers the browser print dialog. Hidden from the printout itself.
export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden shrink-0 inline-flex items-center gap-1.5 bg-white border border-gray-300 hover:border-orange-400 text-black font-bold text-sm px-4 py-2 rounded-xl transition-colors"
    >
      <PrinterIcon className="h-4 w-4" />
      {label}
    </button>
  )
}
