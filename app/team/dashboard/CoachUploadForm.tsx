'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon } from 'lucide-react'
import VideoUploader from '@/components/VideoUploader'
import type { TeamRosterEntry } from '@/lib/team-roster-refs'

interface Props {
  accessCode: string
  /**
   * Every player on the team as its own row (lib/team-roster-refs.ts):
   * account members, name-only rows and invited players. Each carries the
   * stable `ref` the upload is filed under, so two players with the same
   * name can never be mixed up.
   */
  players: TeamRosterEntry[]
}

export default function CoachUploadForm({ accessCode, players }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<TeamRosterEntry | null>(null)
  const [step, setStep] = useState<'pick' | 'upload' | 'done'>('pick')
  const [resultToken, setResultToken] = useState('')

  const q = search.trim().toLowerCase()
  const filtered = q
    ? players.filter(p => `${p.name} ${p.detail}`.toLowerCase().includes(q))
    : players

  function selectPlayer(p: TeamRosterEntry) {
    if (p.blockedReason) return
    setSelected(p)
    setStep('upload')
  }

  function handleSuccess(_submissionId: string, token: string) {
    // /results/<token> looks up by token; the submission id 404s there.
    setResultToken(token)
    setStep('done')
  }

  function reset() {
    setStep('pick')
    setSelected(null)
    setSearch('')
    setResultToken('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={players.length === 0}
        className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-gray-200 dark:disabled:bg-ink-700 disabled:text-gray-400 dark:disabled:text-chalk-dim disabled:cursor-not-allowed text-ink-950 font-bold py-3 rounded-xl transition-colors"
      >
        {players.length === 0 ? 'Add a player first' : 'Upload a shot for a player'}
      </button>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-4 bg-white dark:bg-ink-900">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 dark:text-chalk">Upload a shot for a player</h3>
        <button onClick={reset} className="text-sm font-semibold text-gray-500 dark:text-chalk-dim hover:text-gray-700 dark:hover:text-chalk">Cancel</button>
      </div>

      {step === 'pick' && (
        <div className="space-y-3">
          <input
            type="search"
            aria-label="Search players"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-2.5 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors text-sm"
          />
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-chalk-dim text-center py-4">No players found</p>
            )}
            {filtered.map(p => (
              <button
                key={p.ref}
                onClick={() => selectPlayer(p)}
                disabled={!!p.blockedReason}
                className="w-full text-left border border-gray-200 dark:border-courtline hover:border-ember-400 disabled:hover:border-gray-200 dark:disabled:hover:border-courtline disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-ink-900 rounded-xl px-4 py-3 transition-colors"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-chalk">{p.name}</p>
                <p className="text-xs text-gray-500 dark:text-chalk-dim">{p.detail}</p>
                {p.blockedReason ? (
                  <p className="text-xs font-semibold text-gray-600 dark:text-chalk-dim">{p.blockedReason}</p>
                ) : p.sameNameAsAnother ? (
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Same name as another player — check the details under the name
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'upload' && selected && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-chalk-dim">
            Uploading for <span className="font-semibold text-gray-900 dark:text-chalk">{selected.name}</span>
            <span className="text-gray-500 dark:text-chalk-dim"> · {selected.detail}</span>
            <button onClick={() => { setStep('pick'); setSelected(null) }} className="ml-2 text-ember-600 dark:text-ember-400 hover:underline text-xs font-semibold">Change</button>
          </p>
          {/* Keyed to the player: VideoUploader's upload callback closes over
              teamMode, so a fresh instance per pick guarantees the shot can
              never go to a previously selected player. */}
          <VideoUploader
            key={selected.ref}
            teamMode={{
              code: accessCode,
              firstName: selected.firstName,
              lastName: selected.lastInitial || '?',
              playerRef: selected.ref,
              onSuccess: handleSuccess,
            }}
          />
        </div>
      )}

      {step === 'done' && selected && (
        <div className="text-center space-y-4 py-4">
          <CheckIcon className="mx-auto h-8 w-8 text-green-600 dark:text-green-400" aria-hidden />
          <p className="font-bold text-gray-900 dark:text-chalk text-lg">Shot uploaded for {selected.name}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/results/${resultToken}`)}
              className="bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              View results
            </button>
            <button
              onClick={() => { setStep('pick'); setSelected(null); setSearch(''); setResultToken(''); router.refresh() }}
              className="bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline hover:border-ember-400 text-black dark:text-chalk font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              Upload another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
