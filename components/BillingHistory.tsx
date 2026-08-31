'use client'

import { useEffect, useState, type ReactNode } from 'react'
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
export default function BillingHistory({
  endpoint,
  emptyAction,
}: {
  endpoint: string
  // Optional call-to-action rendered inside the empty state (e.g. a "Buy
  // tokens" shortcut) so a fresh account's Billing tab isn't a dead end.
  emptyAction?: ReactNode
}) {
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
    return <p className="text-sm text-gray-400 dark:text-chalk-dim">Could not load your purchase history. Please refresh to try again.</p>
  }

  if (purchases === null) {
    return (
      <div className="space-y-2 animate-pulse" aria-label="Loading purchase history">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-ink-800 rounded-xl" />
        ))}
      </div>
    )
  }

  if (purchases.length === 0) {
    return (
<div className="text-center py-10 px-6 border-2 border-dashed border-gray-200 dark:border-courtline rounded-2xl">
        <ReceiptIcon className="w-6 h-6 text-gray-300 dark:text-chalk-dim mx-auto" aria-hidden />
        <p className="text-sm font-medium text-gray-600 dark:text-chalk-dim mt-2">No purchases on this account yet</p>
        <p className="text-xs text-gray-400 dark:text-chalk-dim mt-1 max-w-sm mx-auto">
          This is where your purchase history lives — every token, credit,
          class-package, and shop checkout shows up here automatically, with
          the date, amount, and payment status.
        </p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-courtline rounded-2xl overflow-hidden bg-white dark:bg-ink-900">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/80 dark:bg-ink-800 border-b border-gray-200 dark:border-courtline">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-chalk-dim">Date</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-chalk-dim">Purchase</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-chalk-dim">Qty</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-chalk-dim">Amount</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-chalk-dim">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-courtline/60">
            {purchases.map(p => {
              const chip = kindLabel(p.kind)
              return (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-ink-800/60 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-chalk-dim whitespace-nowrap">{formatDate(p.date)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-chalk">{p.description}</span>
                    {chip && (
                      <span className="ml-2 inline-block text-[11px] font-medium text-gray-500 dark:text-chalk-dim bg-gray-100 dark:bg-ink-800 rounded-full px-2 py-0.5 align-middle">
                        {chip}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-chalk-dim tabular-nums">
                    {p.quantity > 0 ? p.quantity : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-chalk tabular-nums whitespace-nowrap">
                    {formatAmount(p.amountTotal, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                      p.status === 'paid'
                        ? 'bg-ember-500/10 text-ember-600 dark:text-ember-400'
                        : 'bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim'
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
