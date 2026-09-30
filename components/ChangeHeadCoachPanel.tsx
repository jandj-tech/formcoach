'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { InfoIcon, LoaderCircleIcon } from 'lucide-react'
import { backendButton } from '@/components/backend/button-styles'

// "Change head coach" for one team on the org dashboard. Opens in place under
// the Coaches list (no browser confirm): pick an assistant who has finished
// setup, or take the team yourself; see plainly who loses access; decide what
// happens to the outgoing coach's tokens. Backed by /api/org/change-head-coach,
// which re-checks every rule server-side in one transaction.

interface Preview {
  teamName: string
  orgName: string
  current: {
    email: string
    nickname: string | null
    isOrg: boolean
    pending: boolean
    tokens: number
    otherTeams: number
  }
  candidates: Array<{ id: string; email: string; nickname: string | null; accepted: boolean }>
}

export interface HeadCoachChange {
  newHeadName: string
  isOrg: boolean
  removedName: string | null
  tokensReturned: number
  tokensKept: number
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function ChangeHeadCoachPanel({
  teamId,
  onDone,
  onCancel,
}: {
  teamId: string
  onDone: (change: HeadCoachChange) => void
  onCancel: () => void
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [choice, setChoice] = useState<string | null>(null)
  const [returnTokens, setReturnTokens] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/org/change-head-coach?teamId=${encodeURIComponent(teamId)}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) { setLoadError(d.error || 'Could not load this team’s coaches.'); return }
        setPreview(d as Preview)
      })
      .catch(() => { if (!cancelled) setLoadError('Could not load this team’s coaches.') })
    return () => { cancelled = true }
  }, [teamId])

  const shell = (body: ReactNode) => (
    <div
      role="region"
      aria-label="Change head coach"
      className="rounded-xl border border-gray-200 dark:border-courtline bg-gray-50 dark:bg-ink-950/60 px-4 py-4 space-y-4"
    >
      <div>
        <p className="text-sm font-semibold text-black dark:text-chalk">Change head coach</p>
        <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
          The head coach runs this team and can spend its team tokens.
        </p>
      </div>
      {body}
    </div>
  )

  if (loadError) {
    return shell(
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        <button type="button" onClick={onCancel} className={backendButton('quiet')}>Close</button>
      </div>,
    )
  }
  if (!preview) {
    return shell(
      <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-chalk-dim">
        <LoaderCircleIcon aria-hidden className="w-4 h-4 animate-spin" /> Loading coaches&hellip;
      </p>,
    )
  }

  const { current, candidates } = preview
  const currentName = current.isOrg ? preview.orgName : current.nickname || current.email
  const options = [
    ...candidates.map(c => ({
      value: c.id,
      label: c.nickname || c.email,
      detail: c.nickname ? c.email : null,
      disabled: !c.accepted,
      note: c.accepted ? null : 'Hasn’t finished setup',
    })),
    ...(current.isOrg
      ? []
      : [{
          value: 'org',
          label: 'I’ll coach this team myself',
          detail: `${preview.orgName} runs the team from this dashboard. No separate coach login.`,
          disabled: false,
          note: null,
        }]),
  ]
  const hasChoice = options.some(o => !o.disabled)
  const picked = options.find(o => o.value === choice && !o.disabled) ?? null
  const tokensCanReturn = !current.isOrg && current.tokens > 0 && current.otherTeams === 0
  const tokensStay = !current.isOrg && current.tokens > 0 && current.otherTeams > 0

  async function save() {
    if (!picked) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/org/change-head-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, newHeadCoachId: picked.value, returnTokens: tokensCanReturn && returnTokens }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not change the head coach. Please try again.')
        setSaving(false)
        return
      }
      onDone({
        newHeadName: data.newHead?.isOrg ? preview!.orgName : data.newHead?.nickname || data.newHead?.email || picked.label,
        isOrg: !!data.newHead?.isOrg,
        removedName: data.removed ? data.removed.nickname || data.removed.email : null,
        tokensReturned: Number(data.tokensReturned) || 0,
        tokensKept: Number(data.tokensKept) || 0,
      })
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return shell(
    <>
      <p className="text-sm text-gray-600 dark:text-chalk-dim">
        Now: <span className="font-semibold text-black dark:text-chalk">{currentName}</span>
        {current.isOrg && ' (you coach this team)'}
        {current.pending && ' (hasn’t finished setup)'}
      </p>

      {hasChoice ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-gray-500 dark:text-chalk-dim mb-1.5">Who should be head coach?</legend>
          {options.map(o => (
            <label
              key={o.value}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                o.disabled
                  ? 'border-gray-200 dark:border-courtline opacity-60 cursor-not-allowed'
                  : choice === o.value
                    ? 'border-ember-500 bg-ember-500/10 cursor-pointer'
                    : 'border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 hover:border-gray-300 dark:hover:border-chalk-dim/40 cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name={`head-coach-${teamId}`}
                value={o.value}
                checked={choice === o.value}
                disabled={o.disabled || saving}
                onChange={() => setChoice(o.value)}
                className="mt-0.5 w-4 h-4 accent-ember-500 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-black dark:text-chalk break-words">{o.label}</span>
                  {o.note && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim whitespace-nowrap">
                      {o.note}
                    </span>
                  )}
                </span>
                {o.detail && <span className="block text-xs text-gray-500 dark:text-chalk-dim mt-0.5 break-words">{o.detail}</span>}
              </span>
            </label>
          ))}
          {candidates.some(c => !c.accepted) && (
            <p className="text-xs text-gray-500 dark:text-chalk-dim">
              A coach can take over once they&rsquo;ve set up their account from their invite.
            </p>
          )}
        </fieldset>
      ) : (
        <p className="text-sm text-gray-600 dark:text-chalk-dim">
          {candidates.length === 0
            ? 'Add a coach below first. Once they finish setting up their account, you can make them head coach.'
            : 'None of this team’s coaches have finished setup yet. Once one does, you can make them head coach.'}
        </p>
      )}

      {picked && !current.isOrg && (
        <div className="rounded-xl border border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 px-3 py-3 space-y-2.5">
          <p className="flex items-start gap-2 text-sm text-gray-700 dark:text-chalk">
            <InfoIcon aria-hidden className="w-4 h-4 mt-0.5 shrink-0 text-gray-400 dark:text-chalk-dim" />
            <span>
              {current.pending
                ? <>{currentName} will be removed from this team and their setup link will stop working.</>
                : <>{currentName} will lose access to this team right away.</>}
            </span>
          </p>

          {tokensCanReturn && (
            <fieldset className="space-y-1.5 pl-6">
              <legend className="text-sm text-gray-700 dark:text-chalk mb-1">
                {currentName} has {plural(current.tokens, 'token')}.
              </legend>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name={`head-coach-tokens-${teamId}`}
                  checked={returnTokens}
                  onChange={() => setReturnTokens(true)}
                  disabled={saving}
                  className="mt-0.5 w-4 h-4 accent-ember-500 shrink-0"
                />
                <span className="text-sm text-gray-700 dark:text-chalk">
                  Move them back to your organization tokens
                  <span className="block text-xs text-gray-500 dark:text-chalk-dim">Recommended. They can&rsquo;t be used without a team.</span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name={`head-coach-tokens-${teamId}`}
                  checked={!returnTokens}
                  onChange={() => setReturnTokens(false)}
                  disabled={saving}
                  className="mt-0.5 w-4 h-4 accent-ember-500 shrink-0"
                />
                <span className="text-sm text-gray-700 dark:text-chalk">Leave them with {currentName}</span>
              </label>
            </fieldset>
          )}
          {tokensStay && (
            <p className="text-sm text-gray-600 dark:text-chalk-dim pl-6">
              Their {plural(current.tokens, 'token')} stay with them for the other {current.otherTeams === 1 ? 'team' : 'teams'} they coach.
            </p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {hasChoice && (
          <button type="button" onClick={save} disabled={!picked || saving} className={backendButton('primary', 'max-w-full')}>
            {saving && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            <span className="min-w-0 whitespace-normal text-center">
              {!picked
                ? 'Pick one above'
                : picked.value === 'org'
                  ? 'Coach it myself'
                  : `Make ${picked.label} head coach`}
            </span>
          </button>
        )}
        <button type="button" onClick={onCancel} disabled={saving} className={backendButton('quiet')}>
          Cancel
        </button>
      </div>
    </>,
  )
}
