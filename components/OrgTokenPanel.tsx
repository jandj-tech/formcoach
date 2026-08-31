'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import { SearchIcon, UsersIcon, WalletIcon, UserIcon } from 'lucide-react'
import VolumeSavings, { VolumeTierList } from '@/components/VolumeSavings'
import {
  orderPricing,
  usd,
  MAX_TOKENS_PER_ORDER,
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
  credits: number
}

type SendMode = 'players' | 'team' | 'coach'

const SEND_MODES: Array<{ id: SendMode; label: string; blurb: string }> = [
  {
    id: 'players',
    label: 'Players',
    blurb: 'Tokens land on each player’s own account — they use them to analyze their own shots.',
  },
  {
    id: 'team',
    label: 'A team',
    blurb: 'Credits go into the team’s shared balance. Its coaches spend them on player uploads or hand them out — you keep full access.',
  },
  {
    id: 'coach',
    label: 'A coach',
    blurb: 'Credits go to the coach personally, for analyzing their own shots or uploading for players.',
  },
]

/**
 * The organization's token hub: balance overview, buying (tier-rate pricing),
 * and one unified send flow that reaches players directly, a team's shared
 * balance, or a coach — searchable and built to stay usable with many teams
 * and players.
 */
export default function OrgTokenPanel({
  balance,
  players,
  coaches,
  teams,
  totalPlayerTokens,
  totalTeamCredits,
  tier,
}: {
  balance: number
  players: OrgPlayerOpt[]
  coaches: OrgCoachOpt[]
  teams: OrgTeamOpt[]
  totalPlayerTokens: number
  totalTeamCredits: number
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
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [tokensEach, setTokensEach] = useState(1)
  const [sendTeamId, setSendTeamId] = useState(teams[0]?.id ?? '')
  const [sendCoachEmail, setSendCoachEmail] = useState(coaches[0]?.email ?? '')
  const [sendQty, setSendQty] = useState(1)

  // Every organization gets the team rate — no roster minimum, nothing to unlock.
  const buyTotal = usd(orderPricing(tier, buyQty).totalCents)

  // Players grouped by team, filtered by the search box. Matches on the
  // player's name or their team name so "U15" narrows to one squad.
  const playerGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? players.filter(p => p.label.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      : players
    const groups = new Map<string, { teamId: string; team: string; players: OrgPlayerOpt[] }>()
    for (const p of filtered) {
      const g = groups.get(p.teamId)
      if (g) g.players.push(p)
      else groups.set(p.teamId, { teamId: p.teamId, team: p.team, players: [p] })
    }
    return [...groups.values()]
  }, [players, search])

  const visiblePlayerIds = useMemo(
    () => playerGroups.flatMap(g => g.players.map(p => p.id)),
    [playerGroups],
  )

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? teams.filter(t => t.name.toLowerCase().includes(q)) : teams
  }, [teams, search])

  const filteredCoaches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? coaches.filter(c => c.label.toLowerCase().includes(q)) : coaches
  }, [coaches, search])

  function togglePlayer(id: string) {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(ids: string[]) {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev)
      const allOn = ids.every(id => next.has(id))
      for (const id of ids) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const sendTotal = mode === 'players' ? selectedPlayerIds.size * Math.max(1, tokensEach) : Math.max(1, sendQty)
  const notEnough = sendTotal > balance
  const canSend =
    !busy &&
    !notEnough &&
    balance > 0 &&
    (mode === 'players' ? selectedPlayerIds.size > 0 : mode === 'team' ? !!sendTeamId : !!sendCoachEmail)

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
        `Sent ${each} token${each !== 1 ? 's' : ''} to ${ids.length} player${ids.length !== 1 ? 's' : ''}.`,
      )
      setSelectedPlayerIds(new Set())
    } else if (mode === 'team') {
      const team = teams.find(t => t.id === sendTeamId)
      post(
        '/api/org/allocate-team-credits',
        { teamId: sendTeamId, quantity: Math.max(1, sendQty) },
        `Sent ${Math.max(1, sendQty)} credits to ${team?.name ?? 'the team'}’s shared balance.`,
      )
    } else {
      const coach = coaches.find(c => c.email === sendCoachEmail)
      post(
        '/api/org/give-coach-credits',
        { coachEmail: sendCoachEmail, quantity: Math.max(1, sendQty) },
        `Sent ${Math.max(1, sendQty)} personal credits to ${coach?.label ?? 'the coach'}.`,
      )
    }
  }

  const activeBlurb = SEND_MODES.find(m => m.id === mode)?.blurb

  return (
    <div className="space-y-4">
      {/* ── Balance overview ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Unassigned balance', value: balance, hint: 'Tokens you’ve bought but not sent anywhere yet' },
          { label: 'With players', value: totalPlayerTokens, hint: 'Tokens sitting on player accounts' },
          { label: 'With teams', value: totalTeamCredits, hint: 'Shared credits across your teams' },
        ].map(s => (
          <div key={s.label} className="bg-ember-50 dark:bg-ember-500/10 border border-ember-200 dark:border-courtline rounded-2xl px-4 py-3" title={s.hint}>
            <p className="text-xs font-medium text-gray-500 dark:text-chalk-dim">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-chalk tabular-nums mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Send tokens ──────────────────────────────────────────── */}
      <div id="send-tokens" className="bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-4 scroll-mt-24">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-chalk">Send tokens</h3>
          <p className="text-sm text-gray-500 dark:text-chalk-dim mt-0.5">
            Move tokens from your balance to the people who&apos;ll use them.
          </p>
        </div>

        {/* Destination segmented control */}
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Send to">
          {SEND_MODES.map(m => {
            const active = mode === m.id
            const Icon = m.id === 'players' ? UsersIcon : m.id === 'team' ? WalletIcon : UserIcon
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
        {((mode === 'players' && players.length > 6) ||
          (mode === 'team' && teams.length > 6) ||
          (mode === 'coach' && coaches.length > 6)) && (
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={mode === 'players' ? 'Search players or teams…' : mode === 'team' ? 'Search teams…' : 'Search coaches…'}
              className="w-full border border-gray-200 dark:border-courtline rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-chalk dark:bg-ink-900 placeholder:text-gray-400 focus:outline-none focus:border-ember-500"
            />
          </div>
        )}

        {/* Recipient list */}
        {mode === 'players' && (
          players.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-chalk-dim">No players have joined your teams yet.</p>
          ) : (
            <div className="border border-gray-200 dark:border-courtline rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-ink-950/60 border-b border-gray-200 dark:border-courtline">
                <span className="text-xs font-medium text-gray-500 dark:text-chalk-dim">
                  {selectedPlayerIds.size} of {players.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => toggleGroup(visiblePlayerIds)}
                  className="text-xs font-semibold text-ember-600 hover:text-ember-500 dark:text-ember-400"
                >
                  {visiblePlayerIds.length > 0 && visiblePlayerIds.every(id => selectedPlayerIds.has(id))
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-courtline">
                {playerGroups.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-chalk-dim px-4 py-4">No players match &ldquo;{search}&rdquo;.</p>
                )}
                {playerGroups.map(g => {
                  const ids = g.players.map(p => p.id)
                  const allOn = ids.every(id => selectedPlayerIds.has(id))
                  return (
                    <div key={g.teamId}>
                      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50/60 dark:bg-ink-950/40">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-chalk-dim">{g.team}</span>
                        <button
                          type="button"
                          onClick={() => toggleGroup(ids)}
                          className="text-[11px] font-semibold text-ember-600 hover:text-ember-500 dark:text-ember-400"
                        >
                          {allOn ? 'Deselect team' : 'Select team'}
                        </button>
                      </div>
                      {g.players.map(p => (
                        <label key={p.id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-800">
                          <input
                            type="checkbox"
                            checked={selectedPlayerIds.has(p.id)}
                            onChange={() => togglePlayer(p.id)}
                            className="w-4 h-4 accent-ember-500 shrink-0"
                          />
                          <span className="text-sm text-gray-900 dark:text-chalk">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {mode === 'team' && (
          teams.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-chalk-dim">No teams yet — add one in the Teams tab.</p>
          ) : (
            <div className="border border-gray-200 dark:border-courtline rounded-xl max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-courtline">
              {filteredTeams.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-chalk-dim px-4 py-4">No teams match &ldquo;{search}&rdquo;.</p>
              )}
              {filteredTeams.map(t => (
                <label key={t.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-800">
                  <input
                    type="radio"
                    name="send-team"
                    checked={sendTeamId === t.id}
                    onChange={() => setSendTeamId(t.id)}
                    className="w-4 h-4 accent-ember-500 shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 dark:text-chalk truncate">
                      {t.name}{t.ageGroup ? ` · ${t.ageGroup}` : ''}
                    </span>
                    <span className="block text-xs text-gray-400 dark:text-chalk-dim truncate">
                      {t.memberCount} player{t.memberCount !== 1 ? 's' : ''} · coach {t.coachName}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-chalk-dim tabular-nums">{t.credits} credit{t.credits !== 1 ? 's' : ''}</span>
                </label>
              ))}
            </div>
          )
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
              <>Total <span className="font-semibold text-gray-900 dark:text-chalk tabular-nums">{sendTotal}</span> of your {balance}</>
            )}
            {mode !== 'players' && (
              <>From your balance of <span className="font-semibold text-gray-900 dark:text-chalk tabular-nums">{balance}</span></>
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
            Your balance is empty{inApp ? '.' : ' — buy tokens below first.'}
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
              Purchases land in your unassigned balance — send them out whenever you&apos;re ready.
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

          <p className="text-xs text-green-600 dark:text-green-400 font-semibold px-1">Team rate — $2.49 each, $1.49 when you buy 5+</p>

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
