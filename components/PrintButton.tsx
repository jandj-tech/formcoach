'use client'

// Triggers the browser print dialog. Hidden from the printout itself.
export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden shrink-0 bg-white border border-gray-300 hover:border-orange-400 text-black font-bold text-sm px-4 py-2 rounded-xl transition-colors"
    >
      {label}
    </button>
  )
}
