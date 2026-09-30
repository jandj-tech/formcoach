'use client'

import { useId, useState, type ReactNode } from 'react'
import { AlertTriangleIcon, ChevronRightIcon, LoaderCircleIcon, SendIcon } from 'lucide-react'
import { backendButton } from '@/components/backend/button-styles'
import StepCard from './StepCard'
import { CHECKBOX, plural, type Duplicate, type Recipient } from './types'

// Step 3 — review and send. Everything the sender needs to be sure of before
// a real email goes out: who it is from, where replies go, the exact
// recipients per team, who is left out and why. One primary button, labelled
// with the real count. Large sends ask for one extra tick so the number is
// read, not skimmed.

export const LARGE_SEND = 25

export interface ComposerError {
  title: string
  body: ReactNode
}

export interface Excluded {
  id: string
  name: string
  team: string
  reason: string
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-x-3 gap-y-0.5 py-2.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-chalk-dim sm:pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-chalk min-w-0 break-words">{children}</dd>
    </div>
  )
}

export default function ReviewStep({
  fromHeader,
  replyTo,
  subject,
  personalized,
  includeResults,
  recipients,
  duplicates,
  excluded,
  problems,
  warnings = [],
  sending,
  error,
  onSend,
}: {
  fromHeader: string
  replyTo: string
  subject: string
  personalized: boolean
  includeResults: boolean
  recipients: Recipient[]
  duplicates: Duplicate[]
  excluded: Excluded[]
  problems: string[]
  /** Worth a look, but not blocking. */
  warnings?: string[]
  sending: boolean
  error: ComposerError | null
  onSend: () => void
}) {
  const confirmId = useId()
  const [confirmedFor, setConfirmedFor] = useState<number | null>(null)
  const n = recipients.length
  const large = n >= LARGE_SEND
  const confirmed = !large || confirmedFor === n

  const byTeam = new Map<string, { name: string; list: Recipient[] }>()
  for (const r of recipients) {
    const g = byTeam.get(r.team.id) ?? { name: r.team.name, list: [] }
    g.list.push(r)
    byTeam.set(r.team.id, g)
  }
  const withScore = recipients.filter((r) => r.player.submissionId && r.player.score !== null).length
  const withoutScore = n - withScore

  const left: Excluded[] = [
    ...duplicates.map((d) => ({
      id: d.id,
      name: d.player.name,
      team: d.team.name,
      reason: d.samePerson
        ? `Also on ${d.keptBy.team.name} — gets that one email`
        : `Same email address as ${d.keptBy.player.name} — one email goes to that address`,
    })),
    ...excluded,
  ]

  const canSend = n > 0 && problems.length === 0 && confirmed && !sending

  return (
    <StepCard step={3} title="Review and send" description="Check this once. Emails go out as soon as you press send.">
      {n === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 dark:border-courtline px-4 py-6 text-center text-sm text-gray-500 dark:text-chalk-dim">
          Pick at least one player in step 1.
        </p>
      ) : (
        <div className="space-y-4">
          <div className={`rounded-xl px-4 py-3 ${large ? 'bg-ember-500/10 border border-ember-500/40' : 'bg-gray-50 dark:bg-ink-950/60 border border-gray-200 dark:border-courtline'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-chalk-dim">This email goes to</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900 dark:text-chalk">
              {plural(n, 'player')}
              <span className="ml-2 text-sm font-semibold text-gray-500 dark:text-chalk-dim">
                on {plural(byTeam.size, 'team')}
              </span>
            </p>
            {includeResults && (
              <p className="mt-1 text-sm text-gray-700 dark:text-chalk">
                Score included for {withScore}
                {withoutScore > 0 && ` · ${withoutScore} ${withoutScore === 1 ? 'has' : 'have'} no graded shot yet (message only)`}
              </p>
            )}
          </div>

          <dl className="divide-y divide-gray-100 dark:divide-courtline">
            <Row label="From">{fromHeader}</Row>
            <Row label="Reply-to">
              {replyTo}
              <span className="block text-xs text-gray-500 dark:text-chalk-dim">When a player or parent replies, it goes here.</span>
            </Row>
            <Row label="Subject">
              <span className="font-semibold">{subject || <span className="text-gray-400 dark:text-chalk-dim font-normal">No subject yet</span>}</span>
              {personalized && subject && (
                <span className="block text-xs text-gray-500 dark:text-chalk-dim">Shown for the preview player. Each player sees their own name.</span>
              )}
            </Row>
            <Row label="Recipients">
              <div className="space-y-1.5">
                {[...byTeam.entries()].map(([teamId, g]) => (
                  <details key={teamId} className="group rounded-lg border border-gray-200 dark:border-courtline">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-chalk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 rounded-lg [&::-webkit-details-marker]:hidden">
                      <ChevronRightIcon className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" aria-hidden />
                      <span className="flex-1 min-w-0 truncate">{g.name}</span>
                      <span className="text-xs font-medium text-gray-500 dark:text-chalk-dim">{plural(g.list.length, 'player')}</span>
                    </summary>
                    <ul className="border-t border-gray-100 dark:border-courtline px-3 py-2 space-y-1">
                      {g.list.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                          <span className="text-gray-900 dark:text-chalk">
                            {r.player.name}
                            {r.player.sameNameAsAnother && r.player.detail && r.player.detail !== r.player.email && (
                              <span className="text-xs text-gray-500 dark:text-chalk-dim"> ({r.player.detail})</span>
                            )}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-chalk-dim [overflow-wrap:anywhere]">
                            {r.player.email}
                            {r.player.emailSource === 'family' && (r.player.familyOf ? ` (${r.player.familyOf}'s family email)` : ' (family email)')}
                            {includeResults && (r.player.score !== null ? ` · score ${r.player.score.toFixed(1)}` : ' · message only')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </Row>
            {left.length > 0 && (
              <Row label="Not getting it">
                <details className="group rounded-lg border border-gray-200 dark:border-courtline">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-chalk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 rounded-lg [&::-webkit-details-marker]:hidden">
                    <ChevronRightIcon className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" aria-hidden />
                    <span className="flex-1">{plural(left.length, 'player')} on these teams</span>
                  </summary>
                  <ul className="border-t border-gray-100 dark:border-courtline px-3 py-2 space-y-1.5">
                    {left.map((x) => (
                      <li key={x.id} className="text-sm">
                        <span className="text-gray-900 dark:text-chalk">{x.name}</span>
                        <span className="text-gray-400 dark:text-chalk-dim"> · {x.team}</span>
                        <span className="block text-xs text-amber-700 dark:text-amber-400">{x.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </Row>
            )}
          </dl>

          {problems.length > 0 && (
            <ul className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
              {problems.map((p) => (
                <li key={p} className="flex gap-2">
                  <AlertTriangleIcon className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          )}

          {warnings.length > 0 && (
            <ul aria-label="Check before sending" className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
              {warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangleIcon className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-300">
              <p className="font-bold">{error.title}</p>
              <div className="mt-0.5">{error.body}</div>
            </div>
          )}

          {large && problems.length === 0 && (
            <label htmlFor={confirmId} className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-courtline px-4 py-3 cursor-pointer">
              <input
                id={confirmId}
                type="checkbox"
                className={`${CHECKBOX} mt-0.5`}
                checked={confirmedFor === n}
                disabled={sending}
                onChange={(e) => setConfirmedFor(e.target.checked ? n : null)}
              />
              <span className="text-sm text-gray-900 dark:text-chalk">
                I checked the list. Send this to <strong className="font-bold">{plural(n, 'player')}</strong>
                {byTeam.size > 1 ? ` on ${plural(byTeam.size, 'team')}` : ''}.
              </span>
            </label>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
            <button type="button" onClick={onSend} disabled={!canSend} className={backendButton('primary', 'w-full sm:w-auto py-2.5 px-6')}>
              {sending ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />}
              {sending ? `Sending to ${plural(n, 'player')}…` : `Send to ${plural(n, 'player')}`}
            </button>
            {!canSend && !sending && large && !confirmed && problems.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-chalk-dim">Tick the box above to confirm the number.</p>
            )}
          </div>
        </div>
      )}
    </StepCard>
  )
}
