'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ClipboardListIcon } from 'lucide-react'
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

      {/* Flagship program — a featured (not loud) card for the org 10-week
          program; a member may want to bring it to their coach/club. Placed
          under Roster so it never outranks the everyday Schedule section. */}
      <Link
        href="/org/signup"
        className="card-lift w-full bg-ink-900 border border-ember-500/30 hover:border-ember-500/60 rounded-2xl px-5 py-4 flex items-center gap-4 transition-colors"
      >
        <ClipboardListIcon className="w-7 h-7 text-ember-400 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold uppercase text-chalk text-sm leading-tight">
            Run the 10-Week Shooting Development Program
          </p>
          <p className="text-chalk-dim text-xs mt-1">
            Ball, baseline + final AI analysis, a certificate, and a coach&apos;s guide — $40/player.
          </p>
        </div>
        <span className="shrink-0 text-ember-400 font-bold text-lg select-none" aria-hidden>→</span>
      </Link>

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
      <ManageTeams teams={teams} />
    </div>
  )
}

// Small "just in case" management block at the bottom of the hub: join
// another team by code, leave a team you're on, or set up an organization.
// Uses the existing /api/team/join and /api/team/leave endpoints.
function ManageTeams({ teams }: { teams: HubTeam[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function join(e: React.FormEvent) {
    e.preventDefault()
    const teamCode = code.trim().toUpperCase()
    if (!teamCode) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/team/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: 'err', text: data.error || 'Could not join that team.' })
        setBusy(false)
        return
      }
      setCode('')
      setMsg({ kind: 'ok', text: 'Joined! Refreshing your teams…' })
      router.refresh()
    } catch {
      setMsg({ kind: 'err', text: 'Something went wrong. Please try again.' })
    }
    setBusy(false)
  }

  async function leave(teamId: string, name: string) {
    if (!window.confirm(`Leave "${name}"? You can rejoin later with the team code.`)) return
    setLeavingId(teamId)
    setMsg(null)
    try {
      const res = await fetch('/api/team/leave', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: 'err', text: data.error || 'Could not leave that team.' })
        setLeavingId(null)
        return
      }
      router.refresh()
    } catch {
      setMsg({ kind: 'err', text: 'Something went wrong. Please try again.' })
    }
    setLeavingId(null)
  }

  return (
    <div className="mt-8 pt-6 border-t border-courtline">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="eyebrow text-chalk-dim select-none">Manage teams &amp; organizations</span>
        <span className="text-chalk-dim text-lg leading-none">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {/* Join another team by code */}
          <div className="space-y-2">
            <p className="text-chalk text-sm font-bold">Join another team</p>
            <form onSubmit={join} className="flex gap-2">
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Enter a team code"
                aria-label="Team code"
                className="flex-1 bg-ink-800 border border-courtline rounded-xl px-4 py-2.5 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
              />
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="shrink-0 bg-ember-500 hover:bg-ember-400 disabled:opacity-50 text-ink-950 font-bold px-5 py-2.5 rounded-xl transition-colors"
              >
                {busy ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>

          {/* Leave a team you're on */}
          {teams.length > 0 && (
            <div className="space-y-2">
              <p className="text-chalk text-sm font-bold">Leave a team</p>
              <div className="space-y-2">
                {teams.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-3 bg-ink-900 border border-courtline rounded-xl px-4 py-2.5">
                    <span className="text-chalk text-sm truncate">{t.name}</span>
                    <button
                      type="button"
                      onClick={() => leave(t.id, t.name)}
                      disabled={leavingId === t.id}
                      className="shrink-0 text-xs font-bold text-red-400 hover:text-red-300 disabled:opacity-50 border border-red-500/30 hover:border-red-400 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      {leavingId === t.id ? 'Leaving…' : 'Leave'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {msg && (
            <p className={`text-sm ${msg.kind === 'ok' ? 'text-ember-400' : 'text-red-400'}`}>{msg.text}</p>
          )}

          {/* Set up an organization */}
          <div className="flex items-center justify-between gap-3 border border-dashed border-courtline rounded-xl px-4 py-3">
            <div className="min-w-0">
              <p className="text-chalk text-sm font-bold">Run a club or organization?</p>
              <p className="text-chalk-dim text-xs mt-0.5">Set up an org to manage teams, coaches and the 10-week program.</p>
            </div>
            <Link href="/org/signup" className="shrink-0 text-sm font-bold text-ember-400 hover:text-ember-500 transition-colors">
              Set up →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
