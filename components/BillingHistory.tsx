'use client'

import { useEffect, useState } from 'react'
import { ReceiptIcon } from 'lucide-react'

interface Purchase {
  id: string
  date: string
  description: string
  kind: string | null
  quantity: number
  amountTotal: number
  currency: string
  status: string
}

// Small category chip so a long history scans at a glance.
function kindLabel(kind: string | null): string | null {
  switch (kind) {
    case 'org_tokens':
    case 'analysis_tokens':
      return 'Tokens'
    case 'team_credits':
      return 'Team credits'
    case 'coach_credits':
      return 'Coach credits'
    case 'player_tokens':
      return 'Player tokens'
    case 'class_package':
      return 'Class'
    default:
      return kind ? null : 'Shop'
  }
}

function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Purchase history table, fed by /api/org/billing or /api/team/billing.
 * Read-only bookkeeping: what was bought, when, and what it cost.
 */
export default function BillingHistory({ endpoint }: { endpoint: string }) {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(endpoint)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setPurchases(Array.isArray(data.purchases) ? data.purchases : [])
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => { cancelled = true }
  }, [endpoint])

  if (error) {
    return <p className="text-sm text-gray-400">Could not load your purchase history. Please refresh to try again.</p>
  }

  if (purchases === null) {
    return (
      <div className="space-y-2 animate-pulse" aria-label="Loading purchase history">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl" />
        ))}
      </div>
    )
  }

  if (purchases.length === 0) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl">
        <ReceiptIcon className="w-6 h-6 text-gray-300 mx-auto" aria-hidden />
        <p className="text-sm font-medium text-gray-500 mt-2">No purchases yet</p>
        <p className="text-xs text-gray-400 mt-1">Completed purchases appear here with their receipts.</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Date</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Purchase</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Qty</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Amount</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {purchases.map(p => {
              const chip = kindLabel(p.kind)
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(p.date)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">{p.description}</span>
                    {chip && (
                      <span className="ml-2 inline-block text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 align-middle">
                        {chip}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500 tabular-nums">
                    {p.quantity > 0 ? p.quantity : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                    {formatAmount(p.amountTotal, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                      p.status === 'paid'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {p.status === 'paid' ? 'Paid' : p.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
