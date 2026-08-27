'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Order {
  id: string
  stripe_session_id: string
  email: string
  customer_name: string | null
  phone: string | null
  variant: string | null
  size: string | null
  amount_total: number
  currency: string
  shipping_name: string | null
  shipping_line1: string | null
  shipping_line2: string | null
  shipping_city: string | null
  shipping_state: string | null
  shipping_postal_code: string | null
  shipping_country: string | null
  shipping_cost_cents: number | null
  shipping_carrier: string | null
  shipping_service: string | null
  status: string
  shipping_link: string | null
  created_at: string
  kind: string
  quantity: number
  class_package_id: string | null
  description: string | null
  buyer_kind: string | null
  buyer_ref: string | null
}

const sizeInches: Record<string, string> = { '5': '27.5"', '6': '28.5"', '7': '29.5"' }
const fmt = (cents: number, currency = 'usd') =>
  `$${(cents / 100).toFixed(2)}${currency && currency.toLowerCase() !== 'usd' ? ` ${currency.toUpperCase()}` : ''}`

function isBallOrder(o: Order) {
  return o.variant === 'left' || o.variant === 'right'
}

// What each kind is called, and how it is coloured, so a token sale and a
// ball shipment are distinguishable at a glance down the list.
const KINDS: Record<string, { label: string; className: string }> = {
  single: { label: 'Ball', className: 'bg-orange-500/10 text-orange-400' },
  bundle: { label: 'Ball bundle', className: 'bg-orange-500/10 text-orange-400' },
  class_package: { label: 'Class package', className: 'bg-purple-500/10 text-purple-300' },
  analysis_tokens: { label: 'Analysis tokens', className: 'bg-sky-500/10 text-sky-300' },
  coach_credits: { label: 'Coach credits', className: 'bg-emerald-500/10 text-emerald-300' },
  team_credits: { label: 'Team credits', className: 'bg-emerald-500/10 text-emerald-300' },
  player_tokens: { label: 'Player tokens', className: 'bg-emerald-500/10 text-emerald-300' },
  org_tokens: { label: 'Org tokens', className: 'bg-indigo-500/10 text-indigo-300' },
  subscription: { label: 'Subscription', className: 'bg-zinc-500/10 text-zinc-300' },
}

function kindOf(o: Order) {
  return KINDS[o.kind] ?? { label: o.kind, className: 'bg-zinc-500/10 text-zinc-300' }
}

export default function OrdersClient({ orders }: { orders: Order[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [shipping, setShipping] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [trackingLink, setTrackingLink] = useState('')

  const ballOrders = orders.filter(isBallOrder)
  const pendingBallOrders = ballOrders.filter(o => o.status !== 'shipped')
  // Shipping only makes sense for pending ball orders; deleting works on any
  // selected row (e.g. clearing out test purchases).
  const selectedPendingBall = pendingBallOrders.filter(o => selected.has(o.id))

  function toggleAll() {
    const allIds = orders.map(o => o.id)
    if (allIds.every(id => selected.has(id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allIds))
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openShippingModal() {
    if (selectedPendingBall.length === 0) return
    setTrackingLink('')
    setShowTrackingModal(true)
  }

  async function confirmShipped() {
    if (selectedPendingBall.length === 0) return
    setShipping(true)
    setShowTrackingModal(false)
    try {
      await fetch('/api/admin/orders/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: selectedPendingBall.map(o => o.id),
          shippingLink: trackingLink.trim() || undefined,
        }),
      })
      setSelected(new Set())
      setTrackingLink('')
      router.refresh()
    } catch {
      alert('Something went wrong. Please try again.')
    }
    setShipping(false)
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    const n = selected.size
    if (!confirm(`Permanently delete ${n} order${n !== 1 ? 's' : ''}? This only removes them from this list — any credits already granted to buyers are untouched. This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [...selected] }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setSelected(new Set())
      router.refresh()
    } catch {
      alert('Something went wrong. Please try again.')
    }
    setDeleting(false)
  }

  const allSelected = orders.length > 0 && orders.every(o => selected.has(o.id))

  return (
    <div className="space-y-4">
      {/* Shipping link modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4 mx-4">
            <h2 className="text-white font-black text-lg">Mark as Shipped</h2>
            <p className="text-zinc-400 text-sm">
              Paste a tracking link below and we&apos;ll email it to each customer. Leave blank to skip the email.
            </p>
            <div className="space-y-1">
              <label className="text-zinc-300 text-xs font-semibold uppercase tracking-wide">Tracking link (optional)</label>
              <input
                type="url"
                value={trackingLink}
                onChange={e => setTrackingLink(e.target.value)}
                placeholder="https://tools.usps.com/go/TrackConfirmAction?tLabels=..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-orange-500"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={confirmShipped}
                disabled={shipping}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {shipping ? 'Marking shipped...' : `Mark ${selectedPendingBall.length} order${selectedPendingBall.length !== 1 ? 's' : ''} shipped`}
              </button>
              <button
                onClick={() => setShowTrackingModal(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 flex-wrap bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3">
          <span className="text-orange-400 text-sm font-semibold">{selected.size} order{selected.size !== 1 ? 's' : ''} selected</span>
          {selectedPendingBall.length > 0 && (
            <button
              onClick={openShippingModal}
              disabled={shipping || deleting}
              className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold px-4 py-1.5 rounded-lg text-sm transition-colors"
            >
              {shipping ? 'Marking shipped...' : `Mark ${selectedPendingBall.length} as Shipped`}
            </button>
          )}
          <button
            onClick={deleteSelected}
            disabled={shipping || deleting}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-400 hover:text-white text-sm transition-colors ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-orange-500 w-4 h-4"
                />
              </th>
              <th className="text-left px-4 py-3">Customer</th>
              <th className="text-left px-4 py-3">What they bought</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Shipping address</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Label</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-zinc-500">No orders yet.</td>
              </tr>
            ) : (
              orders.map((o) => {
                const hasBall = isBallOrder(o)
                const isShipped = o.status === 'shipped'
                const isChecked = selected.has(o.id)
                return (
                  <tr
                    key={o.id}
                    className={`hover:bg-zinc-800/30 transition-colors align-top ${isChecked ? 'bg-orange-500/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(o.id)}
                        className="accent-orange-500 w-4 h-4 mt-0.5"
                      />
                    </td>
                    <td className="px-4 py-3 text-white">
                      <div className="font-medium">{o.customer_name || '—'}</div>
                      <div className="text-zinc-400 text-xs">{o.email}</div>
                      {o.phone && <div className="text-zinc-400 text-xs">{o.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kindOf(o).className}`}>
                          {kindOf(o).label}
                        </span>
                        {hasBall ? (
                          <>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-medium ml-1">
                              {o.variant === 'left' ? 'Left-handed' : 'Right-handed'}
                            </span>
                            {o.size && (
                              <div className="text-zinc-300 text-sm font-semibold">
                                {o.quantity > 1 ? `${o.quantity}× ` : ''}
                                Size {o.size} <span className="text-zinc-500 font-normal">({sizeInches[String(o.size)] ?? '—'})</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-zinc-300 text-sm">
                            {o.description || (o.quantity > 0 ? `${o.quantity}×` : '—')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-orange-400 font-bold">{fmt(Number(o.amount_total), o.currency)}</div>
                      {Number(o.amount_total) === 0 && (
                        <div className="text-zinc-500 text-xs mt-0.5">comped / test</div>
                      )}
                      {o.shipping_cost_cents != null && (
                        <div className="text-zinc-400 text-xs mt-0.5">
                          incl. {fmt(Number(o.shipping_cost_cents))} ship
                          {o.shipping_carrier && (
                            <span className="text-zinc-500"> · {o.shipping_carrier === 'canada_post' ? 'Canada Post' : o.shipping_carrier.toUpperCase()}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-xs leading-relaxed">
                      {hasBall ? (
                        <>
                          {o.shipping_name && <div>{o.shipping_name}</div>}
                          {o.shipping_line1 && <div>{o.shipping_line1}</div>}
                          {o.shipping_line2 && <div>{o.shipping_line2}</div>}
                          {(o.shipping_city || o.shipping_state) && (
                            <div>{[o.shipping_city, o.shipping_state, o.shipping_postal_code].filter(Boolean).join(', ')}</div>
                          )}
                          {o.shipping_country && <div>{o.shipping_country}</div>}
                          {isShipped && o.shipping_link && (
                            <a
                              href={o.shipping_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-400 underline mt-1 inline-block"
                            >
                              Track package
                            </a>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-500 italic">No shipping required</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isShipped ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">
                          Shipped
                        </span>
                      ) : hasBall ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-semibold">
                          Pending
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400 font-semibold">
                          No shipping
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {hasBall && (
                        <Link
                          href={`/admin/label/${o.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-zinc-400 hover:text-orange-400 underline whitespace-nowrap transition-colors"
                        >
                          Label
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Labels section */}
      {ballOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-black text-white">Labels</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ballOrders.map(o => {
              const cityLine = [o.shipping_city, o.shipping_state, o.shipping_postal_code].filter(Boolean).join(', ')
              const isPending = o.status !== 'shipped'
              return (
                <div
                  key={o.id}
                  className={`bg-zinc-900 border rounded-xl p-4 space-y-3 ${isPending ? 'border-zinc-700' : 'border-zinc-800 opacity-60'}`}
                >
                  {/* Address block */}
                  <div className="space-y-0.5">
                    <div className="text-white font-bold text-sm">{o.shipping_name || o.customer_name || '—'}</div>
                    {o.shipping_line1 && <div className="text-zinc-300 text-xs">{o.shipping_line1}</div>}
                    {o.shipping_line2 && <div className="text-zinc-400 text-xs">{o.shipping_line2}</div>}
                    {cityLine && <div className="text-zinc-300 text-xs">{cityLine}</div>}
                    {o.shipping_country && <div className="text-zinc-400 text-xs">{o.shipping_country}</div>}
                  </div>

                  {/* Order details */}
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                    <span className="text-orange-400 font-semibold">
                      {o.quantity > 1 ? `${o.quantity}× ` : ''}
                      {o.variant === 'left' ? 'Left-handed' : 'Right-handed'}
                      {o.size ? ` · Size ${o.size}` : ''}
                    </span>
                    {o.kind === 'class_package' && (
                      <span className="text-purple-300 font-semibold">Class Package</span>
                    )}
                    {isPending ? (
                      <span className="text-yellow-400">Pending</span>
                    ) : (
                      <span className="text-green-400">Shipped</span>
                    )}
                  </div>

                  {/* Print label link */}
                  <Link
                    href={`/admin/label/${o.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Print Label →
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
