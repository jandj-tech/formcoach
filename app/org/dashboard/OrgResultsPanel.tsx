'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { backendButton } from '@/components/backend/button-styles'
import { TIER_LABELS, type VisibilityTier } from '@/lib/result-visibility'
import { copyToClipboard } from '@/lib/copy'
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  RefreshCwIcon,
  SendIcon,
  XIcon,
} from 'lucide-react'

// The Results tab: pick a team, see every player's latest graded shot, preview
// exactly what a player will receive, and email the scores. One release per
// submission is created (or refreshed) by the send route; this panel only
// reads state and triggers sends.

export interface ResultsTeamOption {
  id: string
  name: string
  ageGroup: string | null
  memberCount: number
  coachName: string
}

interface RosterPlayer {
  key: string
  userId: string | null
  teamPlayerId: string | null
  name: string
  email: string | null
  submissionId: string | null
  token: string | null
  score: number | null
  gradedAt: string | null
  sentAt: string | null
  resentAt: string | null
  unlocked: boolean
  unsubscribed: boolean
  bounced: boolean
}

interface RosterResponse {
  team: { id: string; name: string; accessCode: string }
  players: RosterPlayer[]
  settings: { freeTier: VisibilityTier; unlockTier: VisibilityTier }
  selling: { enabled: boolean; requested: boolean }
  paywallWithoutOffer: boolean
  offerCount: number
}

interface SendSummary {
  sent: number
  skippedUnreachable: string[]
  skippedSuppressed: string[]
  failed: string[]
  rejected: number
}

const CARD = 'bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl'

async function fetchRoster(teamId: string): Promise<RosterResponse> {
  const res = await fetch(`/api/org/results-roster?teamId=${encodeURIComponent(teamId)}`)
  const json = (await res.json()) as RosterResponse & { error?: string }
  if (!res.ok) throw new Error(json.error || 'Could not load the roster')
  return json
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function StatusChip({ p }: { p: RosterPlayer }) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap'
  if (!p.token) return <span className={`${base} bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim`}>No shot yet</span>
  if (!p.email) return <span className={`${base} bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400`}>No email — share join link</span>
  if (p.bounced) return <span className={`${base} bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400`}>Bounced</span>
  if (p.unsubscribed) return <span className={`${base} bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim`}>Unsubscribed</span>
  if (p.unlocked) return <span className={`${base} bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400`}>Unlocked</span>
  if (p.sentAt) return <span className={`${base} bg-ember-500/10 text-ember-600 dark:text-ember-400`}>Sent {fmtDate(p.resentAt ?? p.sentAt)}</span>
  return <span className={`${base} bg-gray-100 dark:bg-ink-800 text-gray-600 dark:text-chalk-dim`}>Not sent</span>
}

export default function OrgResultsPanel({
  teams,
  onGoToOffers,
}: {
  teams: ResultsTeamOption[]
  onGoToOffers: () => void
}) {
  const [teamId, setTeamId] = useState<string>(teams.length === 1 ? teams[0].id : '')
  const [data, setData] = useState<RosterResponse | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'send' | 'preview' | string | null>(null)
  const [summary, setSummary] = useState<SendSummary | null>(null)
  const [preview, setPreview] = useState<{ html: string; subject: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Fetch is a plain promise; state is only set inside .then/.catch callbacks
  // so the effect body itself never calls setState.
  const load = useCallback((id: string) => {
    if (!id) return Promise.resolve()
    return fetchRoster(id)
      .then((json) => {
        setData(json)
        setError(null)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not load the roster')
        setData(null)
      })
  }, [])
  // Derived rather than stored: the roster is loading whenever a team is
  // picked and nothing has come back yet.
  const loading = !!teamId && data === null && error === null

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    fetchRoster(teamId)
      .then((json) => {
        if (cancelled) return
        setData(json)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load the roster')
        setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [teamId])

  // Changing team resets the selection and any previous send summary.
  function selectTeam(id: string) {
    setSelected(new Set())
    setSummary(null)
    setError(null)
    if (!id) setData(null)
    setTeamId(id)
  }

  const sendable = useMemo(
    () => (data?.players ?? []).filter((p) => p.submissionId && p.email && !p.bounced && !p.unsubscribed),
    [data]
  )
  const allSelected = sendable.length > 0 && sendable.every((p) => selected.has(p.submissionId!))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sendable.map((p) => p.submissionId!)))
  }

  const joinLink = data ? `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?teamCode=${data.team.accessCode}` : ''

  async function copyJoin() {
    if (!joinLink) return
    await copyToClipboard(joinLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/org/send-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string }
    if (!res.ok) throw new Error(json.error || 'Something went wrong')
    return json
  }

  async function doPreview() {
    if (!teamId) return
    const ids = selected.size > 0 ? [...selected] : sendable.slice(0, 1).map((p) => p.submissionId!)
    if (ids.length === 0) {
      setError('No player with a graded shot and an email to preview yet.')
      return
    }
    setBusy('preview')
    setError(null)
    try {
      const json = (await post({ teamId, submissionIds: ids, action: 'preview' })) as {
        preview: { html: string; subject: string }
        token: string
      }
      setPreview({ html: json.preview.html, subject: json.preview.subject, token: json.token })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the preview')
    } finally {
      setBusy(null)
    }
  }

  async function doSend(ids: string[], label: string) {
    if (!teamId || ids.length === 0) return
    const warn = data?.paywallWithoutOffer
      ? '\n\nHeads up: your free level hides part of the report and nothing is for sale yet, so players will have no way to unlock it.'
      : ''
    if (!confirm(`Email ${label}?${warn}`)) return
    setBusy(ids.length === 1 ? ids[0] : 'send')
    setError(null)
    setSummary(null)
    try {
      const json = (await post({ teamId, submissionIds: ids })) as unknown as SendSummary
      setSummary(json)
      setSelected(new Set())
      await load(teamId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send results')
    } finally {
      setBusy(null)
    }
  }

  const team = teams.find((t) => t.id === teamId)

  return (
    <div className="space-y-5">
      {/* Team picker */}
      {!teamId ? (
        <section className={`${CARD} p-5`}>
          <h2 className="text-lg font-black text-black dark:text-chalk">Choose a team</h2>
          <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
            Each week, once the shots are graded, send every player their score from here.
          </p>
          {teams.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400 dark:text-chalk-dim">No teams yet — add one in the Teams tab.</p>
          ) : (
            <div className="mt-4 border border-gray-200 dark:border-courtline rounded-xl divide-y divide-gray-100 dark:divide-courtline overflow-hidden">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTeam(t.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-ink-800 transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-chalk truncate">
                      {t.name}
                      {t.ageGroup ? ` · ${t.ageGroup}` : ''}
                    </span>
                    <span className="block text-xs text-gray-400 dark:text-chalk-dim truncate">
                      {t.memberCount} player{t.memberCount !== 1 ? 's' : ''} · coach {t.coachName}
                    </span>
                  </span>
                  <ChevronRightIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Header */}
          <section className={`${CARD} p-5 space-y-3`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-black dark:text-chalk truncate">{team?.name ?? 'Team'}</h2>
                {data && (
                  <p className="text-xs text-gray-500 dark:text-chalk-dim mt-1">
                    Players see: <span className="font-semibold text-gray-700 dark:text-chalk">{TIER_LABELS[data.settings.freeTier]}</span>
                    {' · '}After buying: <span className="font-semibold text-gray-700 dark:text-chalk">{TIER_LABELS[data.settings.unlockTier]}</span>
                    {' · '}
                    <button type="button" onClick={onGoToOffers} className="font-semibold text-ember-600 dark:text-ember-400 hover:underline">
                      Change in Offers &amp; Sales
                    </button>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {teams.length > 1 && (
                  <button type="button" onClick={() => selectTeam('')} className={backendButton('quiet')}>
                    Change team
                  </button>
                )}
                <button type="button" onClick={doPreview} disabled={busy !== null || sendable.length === 0} className={backendButton('secondary')}>
                  <EyeIcon aria-hidden />
                  {busy === 'preview' ? 'Building preview…' : 'Preview email'}
                </button>
                <button
                  type="button"
                  onClick={() => doSend([...selected], `results to ${selected.size} player${selected.size === 1 ? '' : 's'}`)}
                  disabled={busy !== null || selected.size === 0}
                  className={backendButton('primary')}
                >
                  <SendIcon aria-hidden />
                  {busy === 'send' ? 'Sending…' : `Send results to ${selected.size} player${selected.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>

            {data?.paywallWithoutOffer && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                Your free level hides part of the report, but nothing is for sale yet — players will see the free
                level with no way to unlock the rest.{' '}
                <button type="button" onClick={onGoToOffers} className="font-bold underline underline-offset-2">
                  Fix in Offers &amp; Sales
                </button>
              </div>
            )}

            {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}

            {summary && (
              <div className="rounded-xl border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 px-4 py-3 text-sm text-green-800 dark:text-green-300 space-y-1">
                <p className="font-bold">
                  <CheckIcon className="inline w-4 h-4 mr-1 -mt-0.5" aria-hidden />
                  Sent to {summary.sent} player{summary.sent === 1 ? '' : 's'}.
                </p>
                {summary.skippedUnreachable.length > 0 && (
                  <p>
                    No email on file for {summary.skippedUnreachable.join(', ')} — share the team join link so they can
                    create an account.{' '}
                    <button type="button" onClick={copyJoin} className="font-bold underline underline-offset-2">
                      {copied ? 'Copied!' : 'Copy join link'}
                    </button>
                  </p>
                )}
                {summary.skippedSuppressed.length > 0 && (
                  <p>Skipped (unsubscribed or bounced): {summary.skippedSuppressed.join(', ')}.</p>
                )}
                {summary.failed.length > 0 && <p className="text-red-700 dark:text-red-400">Failed to send: {summary.failed.join(', ')}. Try again in a moment.</p>}
                {summary.rejected > 0 && <p>{summary.rejected} selection{summary.rejected === 1 ? ' was' : 's were'} not on this team or not graded yet and {summary.rejected === 1 ? 'was' : 'were'} skipped.</p>}
              </div>
            )}
          </section>

          {/* Roster */}
          <section className={`${CARD} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 dark:bg-ink-950/60 border-b border-gray-200 dark:border-courtline">
              <span className="text-xs font-medium text-gray-500 dark:text-chalk-dim">
                {loading ? 'Loading…' : `${selected.size} of ${sendable.length} sendable selected`}
              </span>
              <div className="flex items-center gap-3">
                {sendable.length > 0 && (
                  <button type="button" onClick={toggleAll} className="text-xs font-semibold text-ember-600 hover:text-ember-500 dark:text-ember-400">
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if (!teamId) return
                    setRefreshing(true)
                    await load(teamId)
                    setRefreshing(false)
                  }}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-chalk-dim dark:hover:text-chalk inline-flex items-center gap-1"
                >
                  <RefreshCwIcon className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden /> Refresh
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-chalk-dim">
                    <th className="px-4 py-2 w-8" />
                    <th className="px-2 py-2">Player</th>
                    <th className="px-2 py-2 text-right">Latest score</th>
                    <th className="px-2 py-2">Graded</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-4 py-2 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-courtline">
                  {data && data.players.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-chalk-dim">
                        No players on this team yet. Share the join link:{' '}
                        <button type="button" onClick={copyJoin} className="font-semibold text-ember-600 dark:text-ember-400 underline underline-offset-2">
                          {copied ? 'Copied!' : 'copy'}
                        </button>
                      </td>
                    </tr>
                  )}
                  {(data?.players ?? []).map((p) => {
                    const canSend = !!p.submissionId && !!p.email && !p.bounced && !p.unsubscribed
                    return (
                      <tr key={p.key} className="hover:bg-gray-50 dark:hover:bg-ink-800/60 transition-colors">
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-ember-500"
                            disabled={!canSend}
                            checked={!!p.submissionId && selected.has(p.submissionId)}
                            onChange={() => p.submissionId && toggle(p.submissionId)}
                            aria-label={`Select ${p.name}`}
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="block font-medium text-gray-900 dark:text-chalk">{p.name}</span>
                          {p.email && <span className="block text-[11px] text-gray-400 dark:text-chalk-dim truncate max-w-[220px]">{p.email}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-bold text-gray-900 dark:text-chalk">
                          {p.score !== null ? p.score.toFixed(1) : <span className="text-gray-300 dark:text-chalk-dim font-normal">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-gray-500 dark:text-chalk-dim whitespace-nowrap">{fmtDate(p.gradedAt)}</td>
                        <td className="px-2 py-2.5">
                          <StatusChip p={p} />
                          {!p.email && p.token && (
                            <button type="button" onClick={copyJoin} className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-ember-600 dark:text-ember-400 hover:underline">
                              <CopyIcon className="w-3 h-3" aria-hidden /> {copied ? 'Copied' : 'Join link'}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {p.token && (
                            <a
                              href={`/results/${p.token}?as=player`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-chalk-dim dark:hover:text-chalk mr-3"
                            >
                              <ExternalLinkIcon className="w-3 h-3" aria-hidden /> View
                            </a>
                          )}
                          {p.sentAt && canSend && (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => doSend([p.submissionId!], `${p.name} their results again`)}
                              className="text-xs font-semibold text-ember-600 dark:text-ember-400 hover:underline disabled:opacity-50"
                            >
                              {busy === p.submissionId ? 'Sending…' : 'Resend'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Preview modal */}
      {preview &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Email preview">
            <div className="bg-white dark:bg-ink-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-courtline">
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 dark:border-courtline">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-chalk-dim">Preview — exactly what the player receives</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-chalk truncate">Subject: {preview.subject}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/results/${preview.token}?as=player`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={backendButton('secondary')}
                  >
                    <ExternalLinkIcon aria-hidden />
                    Open the player&apos;s view
                  </a>
                  <button type="button" onClick={() => setPreview(null)} className={backendButton('quiet')} aria-label="Close preview">
                    <XIcon aria-hidden />
                  </button>
                </div>
              </div>
              <iframe title="Email preview" srcDoc={preview.html} className="flex-1 w-full min-h-[60vh] bg-[#F4F4F5]" sandbox="" />
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
