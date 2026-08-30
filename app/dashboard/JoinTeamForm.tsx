'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightIcon, UsersIcon } from 'lucide-react'

/**
 * Code entry that hands off to the invite front door at /join/<code>.
 *
 * It used to POST /api/team/join itself, which made it a second, worse copy of
 * the same flow: it could not set a player's name, so anyone who had not
 * already filled that in was told to "set your name in the Settings tab first"
 * and sent away mid-join. It also joined blind — you found out which team the
 * code belonged to only after you were on it.
 *
 * Now both doors lead to the same place. /join shows the team first, asks for
 * a name only when we don't have one, and works the same whether the player
 * arrived from a shared link or typed six letters in here.
 */
export default function JoinTeamForm({ variant = 'inline' }: { variant?: 'inline' | 'empty' }) {
  const router = useRouter()
  const [teamCode, setTeamCode] = useState('')
  const code = teamCode.trim().toUpperCase()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code) return
    router.push(`/join/${encodeURIComponent(code)}`)
  }

  const field = (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="text"
        required
        aria-label="Team code"
        placeholder="Team code"
        value={teamCode}
        onChange={e => setTeamCode(e.target.value.toUpperCase())}
        className="flex-1 min-w-0 bg-white dark:bg-ink-950 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 dark:placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors font-mono tracking-[0.2em] uppercase"
      />
      <button
        type="submit"
        disabled={!code}
        className="inline-flex items-center gap-1.5 shrink-0 bg-ember-500 hover:bg-ember-600 disabled:opacity-40 disabled:hover:bg-ember-500 text-ink-950 font-bold px-5 py-3 rounded-xl transition-colors"
      >
        Continue
        <ArrowRightIcon aria-hidden className="w-4 h-4" />
      </button>
    </form>
  )

  if (variant === 'inline') return field

  // Empty state: this player is on no team at all, so joining one is the whole
  // point of the screen rather than a footnote under a list of teams.
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-courtline p-6 text-center">
      <UsersIcon aria-hidden className="w-8 h-8 mx-auto text-gray-300 dark:text-chalk-dim" />
      <h2 className="mt-3 text-lg font-black text-black dark:text-chalk">Join your team</h2>
      <p className="mt-1.5 text-sm text-gray-600 dark:text-chalk-dim leading-relaxed">
        Your coach can send you an invite link, or give you the team code to
        enter here. Once you&apos;re on the roster you&apos;ll see the schedule,
        the leaderboard and any tokens they hand out.
      </p>
      <div className="mt-5 max-w-sm mx-auto text-left">{field}</div>
    </div>
  )
}
