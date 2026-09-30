'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronRightIcon, SearchIcon } from 'lucide-react'

export interface OrgPickerTeam {
  id: string
  name: string
  coachName: string
  ageGroup: string | null
  memberCount: number
}

export interface OrgPickerPlayer {
  id: string
  label: string
  teamId: string
  /** Shown but can't be ticked (e.g. no account yet). */
  disabled?: boolean
  /** One short line under the name. */
  note?: ReactNode
  /** Colour of the note: muted grey, amber warning, or a calm blue. */
  noteTone?: 'muted' | 'warn' | 'info'
}

const NOTE_TONE: Record<NonNullable<OrgPickerPlayer['noteTone']>, string> = {
  muted: 'text-gray-400 dark:text-chalk-dim',
  warn: 'text-amber-700 dark:text-amber-400',
  info: 'text-sky-700 dark:text-sky-400',
}

/**
 * Team-first player picker: step 1 picks the team, step 2 ticks players on it.
 * Built to stay usable with many teams and long rosters (search appears once a
 * list passes six rows). Selection is controlled by the parent.
 *
 * `keepSelectionAcrossTeams` lets a parent collect players from several teams
 * (memberships); by default switching team clears the ticks (token sends are
 * one team at a time, so a stale tick on a team you can't see is a trap).
 */
export default function OrgPlayerPicker({
  teams,
  players,
  selected,
  onChange,
  keepSelectionAcrossTeams = false,
  emptyTeamText = 'No players have joined this team yet.',
  onTeamChange,
}: {
  teams: OrgPickerTeam[]
  players: OrgPickerPlayer[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  keepSelectionAcrossTeams?: boolean
  emptyTeamText?: string
  onTeamChange?: (teamId: string) => void
}) {
  const [teamId, setTeamId] = useState(teams.length === 1 ? teams[0].id : '')
  const [search, setSearch] = useState('')

  const pickedTeam = teams.find(t => t.id === teamId) ?? null
  const teamPlayersAll = useMemo(() => players.filter(p => p.teamId === teamId), [players, teamId])
  const teamPlayers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? teamPlayersAll.filter(p => p.label.toLowerCase().includes(q)) : teamPlayersAll
  }, [teamPlayersAll, search])
  const visibleSelectable = useMemo(() => teamPlayers.filter(p => !p.disabled).map(p => p.id), [teamPlayers])
  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? teams.filter(t => t.name.toLowerCase().includes(q)) : teams
  }, [teams, search])

  const selectedOnTeam = teamPlayersAll.filter(p => selected.has(p.id)).length
  const selectedPerTeam = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of players) if (selected.has(p.id)) m.set(p.teamId, (m.get(p.teamId) ?? 0) + 1)
    return m
  }, [players, selected])

  function pickTeam(id: string) {
    setTeamId(id)
    setSearch('')
    if (!keepSelectionAcrossTeams) onChange(new Set())
    onTeamChange?.(id)
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  function toggleGroup(ids: string[]) {
    const next = new Set(selected)
    const allOn = ids.every(id => next.has(id))
    for (const id of ids) {
      if (allOn) next.delete(id)
      else next.add(id)
    }
    onChange(next)
  }

  const showSearch = teamId ? teamPlayersAll.length > 6 : teams.length > 6

  if (teams.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-chalk-dim">No teams yet — add one in the Teams tab.</p>
  }

  return (
    <div className="space-y-3">
      {showSearch && (
        <div className="relative">
          <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={teamId ? 'Search players…' : 'Search teams…'}
            className="w-full border border-gray-200 dark:border-courtline rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-chalk dark:bg-ink-900 placeholder:text-gray-400 focus:outline-none focus:border-ember-500"
          />
        </div>
      )}

      {!teamId ? (
        /* Step 1 — pick the team */
        <div className="border border-gray-200 dark:border-courtline rounded-xl max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-courtline">
          {filteredTeams.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-chalk-dim px-4 py-4">No teams match &ldquo;{search}&rdquo;.</p>
          )}
          {filteredTeams.map(t => {
            const n = selectedPerTeam.get(t.id) ?? 0
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTeam(t.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-ink-800 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-chalk truncate">
                    {t.name}{t.ageGroup ? ` · ${t.ageGroup}` : ''}
                  </span>
                  <span className="block text-xs text-gray-400 dark:text-chalk-dim truncate">
                    {t.memberCount} player{t.memberCount !== 1 ? 's' : ''} · coach {t.coachName}
                  </span>
                </span>
                {keepSelectionAcrossTeams && n > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-ember-700 dark:text-ember-400 tabular-nums">
                    {n} selected
                  </span>
                )}
                <ChevronRightIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
              </button>
            )
          })}
        </div>
      ) : (
        /* Step 2 — pick players on that team */
        <div className="border border-gray-200 dark:border-courtline rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 bg-gray-50 dark:bg-ink-950/60 border-b border-gray-200 dark:border-courtline">
            <span className="text-xs font-medium text-gray-500 dark:text-chalk-dim min-w-0 break-words">
              {pickedTeam?.name ?? 'Team'} · {selectedOnTeam} of {teamPlayersAll.length} selected
            </span>
            <div className="flex items-center gap-3 shrink-0">
              {visibleSelectable.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleGroup(visibleSelectable)}
                  className="text-xs font-semibold text-ember-600 hover:text-ember-500 dark:text-ember-400"
                >
                  {visibleSelectable.every(id => selected.has(id)) ? 'Deselect all' : 'Select all'}
                </button>
              )}
              {teams.length > 1 && (
                <button
                  type="button"
                  onClick={() => pickTeam('')}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-chalk-dim dark:hover:text-chalk"
                >
                  {keepSelectionAcrossTeams ? 'Other teams' : 'Change team'}
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-courtline">
            {teamPlayersAll.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-chalk-dim px-4 py-4">{emptyTeamText}</p>
            )}
            {teamPlayersAll.length > 0 && teamPlayers.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-chalk-dim px-4 py-4">No players match &ldquo;{search}&rdquo;.</p>
            )}
            {teamPlayers.map(p => (
              <label
                key={p.id}
                className={`flex items-start gap-3 px-4 py-2 ${
                  p.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-800'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  disabled={p.disabled}
                  onChange={() => toggle(p.id)}
                  className="w-4 h-4 mt-0.5 accent-ember-500 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-gray-900 dark:text-chalk break-words">{p.label}</span>
                  {p.note && (
                    <span className={`block text-xs mt-0.5 ${NOTE_TONE[p.noteTone ?? 'muted']}`}>{p.note}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
