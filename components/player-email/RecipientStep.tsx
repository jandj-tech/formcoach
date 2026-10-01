'use client'

import { useId } from 'react'
import { ChevronDownIcon, SearchIcon, UsersIcon, XIcon } from 'lucide-react'
import StepCard from './StepCard'
import {
  CHECKBOX,
  INPUT,
  blockReason,
  canEmail,
  familyEmailLabel,
  fmtDate,
  pickId,
  plural,
  type AudiencePlayer,
  type AudienceTeam,
  type Duplicate,
  type SenderAs,
} from './types'

// Step 1 — who gets it. Org senders pick teams, then (optionally) trim the
// players inside each; a coach sees only their own team. Every row that can't
// be emailed stays visible, disabled, with the reason in plain words, so a
// missing parent email is noticed here rather than after the send.

function TriCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate: boolean
  disabled?: boolean
  onChange: () => void
  label?: string
}) {
  return (
    <input
      type="checkbox"
      className={CHECKBOX}
      checked={checked}
      disabled={disabled}
      aria-label={label}
      aria-checked={indeterminate ? 'mixed' : checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate
      }}
      onChange={onChange}
    />
  )
}

function matches(p: AudiencePlayer, q: string): boolean {
  if (!q) return true
  return (
    p.name.toLowerCase().includes(q) ||
    (p.email ?? '').toLowerCase().includes(q) ||
    (p.familyOf ?? '').toLowerCase().includes(q)
  )
}

/** Where to fix a missing email, by who is looking and what kind of row it is. */
function noEmailHint(as: SenderAs): string {
  const where = as === 'org' ? 'the Teams tab' : 'the Players tab'
  return ` — to email them, add the player again with an email in ${where} (then remove this name-only entry), or share their join link`
}

function PlayerRow({
  as,
  player,
  selected,
  duplicate,
  disabled,
  onToggle,
}: {
  as: SenderAs
  player: AudiencePlayer
  selected: boolean
  duplicate: Duplicate | undefined
  disabled: boolean
  onToggle: () => void
}) {
  const reason = blockReason(player)
  const can = reason === null
  const inputId = useId()
  const sent = player.resentAt ?? player.sentAt
  const family = familyEmailLabel(player)
  return (
    <li>
      <label
        htmlFor={inputId}
        className={`flex items-start gap-3 px-3 sm:px-4 py-2.5 transition-colors ${
          can ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-800/60' : 'cursor-default'
        }`}
      >
        <input
          id={inputId}
          type="checkbox"
          className={`${CHECKBOX} mt-0.5`}
          checked={can && selected}
          disabled={!can || disabled}
          onChange={onToggle}
          aria-describedby={reason ? `${inputId}-why` : undefined}
        />
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-semibold ${can ? 'text-gray-900 dark:text-chalk' : 'text-gray-500 dark:text-chalk-dim'}`}>
            {player.name}
          </span>
          {player.email ? (
            <span className="block text-xs text-gray-500 dark:text-chalk-dim [overflow-wrap:anywhere]">{player.email}</span>
          ) : null}
          {family && <span className="block text-xs font-medium text-gray-600 dark:text-chalk">{family}</span>}
          {player.setupPending && player.email && (
            <span className="block text-xs text-gray-500 dark:text-chalk-dim">
              Setup incomplete{player.score !== null ? ' · results go out as a “finish setup” email' : ''}
            </span>
          )}
          {player.sameNameAsAnother && player.detail && player.detail !== player.email && (
            <span className="block text-xs text-gray-500 dark:text-chalk-dim">{player.detail}</span>
          )}
          {reason && (
            <span id={`${inputId}-why`} className="block text-xs font-medium text-amber-700 dark:text-amber-400">
              {reason}
              {reason === 'No email on file' ? noEmailHint(as) : ''}
            </span>
          )}
          {duplicate && (
            <span className="block text-xs font-medium text-ember-700 dark:text-ember-400">
              {duplicate.samePerson
                ? `Also on ${duplicate.keptBy.team.name} — gets one email, not two`
                : `Same email as ${duplicate.keptBy.player.name} — only one email goes to this address`}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums text-gray-900 dark:text-chalk">
            {player.score !== null ? player.score.toFixed(1) : <span className="font-normal text-gray-300 dark:text-chalk-dim">—</span>}
          </span>
          <span className="block text-[11px] text-gray-400 dark:text-chalk-dim whitespace-nowrap">
            {player.score === null ? 'No graded shot' : sent ? `Results sent ${fmtDate(sent)}` : 'Results not sent'}
          </span>
        </span>
      </label>
    </li>
  )
}

export default function RecipientStep({
  as,
  teams,
  selected,
  expanded,
  query,
  duplicates,
  recipientCount,
  teamCount,
  disabled,
  onQuery,
  onTogglePlayer,
  onSetTeam,
  onSetAll,
  onToggleExpand,
  onClear,
}: {
  as: SenderAs
  teams: AudienceTeam[]
  selected: ReadonlySet<string>
  expanded: ReadonlySet<string>
  query: string
  duplicates: Duplicate[]
  recipientCount: number
  teamCount: number
  disabled: boolean
  onQuery: (q: string) => void
  onTogglePlayer: (id: string) => void
  onSetTeam: (teamId: string, on: boolean) => void
  onSetAll: (on: boolean) => void
  onToggleExpand: (teamId: string) => void
  onClear: () => void
}) {
  const searchId = useId()
  const q = query.trim().toLowerCase()
  const dupById = new Map(duplicates.map((d) => [d.id, d]))

  const emailable = teams.flatMap((t) => t.players.filter(canEmail).map((p) => pickId(t.id, p.key)))
  const selectedEmailable = emailable.filter((id) => selected.has(id)).length
  const allOn = emailable.length > 0 && selectedEmailable === emailable.length
  const someOn = selectedEmailable > 0 && !allOn
  const totalPlayers = teams.reduce((n, t) => n + t.players.length, 0)

  const samePerson = duplicates.filter((d) => d.samePerson).length
  const sharedAddress = duplicates.length - samePerson

  function teamState(t: AudienceTeam) {
    const ids = t.players.filter(canEmail).map((p) => pickId(t.id, p.key))
    const on = ids.filter((id) => selected.has(id)).length
    return { total: ids.length, on, all: ids.length > 0 && on === ids.length, some: on > 0 && on < ids.length }
  }

  const list = (t: AudienceTeam, players: AudiencePlayer[]) =>
    players.length === 0 ? (
      <p className="px-4 py-4 text-sm text-gray-400 dark:text-chalk-dim">
        {q ? 'No players match your search.' : 'No players on this team yet.'}
      </p>
    ) : (
      <ul className="divide-y divide-gray-100 dark:divide-courtline">
        {players.map((p) => {
          const id = pickId(t.id, p.key)
          return (
            <PlayerRow
              key={id}
              as={as}
              player={p}
              selected={selected.has(id)}
              duplicate={dupById.get(id)}
              disabled={disabled}
              onToggle={() => onTogglePlayer(id)}
            />
          )
        })}
      </ul>
    )

  const visibleTeams = q ? teams.filter((t) => t.players.some((p) => matches(p, q))) : teams

  return (
    <StepCard
      step={1}
      title="Who gets it"
      description={
        as === 'org'
          ? 'Tick the teams to email. You can untick single players inside a team.'
          : 'Everyone on your team who has an email is ticked. Untick anyone who should not get it.'
      }
    >
      {teams.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-chalk-dim">
          {as === 'org' ? 'You have no teams yet. Add one in the Teams tab first.' : 'Your team could not be found.'}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="inline-flex items-center gap-2.5 text-sm font-semibold text-gray-800 dark:text-chalk cursor-pointer select-none">
              <TriCheckbox
                checked={allOn}
                indeterminate={someOn}
                disabled={disabled || emailable.length === 0}
                onChange={() => onSetAll(!allOn)}
              />
              <span>{as === 'org' ? `Select all teams (${teams.length})` : `Select all players (${emailable.length})`}</span>
            </label>
            {totalPlayers > 0 && (
              <div className="relative sm:ml-auto sm:w-72">
                <label htmlFor={searchId} className="sr-only">
                  Search players by name or email
                </label>
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder="Search players"
                  className={`${INPUT} pl-9 py-2`}
                />
              </div>
            )}
          </div>

          {visibleTeams.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 dark:border-courtline px-4 py-6 text-center text-sm text-gray-500 dark:text-chalk-dim">
              No player matches &ldquo;{query.trim()}&rdquo;.
            </p>
          )}

          {as === 'coach'
            ? visibleTeams.map((t) => (
                <div key={t.id} className="rounded-xl border border-gray-200 dark:border-courtline overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2 bg-gray-50 dark:bg-ink-950/60 border-b border-gray-200 dark:border-courtline text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-chalk-dim">
                    <span>{t.name}</span>
                    <span>Latest score</span>
                  </div>
                  {list(t, t.players.filter((p) => matches(p, q)))}
                </div>
              ))
            : visibleTeams.map((t) => {
                const s = teamState(t)
                const open = q ? true : expanded.has(t.id)
                const teamLabel = `${t.name}${t.ageGroup ? ` · ${t.ageGroup}` : ''}`
                return (
                  <div key={t.id} className="rounded-xl border border-gray-200 dark:border-courtline overflow-hidden">
                    <div className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 ${open ? 'bg-gray-50 dark:bg-ink-950/60 border-b border-gray-200 dark:border-courtline' : ''}`}>
                      <TriCheckbox
                        checked={s.all}
                        indeterminate={s.some}
                        disabled={disabled || s.total === 0}
                        onChange={() => onSetTeam(t.id, !s.all)}
                        label={`Email ${teamLabel}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-chalk truncate">{teamLabel}</p>
                        <p className="text-xs text-gray-500 dark:text-chalk-dim">
                          {plural(t.players.length, 'player')}
                          {s.on > 0 ? ` · ${s.on} selected` : ''}
                          {t.players.length - s.total > 0 ? ` · ${t.players.length - s.total} can't get email` : ''}
                        </p>
                      </div>
                      {!q && (
                        <button
                          type="button"
                          onClick={() => onToggleExpand(t.id)}
                          aria-expanded={open}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-chalk-dim dark:hover:text-chalk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400"
                        >
                          <span className="hidden sm:inline">{open ? 'Hide players' : 'Show players'}</span>
                          <span className="sm:hidden">{open ? 'Hide' : 'Show'}</span>
                          <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                        </button>
                      )}
                    </div>
                    {open && list(t, t.players.filter((p) => matches(p, q)))}
                  </div>
                )
              })}

          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-gray-50 dark:bg-ink-950/60 border border-gray-200 dark:border-courtline px-4 py-3"
          >
            <UsersIcon className="w-4 h-4 text-gray-500 dark:text-chalk-dim" aria-hidden />
            <p className="text-sm font-bold text-gray-900 dark:text-chalk">
              {recipientCount === 0
                ? 'No players selected yet'
                : as === 'org'
                  ? `${plural(recipientCount, 'player')} selected across ${plural(teamCount, 'team')}`
                  : `${plural(recipientCount, 'player')} selected`}
            </p>
            {selectedEmailable > 0 && (
              <button
                type="button"
                onClick={onClear}
                disabled={disabled}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-chalk-dim dark:hover:text-chalk"
              >
                <XIcon className="w-3.5 h-3.5" aria-hidden /> Clear
              </button>
            )}
            {(samePerson > 0 || sharedAddress > 0) && (
              <p className="basis-full text-xs text-gray-600 dark:text-chalk-dim">
                {samePerson > 0 && `${plural(samePerson, 'player is', 'players are')} on more than one selected team and will get one email, not two. `}
                {sharedAddress > 0 &&
                  `${plural(sharedAddress, 'player shares', 'players share')} an email address with another selected player (often siblings) — one email goes to each address. Include each player's results to send every child their own.`}
              </p>
            )}
          </div>
        </div>
      )}
    </StepCard>
  )
}
