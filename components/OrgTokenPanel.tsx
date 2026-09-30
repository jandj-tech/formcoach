'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import { SearchIcon, UsersIcon, UserIcon } from 'lucide-react'
import OrgPlayerPicker from '@/components/OrgPlayerPicker'
import VolumeSavings, { VolumeTierList } from '@/components/VolumeSavings'
import {
  orderPricing,
  usd,
  MAX_TOKENS_PER_ORDER,
  ORG_BULK_PRICE_CENTS,
  ORG_BULK_MIN_QTY,
  REGULAR_ANALYSIS_PRICE_CENTS,
  REGULAR_VOLUME_PRICE_CENTS,
  REGULAR_VOLUME_MIN_QTY,
  type OrgTier,
} from '@/lib/team-pricing'

export interface OrgPlayerOpt {
  id: string
  label: string
  team: string
  teamId: string
}

export interface OrgCoachOpt {
  email: string
  label: string
}

export interface OrgTeamOpt {
  id: string
  name: string
  coachName: string
  ageGroup: string | null
  memberCount: number
}

type SendMode = 'players' | 'coach'

const SEND_MODES: Array<{ id: SendMode; label: string; blurb: string }> = [
  {
    id: 'players',
    label: 'Players',
    blurb: 'Pick a team, then choose players — tokens land on each player’s own account.',
  },
  {
    id: 'coach',
    label: 'A coach',
    blurb: 'Tokens go to the coach personally, for analyzing their own shots or uploading for players.',
  },
]

/**
 * The organization's token hub: buying (tier-rate pricing) and one unified
 * send flow that reaches players (team-first: pick the team, then the
 * players on it) or a coach — built to stay usable with many teams. The
 * "where are my tokens?" breakdown lives in <OrgTokenDistribution> beside it.
 */
export default function OrgTokenPanel({
  balance,
  players,
  coaches,
  teams,
  tier,
}: {
  balance: number
  players: OrgPlayerOpt[]
  coaches: OrgCoachOpt[]
  teams: OrgTeamOpt[]
  /** The organization plan, which sets both the rate and the ladder. */
  tier: OrgTier
}) {
  const router = useRouter()
  const inApp = useIsInApp()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ── Buy ──────────────────────────────────────────────────────────
  const [buyQty, setBuyQty] = useState(10)
  const [customQty, setCustomQty] = useState('')

  // ── Send ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState<SendMode>('players')
  const [search, setSearch] = useState('')
  // The picker owns its own team/search state; it tells us the team so the
  // confirmation can name it.
  const [playerTeamId, setPlayerTeamId] = useState(teams.length === 1 ? teams[0].id : '')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [tokensEach, setTokensEach] = useState(1)
  const [sendCoachEmail, setSendCoachEmail] = useState('') // No preselection: sending credits to the wrong coach is easy to miss.
  const [sendQty, setSendQty] = useState(1)

  // Every organization gets the team rate — no roster minimum, nothing to unlock.
  const buyTotal = usd(orderPricing(tier, buyQty).totalCents)

  const pickedTeam = teams.find(t => t.id === playerTeamId) ?? null

  const filteredCoaches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? coaches.filter(c => c.label.toLowerCase().includes(q)) : coaches
  }, [coaches, search])

  const sendTotal = mode === 'players' ? selectedPlayerIds.size * Math.max(1, tokensEach) : Math.max(1, sendQty)
  const notEnough = sendTotal > balance
  const canSend =
    !busy &&
    !notEnough &&
    balance > 0 &&
    (mode === 'players' ? selectedPlayerIds.size > 0 : !!sendCoachEmail)

  async function buyTokens() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/org/buy-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: Math.max(1, buyQty) }),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
      setMsg({ ok: false, text: data.error || 'Could not start checkout' })
    } catch { setMsg({ ok: false, text: 'Something went wrong. Please try again.' }) }
    setBusy(false)
  }

  async function post(url: string, body: unknown, okText: string) {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ ok: false, text: data.error || 'Something went wrong' }); setBusy(false); return }
      setMsg({ ok: true, text: okText })
      router.refresh()
    } catch { setMsg({ ok: false, text: 'Something went wrong. Please try again.' }) }
    setBusy(false)
  }

  function send() {
    if (mode === 'players') {
      const ids = [...selectedPlayerIds]
      const each = Math.max(1, tokensEach)
      post(
        '/api/org/assign-balance-tokens',
        { playerUserIds: ids, tokensEach: each },
        `Sent ${each} token${each !== 1 ? 's' : ''} to ${ids.length} player${ids.length !== 1 ? 's' : ''}${pickedTeam ? ` on ${pickedTeam.name}` : ''}.`,
      )
      setSelectedPlayerIds(new Set())
    } else {
      const coach = coaches.find(c => c.email === sendCoachEmail)
      post(
        '/api/org/give-coach-credits',
        { coachEmail: sendCoachEmail, quantity: Math.max(1, sendQty) },
        `Sent ${Math.max(1, sendQty)} token${Math.max(1, sendQty) === 1 ? '' : 's'} to ${coach?.label ?? 'the coach'}.`,
      )
    }
  }

  const activeBlurb = SEND_MODES.find(m => m.id === mode)?.blurb

  return (
    <div className="space-y-4">
      {/* ── Send tokens ──────────────────────────────────────────── */}
      <div id="send-tokens" className="bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-4 scroll-mt-24">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-chalk">Send tokens</h3>
          <p className="text-sm text-gray-500 dark:text-chalk-dim mt-0.5">
            Move your organization tokens to the people who&apos;ll use them.
          </p>
        </div>

        {/* Destination segmented control */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Send to">
          {SEND_MODES.map(m => {
            const active = mode === m.id
            const Icon = m.id === 'players' ? UsersIcon : UserIcon
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { setMode(m.id); setSearch(''); setMsg(null) }}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-ember-500 bg-ember-50 dark:bg-ember-500/15 text-ember-700 dark:text-ember-400'
                    : 'border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 text-gray-600 dark:text-chalk-dim hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {m.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 dark:text-chalk-dim -mt-1">{activeBlurb}</p>

        {/* Search — shown whenever the list can grow long */}
        {mode === 'coach' && coaches.length > 6 && (
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search coaches…"
              className="w-full border border-gray-200 dark:border-courtline rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-chalk dark:bg-ink-900 placeholder:text-gray-400 focus:outline-none focus:border-ember-500"
            />
          </div>
        )}

        {/* Recipient list */}
        {mode === 'players' && (
          <OrgPlayerPicker
            teams={teams}
            players={players}
            selected={selectedPlayerIds}
            onChange={setSelectedPlayerIds}
            onTeamChange={id => { setPlayerTeamId(id); setMsg(null) }}
          />
        )}

        {mode === 'coach' && (
          coaches.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-chalk-dim">No coaches yet — add a team with a coach in the Teams tab.</p>
          ) : (
            <div className="border border-gray-200 dark:border-courtline rounded-xl max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-courtline">
              {filteredCoaches.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-chalk-dim px-4 py-4">No coaches match &ldquo;{search}&rdquo;.</p>
              )}
              {filteredCoaches.map(c => (
                <label key={c.email} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-800">
                  <input
                    type="radio"
                    name="send-coach"
                    checked={sendCoachEmail === c.email}
                    onChange={() => setSendCoachEmail(c.email)}
                    className="w-4 h-4 accent-ember-500 shrink-0"
                  />
                  <span className="text-sm text-gray-900 dark:text-chalk truncate">{c.label}</span>
                </label>
              ))}
            </div>
          )
        )}

        {/* Amount + summary + send */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-chalk-dim">
            {mode === 'players' ? 'Tokens per player' : 'Amount'}
            <input
              type="number"
              min={1}
              value={(mode === 'players' ? tokensEach : sendQty) || ''}
              onChange={e => {
                const n = parseInt(e.target.value)
                const v = Number.isNaN(n) ? 0 : Math.min(10000, Math.max(0, n))
                if (mode === 'players') setTokensEach(v)
                else setSendQty(v)
              }}
              onBlur={() => {
                if (mode === 'players' && tokensEach < 1) setTokensEach(1)
                if (mode !== 'players' && sendQty < 1) setSendQty(1)
              }}
              className="w-20 border border-gray-200 dark:border-courtline rounded-xl px-2 py-2 text-center text-gray-900 dark:text-chalk dark:bg-ink-900 text-sm focus:outline-none focus:border-ember-500"
            />
          </label>
          <span className="text-sm text-gray-500 dark:text-chalk-dim flex-1 min-w-0">
            {mode === 'players' && selectedPlayerIds.size > 0 && (
              <>Total <span className="font-semibold text-gray-900 dark:text-chalk tabular-nums">{sendTotal}</span> of your {balance} organization tokens</>
            )}
            {mode !== 'players' && !sendCoachEmail && coaches.length > 0 && <>Pick a coach above</>}
            {mode !== 'players' && !!sendCoachEmail && (
              <>From your <span className="font-semibold text-gray-900 dark:text-chalk tabular-nums">{balance}</span> organization tokens</>
            )}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>

        {notEnough && (
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Not enough tokens — this send needs {sendTotal}, you have {balance}.
          </p>
        )}
        {balance === 0 && !notEnough && (
          <p className="text-sm text-gray-500 dark:text-chalk-dim">
            You have no organization tokens{inApp ? '.' : ' — buy tokens below first.'}
          </p>
        )}
        {msg && (
          <p className={`text-sm font-medium ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>
        )}
      </div>

      {/* ── Buy tokens — hidden in the iOS app (guideline 3.1.1) ─── */}
      {!inApp && (
        <div id="buy-tokens" className="bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-4 scroll-mt-24">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-chalk">Buy tokens</h3>
            <p className="text-sm text-gray-500 dark:text-chalk-dim mt-0.5">
              Purchases land in your organization tokens — send them out whenever you&apos;re ready.
              Card, Apple Pay, and Google Pay are accepted at checkout.
            </p>
          </div>

          {/* Quantity selector — quick picks, then a clearly-labelled custom box */}
          <div className="space-y-2">
            <div className="flex gap-2">
              {[5, 10, 25].map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setBuyQty(q); setCustomQty('') }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    buyQty === q && !customQty
                      ? 'bg-ember-500 text-ink-950 border-ember-500'
                      : 'bg-white dark:bg-ink-900 text-gray-900 dark:text-chalk border-gray-200 dark:border-courtline hover:border-ember-400'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={MAX_TOKENS_PER_ORDER}
              value={customQty}
              onChange={e => {
                const v = e.target.value
                setCustomQty(v)
                const n = parseInt(v)
                if (!Number.isNaN(n)) setBuyQty(Math.min(MAX_TOKENS_PER_ORDER, Math.max(1, n)))
              }}
              onFocus={e => e.target.select()}
              placeholder="Or enter a custom amount…"
              aria-label="Custom token amount"
              className="w-full py-2.5 px-3 border border-gray-200 dark:border-courtline rounded-xl text-gray-900 dark:text-chalk dark:bg-ink-900 text-sm placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:border-ember-500"
            />
          </div>

          <p className="text-xs text-green-600 dark:text-green-400 font-semibold px-1">
            Org bulk rate — {usd(ORG_BULK_PRICE_CENTS)} each on {ORG_BULK_MIN_QTY}+ tokens (website only).
            Smaller orders use regular pricing: {usd(REGULAR_ANALYSIS_PRICE_CENTS)} each, {usd(REGULAR_VOLUME_PRICE_CENTS)} each at {REGULAR_VOLUME_MIN_QTY}+.
          </p>

          <VolumeTierList tier={tier} className="px-1" />

          <VolumeSavings
            tier={tier}
            quantity={buyQty}
            label="token"
            onJump={setBuyQty}
          />

          <button
            type="button"
            onClick={buyTokens}
            disabled={busy}
            className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-semibold py-3 rounded-xl transition-colors"
          >
            {busy ? 'Redirecting to checkout…' : `Buy ${buyQty} token${buyQty !== 1 ? 's' : ''} — ${buyTotal}`}
          </button>
        </div>
      )}
    </div>
  )
}
