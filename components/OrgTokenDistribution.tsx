'use client'

import { useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, UserIcon, WalletIcon } from 'lucide-react'

export interface DistPlayer {
  id: string
  label: string
  tokens: number
}

export interface DistTeam {
  id: string
  name: string
  ageGroup: string | null
  credits: number
  tokenPool: number
  players: DistPlayer[]
}

export interface DistCoach {
  email: string
  label: string
  credits: number
}

/**
 * "Where are my tokens?" — a collapsed-by-default breakdown of every token
 * the organization has distributed: each team's shared credits and pool,
 * every player holding tokens, and coaches with personal credits. Kept
 * separate from the org's own balance so the two never blur together.
 */
export default function OrgTokenDistribution({
  id,
  teams,
  coaches,
  open,
  onOpenChange,
}: {
  id?: string
  teams: DistTeam[]
  coaches: DistCoach[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)

  const coachesWithCredits = coaches.filter(c => c.credits > 0)
  const totalCoachCredits = coachesWithCredits.reduce((s, c) => s + c.credits, 0)
  const totalTeamCredits = teams.reduce((s, t) => s + t.credits, 0)
  const totalPool = teams.reduce((s, t) => s + t.tokenPool, 0)
  const totalPlayerTokens = teams.reduce((s, t) => s + t.players.reduce((ps, p) => ps + p.tokens, 0), 0)
  const totalDistributed = totalTeamCredits + totalPool + totalPlayerTokens + totalCoachCredits

  return (
    <div id={id} className="bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl overflow-hidden scroll-mt-24">
      {/* Header — always visible; the details stay behind a click */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-ink-800 transition-colors"
      >
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-chalk">In your organization</h3>
          <p className="text-sm text-gray-500 dark:text-chalk-dim mt-0.5">
            {totalDistributed === 0
              ? 'Nothing distributed yet — every token you own is in your balance.'
              : `${totalDistributed} token${totalDistributed !== 1 ? 's' : ''} out with your teams, players, and coaches.`}
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-ember-600 dark:text-ember-400">
          <span className="text-xl font-bold text-gray-900 dark:text-chalk tabular-nums">{totalDistributed}</span>
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-200 dark:border-courtline">
          {/* Totals strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 dark:border-courtline bg-gray-50/60 dark:bg-ink-950/40">
            {[
              { label: 'Player tokens', value: totalPlayerTokens },
              { label: 'Team credits', value: totalTeamCredits },
              { label: 'Team pools', value: totalPool },
              { label: 'Coach credits', value: totalCoachCredits },
            ].map(s => (
              <div key={s.label} className="px-4 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{s.label}</p>
                <p className="text-sm font-bold text-gray-900 dark:text-chalk tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Teams — click a team to see exactly which players hold tokens */}
          {teams.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4">No teams yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-courtline">
              {teams.map(t => {
                const holders = t.players.filter(p => p.tokens > 0).sort((a, b) => b.tokens - a.tokens)
                const teamPlayerTokens = holders.reduce((s, p) => s + p.tokens, 0)
                const teamTotal = t.credits + t.tokenPool + teamPlayerTokens
                const isOpen = expandedTeam === t.id
                return (
                  <div key={t.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedTeam(isOpen ? null : t.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-ink-800 transition-colors"
                    >
                      <ChevronRightIcon
                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        aria-hidden
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-chalk truncate">
                          {t.name}{t.ageGroup ? ` · ${t.ageGroup}` : ''}
                        </span>
                        <span className="block text-xs text-gray-500 truncate">
                          {t.credits} shared · {t.tokenPool} in pool · {teamPlayerTokens} with players
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-gray-900 dark:text-chalk tabular-nums">{teamTotal}</span>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-3 pl-12">
                        {holders.length === 0 ? (
                          <p className="text-sm text-gray-400 py-1.5">No players on this team hold tokens.</p>
                        ) : (
                          <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 dark:divide-courtline">
                            {holders.map(p => (
                              <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="text-sm text-gray-900 dark:text-chalk truncate">{p.label}</span>
                                <span className="shrink-0 text-xs font-semibold bg-gray-100 dark:bg-ink-800 text-gray-700 dark:text-chalk-dim px-2 py-0.5 rounded-full tabular-nums">
                                  {p.tokens} token{p.tokens !== 1 ? 's' : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {t.players.length > holders.length && (
                          <p className="text-xs text-gray-400 mt-1.5">
                            {t.players.length - holders.length} player{t.players.length - holders.length !== 1 ? 's' : ''} with no tokens.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Coaches holding personal credits */}
          {coachesWithCredits.length > 0 && (
            <div className="border-t border-gray-100 dark:border-courtline">
              <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Coaches with personal credits
              </p>
              <div className="divide-y divide-gray-100 dark:divide-courtline">
                {coachesWithCredits.map(c => (
                  <div key={c.email} className="flex items-center gap-3 px-5 py-2.5">
                    <UserIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                    <span className="flex-1 min-w-0 text-sm text-gray-900 dark:text-chalk truncate">{c.label}</span>
                    <span className="shrink-0 text-xs font-semibold bg-gray-100 dark:bg-ink-800 text-gray-700 dark:text-chalk-dim px-2 py-0.5 rounded-full tabular-nums">
                      {c.credits} credit{c.credits !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="px-5 py-3 text-xs text-gray-400 border-t border-gray-100 dark:border-courtline flex items-center gap-1.5">
            <WalletIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
            These balances belong to your teams, players, and coaches — separate from your own balance.
            Coaches can return unused credits to you from their team dashboard.
          </p>
        </div>
      )}
    </div>
  )
}
