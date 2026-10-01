'use client'

import { forwardRef } from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, ChevronRightIcon, PenLineIcon } from 'lucide-react'
import { backendButton } from '@/components/backend/button-styles'
import { CARD, plural, skipReasonText, type SendResponse } from './types'

// What happened, per player, after a send. Shown in place of the three steps
// so there is no doubt the email already went out.
const SendResultPanel = forwardRef<HTMLElement, { result: SendResponse; onAnother: () => void }>(function SendResultPanel(
  { result, onAnother },
  ref,
) {
  const sent = result.sent.length
  const ok = sent > 0
  const setup = result.sent.filter((s) => s.setupRequired).length
  return (
    <section ref={ref} tabIndex={-1} aria-live="polite" className={`${CARD} p-5 sm:p-6 space-y-4 focus:outline-none`}>
      <div className="flex items-start gap-3">
        {ok ? (
          <CheckCircle2Icon className="w-7 h-7 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
        ) : (
          <AlertTriangleIcon className="w-7 h-7 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        )}
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-chalk">
            {ok ? `Sent to ${plural(sent, 'player')}` : 'No emails were sent'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-chalk-dim">
            {ok
              ? 'They are on their way now. Replies come straight to your email.'
              : 'None of the selected players could get this email. The reasons are below.'}
          </p>
          {setup > 0 && (
            <p className="mt-1 text-sm text-gray-700 dark:text-chalk">
              {setup === sent
                ? setup === 1
                  ? 'They haven’t'
                  : 'None of them have'
                : `${setup} of them ${setup === 1 ? 'hasn’t' : 'haven’t'}`}{' '}
              set up their account yet, so{' '}
              {setup === 1 ? 'that email asks them' : 'those emails ask them'} to finish setting up to see their results.
            </p>
          )}
        </div>
      </div>

      {sent > 0 && (
        <details className="group rounded-xl border border-gray-200 dark:border-courtline">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-chalk rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" aria-hidden />
            Who got it ({sent})
          </summary>
          <ul className="border-t border-gray-100 dark:border-courtline px-4 py-2 space-y-1">
            {result.sent.map((s, i) => (
              <li key={`${s.email}-${i}`} className="flex flex-wrap justify-between gap-x-3 text-sm">
                <span className="text-gray-900 dark:text-chalk">
                  {s.name} <span className="text-gray-400 dark:text-chalk-dim">· {s.team}</span>
                </span>
                <span className="text-xs text-gray-500 dark:text-chalk-dim [overflow-wrap:anywhere]">
                  {s.email}
                  {s.setupRequired ? ' · finish-setup email' : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {result.skipped.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-300">Skipped ({result.skipped.length})</p>
          <ul className="mt-1 space-y-1">
            {result.skipped.map((s, i) => (
              <li key={`${s.name}-${s.team}-${i}`} className="text-sm text-amber-900 dark:text-amber-200">
                {s.name} <span className="opacity-70">· {s.team}</span>
                <span className="block text-xs text-amber-800 dark:text-amber-300">{skipReasonText(s.reason)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.failed.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3">
          <p className="text-sm font-bold text-red-800 dark:text-red-300">Could not be sent ({result.failed.length})</p>
          <p className="text-xs text-red-700 dark:text-red-300">
            Our email service did not accept these. Wait a few minutes, then send to just these players again.
          </p>
          <ul className="mt-1 space-y-0.5">
            {result.failed.map((f, i) => (
              <li key={`${f.name}-${f.team}-${i}`} className="text-sm text-red-800 dark:text-red-200">
                {f.name} <span className="opacity-70">· {f.team}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={onAnother} className={backendButton('primary', 'w-full sm:w-auto')}>
        <PenLineIcon aria-hidden />
        Write another email
      </button>
    </section>
  )
})

export default SendResultPanel
