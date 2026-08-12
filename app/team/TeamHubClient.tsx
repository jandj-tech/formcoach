'use client'

import { useState } from 'react'
import Link from 'next/link'
import HubSection from '@/components/HubSection'
import TeamChatPanel from '@/components/TeamChatPanel'
import TeamSchedulePanel from '@/components/TeamSchedulePanel'

export interface HubTeam {
  id: string
  name: string
  accessCode: string
  memberCount: number
  coaches: string[]
  players: string[]
}

function TeamHubBody({
  team,
  eyebrow,
}: {
  team: HubTeam
  eyebrow: string
}) {
  // BIG team name, last word in the ember gradient.
  const words = team.name.trim().split(/\s+/)
  const lastWord = words[words.length - 1]
  const leadWords = words.slice(0, -1).join(' ')

  return (
    <div className="space-y-4">
      {/* Hero — the team name IS the headline */}
      <div className="pb-2">
        <p className="eyebrow text-ember-400 select-none">{eyebrow}</p>
        {/* One line, always — long team names render smaller so the whole
            name still fits, with an ellipsis as the last resort. */}
        <h1
          className={`font-display font-black uppercase leading-tight mt-1 truncate ${
            team.name.length > 24
              ? 'text-[clamp(1.3rem,3.6vw,2.2rem)]'
              : 'text-[clamp(1.9rem,5.5vw,3.2rem)]'
          }`}
        >
          {leadWords && <>{leadWords} </>}
          <span className="text-gradient-ember">{lastWord}</span>
        </h1>
        <p className="text-chalk-dim text-sm font-mono mt-3">
          Team code {team.accessCode} · {team.memberCount} player{team.memberCount === 1 ? '' : 's'}
          {team.coaches[0] ? ` · Coach ${team.coaches[0]}` : ''}
        </p>
      </div>

      {/* Schedule — the everyday section, open by default and visually dominant */}
      <HubSection icon="📅" label="Schedule" defaultOpen>
        <TeamSchedulePanel teamId={team.id} theme="dark" />
      </HubSection>

      {/* Roster — coaches first with a COACH mini-badge, then player chips */}
      <HubSection icon="👥" label="Roster" summary={`${team.memberCount} player${team.memberCount === 1 ? '' : 's'}`}>
        {team.coaches.length === 0 && team.players.length === 0 ? (
          <p className="text-chalk-dim text-sm">No players have joined yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {team.coaches.map((c, i) => (
              <span
                key={`coach-${c}-${i}`}
                className="bg-ink-950 border border-courtline rounded-full px-3 py-1.5 text-xs font-semibold text-chalk inline-flex items-center gap-1.5"
              >
                {c}
                <span className="bg-ember-500 text-ink-950 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none">
                  Coach
                </span>
              </span>
            ))}
            {team.players.map((p, i) => (
              <span
                key={`player-${p}-${i}`}
                className="bg-ink-950 border border-courtline rounded-full px-3 py-1.5 text-xs font-semibold text-chalk"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </HubSection>

      {/* Leaderboard — a link row, not an embed. It lives where it lives. */}
      <Link
        href={`/dashboard/leaderboard?team=${team.id}`}
        className="w-full bg-ink-900 border border-courtline rounded-2xl px-5 py-4 flex items-center justify-between gap-3 hover:border-chalk-dim/40 transition-colors"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden className="text-lg leading-none select-none">🏆</span>
          <span className="font-display font-bold uppercase text-chalk tracking-wide">Leaderboard</span>
        </span>
        <span aria-hidden className="text-chalk-dim font-bold select-none">→</span>
      </Link>

      {/* Chat — always last, closed on load; expands large and owns the
          viewport when opened. The white island inside dark is the shipped
          pattern for the light-themed TeamChatPanel. */}
      <HubSection icon="💬" label="Chat" summary="Talk to your team" scrollOnOpen>
        <div className="min-h-[70vh] bg-white rounded-xl p-4">
          <TeamChatPanel teamId={team.id} tall />
        </div>
      </HubSection>
    </div>
  )
}

// Signed-in /team hub. Multiple teams get a pill switcher under the hero;
// everything scopes to the selected team. keyed TeamHubBody remounts per team
// so schedule/chat state never bleeds across teams.
export default function TeamHubClient({ teams }: { teams: HubTeam[] }) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? '')
  const team = teams.find(t => t.id === selectedId) ?? teams[0]
  if (!team) return null

  const eyebrow = 'Your team'

  return (
    <div>
      {/* Team switcher — sticky so switching is one tap from anywhere on the page */}
      {teams.length > 1 && (
        <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-ink-950/95 backdrop-blur border-b border-courtline mb-5">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="eyebrow text-chalk-dim shrink-0 select-none">Switch team</span>
            {teams.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                aria-pressed={t.id === team.id}
                className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-bold border transition-colors ${
                  t.id === team.id
                    ? 'bg-ember-500 border-ember-500 text-ink-950'
                    : 'border-courtline text-chalk hover:border-ember-400 hover:text-ember-400'
                }`}
              >
                {t.name}
                <span className={`ml-2 text-xs font-semibold ${t.id === team.id ? 'text-ink-950/70' : 'text-chalk-dim'}`}>
                  {t.memberCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <TeamHubBody key={team.id} team={team} eyebrow={eyebrow} />
    </div>
  )
}
