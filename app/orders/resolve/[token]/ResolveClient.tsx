'use client'

import { useState } from 'react'

type Choice = 'refund' | 'swap'
type SizeOption = { value: '5' | '6' | '7'; label: string }

export default function ResolveClient({
  token,
  amount,
  options,
  initialChoice,
}: {
  token: string
  amount: string
  options: SizeOption[]
  initialChoice: Choice | null
}) {
  const [choice, setChoice] = useState<Choice | null>(initialChoice)
  const [swapSize, setSwapSize] = useState<SizeOption['value'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<null | { kind: Choice; detail: string }>(null)

  async function submitRefund() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/orders/resolve/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again or reply to your email.')
        return
      }
      setDone({ kind: 'refund', detail: data.amount ?? amount })
    } catch {
      setError('Could not reach LearnHoops. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function submitSwap() {
    if (!swapSize) {
      setError('Pick a size first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/orders/resolve/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newSize: swapSize }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again or reply to your email.')
        return
      }
      setDone({ kind: 'swap', detail: data.sizeLabel ?? swapSize })
    } catch {
      setError('Could not reach LearnHoops. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div role="status" className="mt-6 rounded-2xl border border-green-500/30 bg-green-500/10 p-5">
        <p className="text-green-400 font-bold text-base">
          {done.kind === 'refund' ? 'Refund processed' : "You're set"}
        </p>
        <p className="text-chalk-dim text-sm mt-2 leading-relaxed">
          {done.kind === 'refund'
            ? `${done.detail} is on its way back to your original payment method — usually 5–10 business days.`
            : `Your ${done.detail} ball ships now at no extra cost. Tracking is on its way by email.`}
        </p>
      </div>
    )
  }

  const cardBase = 'w-full text-left rounded-2xl border-2 p-5 transition-colors'
  const active = 'border-ember-500 bg-ember-500/10'
  const idle = 'border-courtline hover:border-chalk-dim/60'

  return (
    <div className="mt-6 space-y-3">
      {/* Refund option */}
      <button
        type="button"
        onClick={() => setChoice('refund')}
        className={`${cardBase} ${choice === 'refund' ? active : idle}`}
      >
        <div className="font-bold text-base">Full refund</div>
        <div className="text-chalk-dim text-sm mt-1">Get your {amount} back, no questions asked.</div>
      </button>

      {/* Swap option */}
      <button
        type="button"
        onClick={() => setChoice('swap')}
        className={`${cardBase} ${choice === 'swap' ? active : idle}`}
      >
        <div className="font-bold text-base">Swap size</div>
        <div className="text-chalk-dim text-sm mt-1">Switch to an in-stock size and we ship it today, same price.</div>
      </button>

      {choice === 'swap' && (
        <div className="rounded-2xl border border-courtline bg-ink-950/60 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-chalk-dim mb-2">Which size?</div>
          <div className="grid grid-cols-2 gap-3">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setSwapSize(o.value)}
                className={`rounded-xl border-2 px-3 py-3 text-center transition-colors ${
                  swapSize === o.value ? active : idle
                }`}
              >
                <div className="font-bold text-sm">Size {o.value}</div>
                <div className="text-chalk-dim text-xs mt-0.5">{o.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}

      {choice && (
        <button
          type="button"
          disabled={busy || (choice === 'swap' && !swapSize)}
          onClick={choice === 'refund' ? submitRefund : submitSwap}
          className="w-full bg-ember-500 hover:bg-ember-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full text-base transition-all"
        >
          {busy
            ? 'Working…'
            : choice === 'refund'
              ? `Confirm full refund (${amount})`
              : 'Confirm size swap'}
        </button>
      )}

      <p className="text-chalk-dim text-xs pt-1">
        Would rather wait it out, or talk to a person? Reply to the email we sent you.
      </p>
    </div>
  )
}
