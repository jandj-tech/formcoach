'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-orange-500 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-orange-600 transition"
    >
      Download / Print PDF
    </button>
  )
}
