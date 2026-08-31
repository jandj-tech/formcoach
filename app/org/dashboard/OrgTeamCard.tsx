'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, MailIcon } from 'lucide-react'
import Section from '@/components/account/Section'
import PanelTabs from '@/components/account/PanelTabs'
import InfoTip from '@/components/InfoTip'
import InlineEdit from '@/components/InlineEdit'
import SortMenu, { type SortOption } from '@/components/SortMenu'
import TokenBalances from '@/components/TokenBalances'
import GiveTokensForm from '@/components/GiveTokensForm'
import LeaderboardTable from '@/components/LeaderboardTable'
import TeamSchedulePanel from '@/components/TeamSchedulePanel'
import TeamChatPanel from '@/components/TeamChatPanel'
import EmailTeamPanel from '@/components/EmailTeamPanel'
import { StatGrid, StatCard } from '@/components/backend/StatGrid'
import { backendButton } from '@/components/backend/button-styles'
import { copyToClipboard } from '@/lib/copy'
import OrgAddCoach from './OrgAddCoach'
import {
  memberDisplayName,
  type ClassPackage,
  type Member,
  type PlayerSortMode,
  type TeamData,
} from './org-team'

const PLAYER_SORT_OPTIONS: SortOption<PlayerSortMode>[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'score-desc', label: 'Highest score' },
  { value: 'score-asc', label: 'Lowest score' },
]

interface Props {
  team: TeamData
  isOpen: boolean
  onToggle: () => void
  /** Inside the iOS app, where digital purchases must use native IAP. */
  inApp: boolean
  /** Origin the signup link is built from. */
  baseUrl: string
  /** The class package this team runs, if any. */
  classPackage: ClassPackage | null
  /** Players ticked for the outreach email — owned by the parent's draft modal. */
  emailSelected: Record<string, boolean>
  onToggleEmailMember: (userId: string) => void
  onDraftEmail: () => void
  onOpenTeam: () => void
  onGoToClassTab: () => void
  onOpenScheduleModal: () => void
  onOpenLeaderboardModal: () => void
  onRemoveHeadCoach: () => void
  onRemoveCoach: (coachId: string, pending: boolean) => void
  onRemovePlayer: (userId: string) => void
  onDeleteTeam: () => void
  removingCoach: string | null
  removingPlayer: string | null
  deletingTeam: boolean
  /** Spends this team's shared credits. Shape is GiveTokensForm's contract. */
  onGiveCredits: (playerUserIds: string[], tokensEach: number) => Promise<{ ok: boolean; text: string }>
  /**
   * Sends the org to checkout. dest is 'team' (shared credits) or 'all' /
   * 'players' (per-player tokens, the ids resolved here). Resolves to an error
   * message, or '' when it redirected.
   */
  onBuy: (dest: string, quantity: number, playerUserIds: string[]) => Promise<string>
  buying: boolean
}

// One team on the org dashboard. Collapsed it is a single scannable row; open,
// it is a header — who the team is, its headline numbers, and the two things
// you most often want to do — above a segmented strip.
//
// The strip replaced a flat stack of fourteen equally-weighted boxes that ran
// past three screens. Nothing was dropped; every block just has a named home
// now. It also means the team chat no longer mounts and fetches for whichever
// team happens to be expanded — PanelTabs defers that until someone opens
// Messages.
export default function OrgTeamCard({
  team,
  isOpen,
  onToggle,
  inApp,
  baseUrl,
  classPackage,
  emailSelected,
  onToggleEmailMember,
  onDraftEmail,
  onOpenTeam,
  onGoToClassTab,
  onOpenScheduleModal,
  onOpenLeaderboardModal,
  onRemoveHeadCoach,
  onRemoveCoach,
  onRemovePlayer,
  onDeleteTeam,
  removingCoach,
  removingPlayer,
  deletingTeam,
  onGiveCredits,
  onBuy,
  buying,
}: Props) {
  const [tab, setTab] = useState('roster')
  const [copiedLink, setCopiedLink] = useState(false)
  const [sort, setSort] = useState<PlayerSortMode>('name')

  // Buy-tokens form. dest is 'all' (whole roster), 'players' (the picks
  // below), or 'team' (the shared coach balance).
  const [dest, setDest] = useState('all')
  const [qty, setQty] = useState(1)
  const [buyPicks, setBuyPicks] = useState<Record<string, boolean>>({})
  const [buySearch, setBuySearch] = useState('')
  const [buyError, setBuyError] = useState('')

  const signupLink = `${baseUrl}/signup?teamCode=${team.accessCode}`

  function copyLink() {
    copyToClipboard(signupLink, 'Signup link copied!').then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  // Members in the chosen sort order. A member's score is their best from the
  // team leaderboard; members who haven't uploaded a shot have no score and
  // always sort to the bottom.
  function sortedMembers(): Member[] {
    const scoreOf = (m: Member): number | null => {
      const row = team.leaderboard.find(r => r.kind === 'member' && r.id === m.id)
      return row ? Number(row.best_score) : null
    }
    return [...team.members].sort((a, b) => {
      if (sort === 'name') return memberDisplayName(a).localeCompare(memberDisplayName(b))
      const sa = scoreOf(a)
      const sb = scoreOf(b)
      if (sa === null && sb === null) return memberDisplayName(a).localeCompare(memberDisplayName(b))
      if (sa === null) return 1
      if (sb === null) return -1
      return sort === 'score-desc' ? sb - sa : sa - sb
    })
  }

  // Buy form: who is visible after the search, who is picked, and how many
  // recipients that adds up to.
  const buyQuery = buySearch.trim().toLowerCase()
  const visibleBuyMembers = buyQuery
    ? team.members.filter(m => memberDisplayName(m).toLowerCase().includes(buyQuery))
    : team.members
  const pickedBuyIds = team.members.filter(m => buyPicks[m.id]).map(m => m.id)
  const recipients = dest === 'all' ? team.members.length : dest === 'players' ? pickedBuyIds.length : 1
  const allVisiblePicked = visibleBuyMembers.length > 0 && visibleBuyMembers.every(m => buyPicks[m.id])

  async function submitBuy() {
    const playerUserIds = dest === 'all' ? team.members.map(m => m.id) : pickedBuyIds
    setBuyError(await onBuy(dest, qty, playerUserIds))
  }

  // ── Panels ────────────────────────────────────────────────────────

  const rosterPanel = (
    <div className="space-y-3">
      <Section
        title="Coaches"
        tipLabel="What can coaches do?"
        tip="Coaches manage this team from their own coach dashboard: they upload shots for players and can spend the team's credits. Invited coaches show as pending until they finish setting up their account."
        summary={`${team.coaches.length + 1} coach${team.coaches.length > 0 ? 'es' : ''}`}
      >
        <div className="mt-1 border border-gray-100 dark:border-courtline rounded-xl divide-y divide-gray-100 dark:divide-courtline">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black dark:text-chalk truncate">{team.coachNickname || team.adminEmail}</p>
              {team.coachNickname && <p className="text-xs text-gray-400 dark:text-chalk-dim truncate">{team.adminEmail}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs bg-ember-100 dark:bg-ember-500/15 text-ember-700 dark:text-ember-400 font-bold px-2 py-0.5 rounded-full">Head coach</span>
              <button
                onClick={onRemoveHeadCoach}
                disabled={removingCoach === `head-${team.id}`}
                className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors"
              >
                {removingCoach === `head-${team.id}` ? '…' : 'Remove'}
              </button>
            </div>
          </div>
          {team.coaches.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-black dark:text-chalk truncate">{c.nickname || c.email}</p>
                {c.nickname && <p className="text-xs text-gray-400 dark:text-chalk-dim truncate">{c.email}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.pending ? 'bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim' : 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400'}`}>
                  {c.pending ? 'Invite pending' : 'Coach'}
                </span>
                <button
                  onClick={() => onRemoveCoach(c.id, c.pending)}
                  disabled={removingCoach === c.id}
                  className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors"
                >
                  {removingCoach === c.id ? '…' : c.pending ? 'Cancel' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <OrgAddCoach teamId={team.id} />
        </div>
      </Section>

      <Section
        title="Players"
        tipLabel="How do players join?"
        tip="Players join with the signup link below. Tick the boxes next to players to draft an outreach email to just those players."
        summary={`${team.members.length} player${team.members.length !== 1 ? 's' : ''}`}
      >
        {team.members.length > 1 && (
          <div className="flex items-center justify-end gap-3">
            <SortMenu value={sort} options={PLAYER_SORT_OPTIONS} onChange={setSort} />
          </div>
        )}
        {team.members.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-chalk-dim mt-0.5">No players have joined yet.</p>
        ) : (
          <>
            <div className="mt-1 border border-gray-100 dark:border-courtline rounded-xl divide-y divide-gray-100 dark:divide-courtline">
              {sortedMembers().map(m => (
                <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={!!emailSelected[m.id]}
                      onChange={() => onToggleEmailMember(m.id)}
                      className="w-4 h-4 accent-ember-500 shrink-0"
                    />
                    <Link
                      href={`/org/dashboard/member/${m.id}`}
                      className="text-sm font-semibold text-black dark:text-chalk truncate hover:text-ember-600 dark:hover:text-ember-400 hover:underline transition-colors"
                    >
                      {memberDisplayName(m)}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400 dark:text-chalk-dim truncate max-w-[9rem]">{m.email}</span>
                    <button
                      onClick={() => onRemovePlayer(m.id)}
                      disabled={removingPlayer === m.id}
                      className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors"
                    >
                      {removingPlayer === m.id ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {team.members.some(m => emailSelected[m.id]) && (
              <button
                onClick={onDraftEmail}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors"
              >
                <MailIcon aria-hidden className="w-4 h-4" />
                Draft outreach email ({team.members.filter(m => emailSelected[m.id]).length} selected)
              </button>
            )}
          </>
        )}
      </Section>

      <div className="border border-gray-200 dark:border-courtline rounded-2xl px-5 py-4">
        <p className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
          Player signup link
          <InfoTip label="What is the player signup link?" align="left">
            Send this to players (or their parents). It opens the signup page
            with this team&rsquo;s code pre-filled, so they land on the roster
            automatically.
          </InfoTip>
        </p>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-ink-800 border border-gray-300 dark:border-courtline rounded-xl p-2.5">
          <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">{signupLink}</span>
          <button
            onClick={copyLink}
            className="shrink-0 text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
          >
            {copiedLink ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-chalk-dim mt-1.5">
          Players open this link, sign up with the code pre-filled, then enter their name to join.
        </p>
      </div>
    </div>
  )

  const tokensPanel = (
    <div className="space-y-3">
      {/* Class teams already show Players / Enrolled / Completed / Credits left
          in the class panel, so this block would only repeat them — and its
          "N tokens total" line misleads in a coach-uploads-for-players model. */}
      {!team.classPackageId && (
        <TokenBalances
          players={team.members.map(m => ({ id: m.id, label: memberDisplayName(m), tokens: m.tokens }))}
          teamCredits={team.credits}
          tokenPool={team.tokenPool}
        />
      )}

      {/* Spends teams.credits on this team's roster. Same pool the coach uses
          via Open team dashboard; lets the org act without hopping into the
          team's coach view. */}
      <Section
        title="Give team credits to players"
        summary={`${team.credits} credit${team.credits !== 1 ? 's' : ''}`}
      >
        <div className="pt-2">
          {team.members.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-chalk-dim">No players have joined this team yet.</p>
          ) : team.credits === 0 ? (
            <p className="text-sm text-gray-500 dark:text-chalk-dim">No credits on this team yet &mdash; send some from the Tokens tab first.</p>
          ) : (
            <GiveTokensForm
              players={team.members.map(m => ({ id: m.id, label: memberDisplayName(m), tokens: m.tokens }))}
              available={team.credits}
              availableLabel="team credits"
              onGive={onGiveCredits}
            />
          )}
        </div>
      </Section>

      {/* Hidden in the iOS app: digital purchases there must use native IAP. */}
      {!inApp && (
        <Section title="Buy tokens for this team">
          <div className="pt-2 space-y-3">
            <p className="text-xs text-gray-500 dark:text-chalk-dim">
              Checkout goes straight to the destination you pick &mdash; no need to send afterwards.
              Card, Apple Pay, and Google Pay are accepted at checkout.
            </p>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-500 dark:text-chalk-dim">Buy for</p>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Buy for">
                {([
                  ['all', `All players (${team.members.length})`],
                  ['players', 'Specific players'],
                  ['team', 'Team credits'],
                ] as Array<[string, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={dest === value}
                    onClick={() => setDest(value)}
                    className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors ${
                      dest === value
                        ? 'border-ember-500 bg-ember-50 dark:bg-ember-500/15 text-ember-700 dark:text-ember-400'
                        : 'border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 text-gray-600 dark:text-chalk-dim hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-chalk-dim">
                {dest === 'all' && 'Every player on the roster gets the amount below on their own account.'}
                {dest === 'players' && 'Pick who gets tokens — each selected player gets the amount below.'}
                {dest === 'team' && `Funds the shared balance coaches spend (${team.credits} there now).`}
              </p>
            </div>

            {dest === 'players' && (
              <div className="border border-gray-200 dark:border-courtline rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-ink-950/60 border-b border-gray-200 dark:border-courtline">
                  <span className="text-xs font-medium text-gray-500 dark:text-chalk-dim">{pickedBuyIds.length} of {team.members.length} selected</span>
                  <button
                    type="button"
                    onClick={() => setBuyPicks(prev => ({
                      ...prev,
                      ...Object.fromEntries(visibleBuyMembers.map(m => [m.id, !allVisiblePicked])),
                    }))}
                    className="text-xs font-semibold text-ember-600 hover:text-ember-500 dark:text-ember-400"
                  >
                    {allVisiblePicked ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                {team.members.length > 6 && (
                  <input
                    type="search"
                    value={buySearch}
                    onChange={e => setBuySearch(e.target.value)}
                    placeholder="Search players…"
                    className="w-full px-4 py-2 text-sm text-gray-900 dark:text-chalk dark:bg-ink-900 placeholder:text-gray-400 border-b border-gray-100 dark:border-courtline focus:outline-none"
                  />
                )}
                <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-courtline">
                  {visibleBuyMembers.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-chalk-dim px-4 py-3">No players match.</p>
                  )}
                  {visibleBuyMembers.map(m => (
                    <label key={m.id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-800">
                      <input
                        type="checkbox"
                        checked={!!buyPicks[m.id]}
                        onChange={() => setBuyPicks(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                        className="w-4 h-4 accent-ember-500 shrink-0"
                      />
                      <span className="flex-1 text-sm text-gray-900 dark:text-chalk truncate">{memberDisplayName(m)}</span>
                      <span className="text-xs text-gray-400 dark:text-chalk-dim shrink-0 tabular-nums">{m.tokens} token{m.tokens !== 1 ? 's' : ''}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-600 dark:text-chalk-dim mr-1">
                  {dest === 'team' ? 'Credits' : 'Tokens each'}
                </span>
                {[1, 5, 10].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQty(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-colors ${
                      qty === n
                        ? 'bg-ember-500 text-ink-950 border-ember-500'
                        : 'bg-white dark:bg-ink-900 text-gray-900 dark:text-chalk border-gray-200 dark:border-courtline hover:border-ember-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  value={qty || ''}
                  onChange={e => {
                    const n = parseInt(e.target.value)
                    setQty(Number.isNaN(n) ? 1 : Math.min(10000, Math.max(1, n)))
                  }}
                  aria-label="Amount"
                  className="w-16 h-9 border border-gray-200 dark:border-courtline rounded-lg px-2 text-center text-gray-900 dark:text-chalk dark:bg-ink-900 text-sm focus:outline-none focus:border-ember-500"
                />
              </div>
              {dest !== 'team' && recipients > 0 && (
                <span className="text-sm text-gray-500 dark:text-chalk-dim">
                  {recipients} player{recipients !== 1 ? 's' : ''} × {qty} ={' '}
                  <span className="font-semibold text-gray-900 dark:text-chalk tabular-nums">{recipients * qty}</span> tokens
                </span>
              )}
            </div>

            {buyError && <p className="text-red-500 text-sm">{buyError}</p>}
            <button
              onClick={submitBuy}
              disabled={buying || (dest !== 'team' && recipients === 0)}
              className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              {buying
                ? 'Redirecting to checkout…'
                : dest === 'team'
                  ? `Buy ${qty} team credit${qty !== 1 ? 's' : ''}`
                  : recipients === 0
                    ? 'Select players first'
                    : `Buy ${recipients * qty} token${recipients * qty !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Section>
      )}
    </div>
  )

  // The week at a glance. There is also a top-level Schedule tab with the full
  // view; this is the door that doesn't make you leave the team you're in.
  // The panel 402s and offers the upgrade itself when the plan has no
  // scheduling — the tier isn't guessed here, because an individually
  // grandfathered team keeps scheduling even under a Basic org.
  const schedulePanel = (
    <TeamSchedulePanel
      teamId={team.id}
      theme="light"
      compact
      onOpenFull={onOpenScheduleModal}
      upgradeCta={{ href: '#org-billing', label: 'Change your plan' }}
    />
  )

  const leaderboardPanel = (
    <div className="space-y-2">
      {team.leaderboard.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={onOpenLeaderboardModal}
            className="shrink-0 text-xs font-bold text-ember-500 hover:text-ember-400 transition-colors"
          >
            View full &amp; print
          </button>
        </div>
      )}
      {team.leaderboard.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-chalk-dim">No shots analyzed yet.</p>
      ) : (
        <LeaderboardTable entries={team.leaderboard} context="org" theme="auto" />
      )}
    </div>
  )

  const messagesPanel = (
    <div className="space-y-4">
      <TeamChatPanel teamId={team.id} />
      <div className="border-t border-gray-100 dark:border-courtline pt-4">
        <EmailTeamPanel teamId={team.id} playerCount={team.members.length} />
      </div>
    </div>
  )

  const settingsPanel = (
    <div className="space-y-3">
      <div className="border border-gray-200 dark:border-courtline rounded-2xl px-5 py-4">
        <p className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide mb-1.5">Age group</p>
        <InlineEdit
          value={team.ageGroup ?? ''}
          endpoint="/api/org/update-team"
          bodyKey="ageGroup"
          extra={{ teamId: team.id }}
          placeholder="e.g. U15, Varsity"
          textClassName="text-sm font-semibold text-black dark:text-chalk"
          emptyLabel="Not set"
        />
      </div>

      <Section title="Danger zone" summary="Delete team">
        <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-400 dark:text-chalk-dim max-w-sm">
            Permanently delete this team, its roster, and its coaches.
            Players keep their own shot history. This can&apos;t be undone.
          </p>
          <button
            onClick={onDeleteTeam}
            disabled={deletingTeam}
            className={backendButton('danger', 'shrink-0')}
          >
            {deletingTeam ? 'Deleting…' : 'Delete team'}
          </button>
        </div>
      </Section>
    </div>
  )

  return (
    <div id={`team-panel-${team.id}`} className="scroll-mt-24 border border-gray-200 dark:border-courtline rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`team-body-${team.id}`}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 dark:bg-ink-800 hover:bg-ember-50 dark:hover:bg-ember-500/10 transition-colors text-left"
      >
        <div>
          <p className="font-bold text-black dark:text-chalk">{team.name}</p>
          <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
            {team.ageGroup ? `${team.ageGroup} · ` : ''}
            {team.members.length} player{team.members.length !== 1 ? 's' : ''}
            {team.credits > 0 ? ` · ${team.credits} team credit${team.credits !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        {/* The same rotating chevron the Sections inside use, so the card and
            its contents speak one language. */}
        <svg
          className={`w-4 h-4 shrink-0 text-gray-400 dark:text-chalk-dim transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor" aria-hidden
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div id={`team-body-${team.id}`} className="px-5 py-4 space-y-4">
          {/* Header: who this team is, its headline numbers, and the two
              actions that used to be buried in the stack. */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-lg font-black text-black dark:text-chalk truncate">{team.name}</p>
                <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5 truncate">
                  Head coach: {team.coachNickname || team.adminEmail}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Age group</span>
                <InlineEdit
                  value={team.ageGroup ?? ''}
                  endpoint="/api/org/update-team"
                  bodyKey="ageGroup"
                  extra={{ teamId: team.id }}
                  placeholder="e.g. U15, Varsity"
                  textClassName="text-sm font-semibold text-black dark:text-chalk"
                  emptyLabel="Not set"
                />
              </div>
            </div>

            <StatGrid>
              <StatCard label="Players" value={team.members.length} />
              <StatCard label="Team credits" value={team.credits} accent />
              <StatCard label="Team pool" value={team.tokenPool} />
              <StatCard label="Ranked" value={team.leaderboard.length} />
            </StatGrid>

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={onOpenTeam} className={backendButton('primary')}>
                Open team dashboard
                <ArrowRightIcon aria-hidden className="w-4 h-4" />
              </button>
              <button onClick={copyLink} className={backendButton('quiet')}>
                {copiedLink ? 'Copied!' : 'Copy invite link'}
              </button>
            </div>
          </div>

          {/* This team runs a class package. The full manager — roster,
              progress, session plan, certificates — is the Class Manager tab;
              this is the signpost to it, not a second copy. It stays pinned
              above the strip because it cuts across every panel below. */}
          {classPackage && (
            <button
              onClick={onGoToClassTab}
              className="w-full text-left border border-ember-500/30 bg-ember-500/5 hover:bg-ember-500/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-4 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-black text-black dark:text-chalk">10-Week Shooting Development Program</p>
                <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
                  {classPackage.enrollments.length}/{classPackage.player_count} enrolled &middot;{' '}
                  {classPackage.enrollments.filter(en => en.has_final).length} finished &middot;{' '}
                  {team.credits} credit{team.credits !== 1 ? 's' : ''} left
                </p>
              </div>
              <span className="shrink-0 text-xs font-bold text-ember-600 dark:text-ember-400">Open Class Manager &rarr;</span>
            </button>
          )}

          <PanelTabs
            idBase={`team-${team.id}`}
            label={`${team.name} sections`}
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'roster', label: 'Roster', count: team.members.length, content: rosterPanel },
              { id: 'tokens', label: 'Tokens', content: tokensPanel },
              { id: 'schedule', label: 'Schedule', content: schedulePanel },
              { id: 'leaderboard', label: 'Leaderboard', count: team.leaderboard.length, content: leaderboardPanel },
              { id: 'messages', label: 'Messages', content: messagesPanel },
              { id: 'settings', label: 'Settings', content: settingsPanel },
            ]}
          />
        </div>
      )}
    </div>
  )
}
