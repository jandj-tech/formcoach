'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { LoaderCircleIcon, RefreshCwIcon } from 'lucide-react'
import { backendButton } from '@/components/backend/button-styles'
import {
  playerEmailTemplate,
  type PlayerEmailContent,
  type PlayerEmailShotMode,
  type PlayerEmailTemplateId,
} from '@/lib/player-email-templates'
import RecipientStep from './RecipientStep'
import ContentStep from './ContentStep'
import ReviewStep, { type ComposerError, type Excluded } from './ReviewStep'
import SendResultPanel from './SendResultPanel'
import ShotPicker from './ShotPicker'
import {
  CARD,
  blockReason,
  canEmail,
  pickId,
  pickedFor,
  planSend,
  plural,
  resolveSelection,
  shotsOf,
  skipReasonText,
  type Audience,
  type PlannedEmail,
  type PreviewResponse,
  type Recipient,
  type SendResponse,
  type SenderAs,
  type ShotPicks,
} from './types'

// "Email players" — one composer for org admins and coaches. Three numbered
// steps on one page (who, what, review), a live server-rendered preview for a
// real recipient, and a per-player report after sending. The server
// re-resolves every recipient from {teamId, key}; this component never sends
// addresses, names or scores it was shown.

const DEFAULT_TEMPLATE: PlayerEmailTemplateId = 'results'

function templateContent(id: PlayerEmailTemplateId, offers: Audience['offers'] | null): PlayerEmailContent {
  const t = playerEmailTemplate(id)
  const d = { template: t.id, ...t.defaults }
  // The ball email also lists the org's offers when one of them is a ball.
  if (id === 'gear' && offers?.titles.some((title) => /\bball/i.test(title))) d.includeOffers = true
  return d
}

/**
 * Non-blocking warnings for text that promises something the email won't
 * include ("sign-up details below" with no offers attached). Heuristic on
 * purpose: it only nudges the sender to look.
 */
function contentWarnings(content: PlayerEmailContent, offers: Audience['offers']): string[] {
  const text = `${content.subject}\n${content.message}`
  const offersIn = content.includeOffers && offers.count > 0
  const out: string[] = []
  if (/\b(sign[\s-]?(up|ups)|register|registration|enrol+(ment)?|enroll(ment)?|offers?)\b/i.test(text) && !offersIn) {
    out.push(
      offers.count === 0
        ? 'Your message mentions signing up, but there are no offers to include, so the email has no sign-up details. Add one in Offers & Sales, or ask players to reply instead.'
        : 'Your message mentions signing up, but “Our offers” is off, so the email has no sign-up details. Turn it on in step 2, or reword the message.',
    )
  }
  if (/\b(order|shop|buy)\b/i.test(content.message) && !content.includeShopLink && !offersIn) {
    out.push('Your message mentions ordering, but the shop link is off, so there is nothing to order from. Turn on the shop link in step 2, or reword the message.')
  }
  if (/\bbelow\b/i.test(content.message) && !content.includeResults && !offersIn && !content.includeShopLink) {
    out.push('Your message says “below”, but nothing is added below it (no results, offers or shop link).')
  }
  return out
}

function sameText(a: PlayerEmailContent, b: PlayerEmailContent): boolean {
  return a.subject === b.subject && a.message === b.message
}

function describeError(status: number, serverMessage: string | undefined, as: SenderAs, action: 'load' | 'send' | 'preview'): ComposerError {
  const nothingSent = action === 'send' ? ' Nothing was sent.' : ''
  switch (status) {
    case 401:
      return {
        title: 'You have been signed out',
        body: (
          <>
            Log in again, then come back to this tab.{nothingSent}{' '}
            <Link href={as === 'org' ? '/org/login' : '/team/login'} className="font-semibold underline underline-offset-2">
              Log in
            </Link>
          </>
        ),
      }
    case 402:
      return {
        title: 'Your organization plan has ended',
        body: `${serverMessage ?? 'Reactivate your plan in Settings to email players again.'}${nothingSent}`,
      }
    case 403:
      return {
        title: 'You cannot email these players',
        body: `${serverMessage ?? 'They are not on a team you manage.'}${nothingSent}`,
      }
    case 429:
      return {
        title: 'Too many emails for now',
        body: `${serverMessage ?? 'To protect your players’ inboxes there is a limit on sends per hour.'} Wait a little while, then try again.${nothingSent}`,
      }
    case 400:
      return { title: 'Something in the email needs fixing', body: serverMessage ?? 'Check the subject, message and recipients, then try again.' }
    case 0:
      return {
        title: 'No connection',
        body:
          action === 'send'
            ? 'We could not reach LearnHoops, so we cannot tell whether the emails went out. Check your connection, then reload this page and look at the “Results sent” dates before sending again.'
            : 'We could not reach LearnHoops. Check your connection and try again.',
      }
    default:
      return {
        title: action === 'load' ? 'Could not load your players' : 'The email could not be sent',
        body:
          action === 'send'
            ? 'Something went wrong on our side and we could not confirm the send. Some emails may have gone out — reload this page and check the “Results sent” dates before trying again.'
            : 'Something went wrong on our side. Try again in a moment.',
      }
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

export default function PlayerEmailComposer({
  as,
  onGoToOffers,
  heading,
  focusTeam,
}: {
  as: SenderAs
  /** Org dashboard: jumps to the Offers & Sales tab. */
  onGoToOffers?: () => void
  /**
   * Org dashboard: a team card asked to email this team. Its reachable
   * players are ticked (replacing the current picks) and its list opened.
   * A new nonce re-applies it.
   */
  focusTeam?: { teamId: string; nonce: number } | null
  /** Optional override for the title above the steps. */
  heading?: ReactNode
}) {
  const [audience, setAudience] = useState<Audience | null>(null)
  const [loadError, setLoadError] = useState<ComposerError | null>(null)
  const [reloading, setReloading] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const [content, setContent] = useState<PlayerEmailContent>(() => templateContent(DEFAULT_TEMPLATE, null))
  const [undo, setUndo] = useState<{ content: PlayerEmailContent; label: string } | null>(null)
  // Per-recipient shot ticks for "Pick shots…" (absent: their latest).
  const [shotPicks, setShotPicks] = useState<ShotPicks>({})

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<ComposerError | null>(null)
  const [result, setResult] = useState<SendResponse | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLElement>(null)
  const firstLoad = useRef(true)

  // ── Audience ────────────────────────────────────────────────────────────
  const fetchAudience = useCallback(async (): Promise<{ data?: Audience; error?: ComposerError }> => {
    try {
      const res = await fetch(`/api/player-email/audience?as=${as}`, { cache: 'no-store' })
      const json = await readJson(res)
      if (!res.ok) return { error: describeError(res.status, json.error as string | undefined, as, 'load') }
      return { data: json as unknown as Audience }
    } catch {
      return { error: describeError(0, undefined, as, 'load') }
    }
  }, [as])

  const applyAudience = useCallback(
    (data: Audience) => {
      setAudience(data)
      setLoadError(null)
      if (!firstLoad.current) return
      firstLoad.current = false
      // A coach is emailing their one team: start with everyone reachable
      // ticked. An org starts empty — a whole-org send should be a choice.
      if (as === 'coach') {
        setSelected(new Set(data.teams.flatMap((t) => t.players.filter(canEmail).map((p) => pickId(t.id, p.key)))))
      }
      if (data.teams.length === 1) setExpanded(new Set([data.teams[0].id]))
    },
    [as],
  )

  useEffect(() => {
    let cancelled = false
    fetchAudience().then(({ data, error }) => {
      if (cancelled) return
      if (data) applyAudience(data)
      else if (error) setLoadError(error)
    })
    return () => {
      cancelled = true
    }
  }, [fetchAudience, applyAudience])

  async function reloadAudience() {
    setReloading(true)
    const { data, error } = await fetchAudience()
    setReloading(false)
    if (data) applyAudience(data)
    else if (error && !audience) setLoadError(error)
  }

  const teams = useMemo(() => audience?.teams ?? [], [audience])

  // Apply a team card's request once the audience is loaded (adjusting state
  // during render, React's pattern for "reset when a prop changes").
  const [appliedFocus, setAppliedFocus] = useState<number | null>(null)
  if (focusTeam && audience && !result && appliedFocus !== focusTeam.nonce) {
    setAppliedFocus(focusTeam.nonce)
    const team = audience.teams.find((t) => t.id === focusTeam.teamId)
    if (team) {
      setSelected(new Set(team.players.filter(canEmail).map((p) => pickId(team.id, p.key))))
      setExpanded((prev) => new Set(prev).add(team.id))
    }
  }
  const offers = useMemo(() => audience?.offers ?? { count: 0, titles: [] }, [audience])

  // ── Selection ───────────────────────────────────────────────────────────
  const { recipients, duplicates, teamIds } = useMemo(
    () => resolveSelection(teams, selected, content.includeResults),
    [teams, selected, content.includeResults],
  )

  function togglePlayer(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function setTeam(teamId: string, on: boolean) {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return
    const ids = team.players.filter(canEmail).map((p) => pickId(team.id, p.key))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
    if (on) setExpanded((prev) => new Set(prev).add(teamId))
  }
  function setAll(on: boolean) {
    if (!on) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(teams.flatMap((t) => t.players.filter(canEmail).map((p) => pickId(t.id, p.key)))))
    if (teams.length <= 3) setExpanded(new Set(teams.map((t) => t.id)))
  }
  function toggleExpand(teamId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  // ── Content ─────────────────────────────────────────────────────────────
  function patchContent(patch: Partial<PlayerEmailContent>) {
    setContent((c) => ({ ...c, ...patch }))
    setUndo(null)
  }
  function chooseTemplate(id: PlayerEmailTemplateId) {
    if (id === content.template) return
    const current = templateContent(content.template, offers)
    const edited = !sameText(content, current) && (content.subject.trim() !== '' || content.message.trim() !== '')
    setUndo(edited ? { content, label: playerEmailTemplate(id).label } : null)
    setContent(templateContent(id, offers))
  }
  function undoTemplate() {
    if (!undo) return
    setContent(undo.content)
    setUndo(null)
  }

  // Selected players with several graded shots: they get the "Which shots?" choice.
  const multi = useMemo(
    () => (content.includeResults ? recipients.filter((r) => shotsOf(r.player).length > 1) : []),
    [recipients, content.includeResults],
  )
  const shotMode: PlayerEmailShotMode = content.includeResults && multi.length > 0 ? content.shotMode ?? 'latest' : 'latest'

  // What the server gets: offers can only be included when there are some.
  const outgoing: PlayerEmailContent = useMemo(() => {
    const { shotMode: _mode, ...rest } = content
    void _mode
    return {
      ...rest,
      includeOffers: content.includeOffers && offers.count > 0,
      ...(shotMode !== 'latest' ? { shotMode } : {}),
    }
  }, [content, offers.count, shotMode])

  // Who actually gets what: every count, the Send button, the warnings and
  // the preview come from this one plan (it mirrors the server's resolve).
  const plan = useMemo(() => planSend(recipients, content, shotMode, shotPicks), [recipients, content, shotMode, shotPicks])
  // The same send with "New since their last results email", for that option's hint.
  const unsentPlan = useMemo(
    () => (multi.length > 0 ? planSend(recipients, content, 'unsent', shotPicks) : null),
    [multi.length, recipients, content, shotPicks],
  )

  /** A recipient as the server gets it: with their ticked shots in 'pick' mode. */
  const wirePick = useCallback(
    (r: Recipient) =>
      shotMode === 'pick' && shotsOf(r.player).length > 1
        ? { teamId: r.team.id, key: r.player.key, submissionIds: pickedFor(r, shotPicks) }
        : { teamId: r.team.id, key: r.player.key },
    [shotMode, shotPicks],
  )

  // ── Preview ─────────────────────────────────────────────────────────────
  // Whoever this send reaches once players are picked; before that, anyone
  // reachable, so the sender can see the email while still deciding.
  const previewCandidates: Array<Recipient | PlannedEmail> = useMemo(() => {
    if (recipients.length > 0) return plan.sending
    const all: Recipient[] = []
    const seen = new Set<string>()
    for (const team of teams) {
      for (const player of team.players) {
        // One entry per player (a sibling on a shared address is someone else).
        const who = player.userId ? `user:${player.userId}` : pickId(team.id, player.key)
        if (!canEmail(player) || seen.has(who)) continue
        seen.add(who)
        all.push({ id: pickId(team.id, player.key), team, player })
      }
    }
    return all
  }, [recipients.length, plan.sending, teams])

  const effectivePreview =
    previewCandidates.find((r) => r.id === previewId) ??
    (content.includeResults ? previewCandidates.find((r) => r.player.score !== null) : undefined) ??
    previewCandidates[0] ??
    null

  const previewBlocked = !audience
    ? 'Loading…'
    : previewCandidates.length === 0
      ? recipients.length > 0
        ? 'None of the selected players would get this email, so there is nobody to preview as.'
        : 'No player has an email address yet, so there is nobody to preview as.'
      : !content.subject.trim()
        ? 'Add a subject to see the preview.'
        : !content.message.trim() && !content.includeResults
          ? 'Write a message to see the preview.'
          : null

  const previewKey =
    previewBlocked || !effectivePreview
      ? null
      : JSON.stringify({ as, content: outgoing, recipient: wirePick(effectivePreview) })

  useEffect(() => {
    if (!previewKey) return
    let cancelled = false
    const timer = setTimeout(() => {
      setPreviewLoading(true)
      fetch('/api/player-email/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: previewKey })
        .then(async (res) => {
          const json = await readJson(res)
          if (cancelled) return
          if (!res.ok) {
            const e = describeError(res.status, json.error as string | undefined, as, 'preview')
            setPreviewError(`${e.title}. ${typeof e.body === 'string' ? e.body : ''}`.trim())
            return
          }
          setPreview(json as unknown as PreviewResponse)
          setPreviewError(null)
        })
        .catch(() => {
          if (!cancelled) setPreviewError('Could not build the preview. Check your connection.')
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false)
        })
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [previewKey, as])

  // ── Review ──────────────────────────────────────────────────────────────
  const excluded: Excluded[] = useMemo(() => {
    const out: Excluded[] = []
    // Only for teams sent to as a whole: when the sender hand-picks one
    // player, listing that team's unreachable players is noise.
    for (const team of teams) {
      if (!teamIds.has(team.id)) continue
      const wholeTeam = team.players.filter(canEmail).every((p) => selected.has(pickId(team.id, p.key)))
      if (!wholeTeam) continue
      for (const p of team.players) {
        const reason = blockReason(p)
        if (reason) out.push({ id: pickId(team.id, p.key), name: p.name, team: team.name, reason })
      }
    }
    return out
  }, [teams, teamIds, selected])

  const emptyFor = plan.skipped.filter((x) => x.reason === 'nothing_to_send').length
  const problems: string[] = []
  if (!content.subject.trim()) problems.push('Add a subject in step 2.')
  if (!content.message.trim() && !content.includeResults) problems.push("Write a message in step 2, or include each player's score.")
  if (emptyFor > 0)
    problems.push(
      `${plural(emptyFor, 'selected player has', 'selected players have')} no graded shot yet, so with an empty message their email would be blank. Write a short message, or untick them.`,
    )

  // Soft checks: the message points at something the email won't contain.
  const warnings = contentWarnings(content, offers)
  // 'unsent': anyone with no shot that hasn't been emailed yet is skipped.
  const nothingNew = plan.skipped.filter((x) => x.reason === 'nothing_new')
  if (nothingNew.length > 0) {
    warnings.push(
      `${plural(nothingNew.length, 'selected player has', 'selected players have')} no new shots since their last results email, so they will be skipped: ${nothingNew
        .slice(0, 5)
        .map((r) => r.player.name)
        .join(', ')}${nothingNew.length > 5 ? ` and ${nothingNew.length - 5} more` : ''}`.replace(/\.?$/, '.'),
    )
  }
  // Not getting it: unreachable players (whole teams) plus the plan's skips.
  const notSent: Excluded[] = useMemo(
    () => [
      ...plan.skipped.map((x) => ({ id: x.id, name: x.player.name, team: x.team.name, reason: skipReasonText(x.reason) })),
      ...excluded,
    ],
    [plan.skipped, excluded],
  )

  // Not-set-up players get the "finish setup" version: one click shows it.
  const firstSetup = plan.sending.find((r) => r.kind === 'setup') ?? null
  function previewSetupVersion() {
    if (!firstSetup) return
    setPreviewId(firstSetup.id)
    requestAnimationFrame(() =>
      document.getElementById('player-email-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  // Roster order of every row — the order the server sees picks in.
  const order = useMemo(() => teams.flatMap((t) => t.players.map((p) => pickId(t.id, p.key))), [teams])

  async function send() {
    if (plan.sending.length === 0 || problems.length > 0) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/player-email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          as,
          content: outgoing,
          // Duplicates are sent too (the server dedupes and reports them) so
          // the result lists every ticked player; first occurrence wins.
          recipients: [...recipients, ...duplicates]
            .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
            .map(wirePick),
        }),
      })
      const json = await readJson(res)
      if (!res.ok) {
        setSendError(describeError(res.status, json.error as string | undefined, as, 'send'))
        return
      }
      const r = json as unknown as SendResponse
      setResult({ sent: r.sent ?? [], skipped: r.skipped ?? [], failed: r.failed ?? [], total: r.total ?? 0 })
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        resultRef.current?.focus({ preventScroll: true })
      })
      void reloadAudience()
    } catch {
      setSendError(describeError(0, undefined, as, 'send'))
    } finally {
      setSending(false)
    }
  }

  function writeAnother() {
    setResult(null)
    setSendError(null)
    setUndo(null)
    setQuery('')
    setContent(templateContent(DEFAULT_TEMPLATE, offers))
    setShotPicks({})
    setSelected(
      as === 'coach' ? new Set(teams.flatMap((t) => t.players.filter(canEmail).map((p) => pickId(t.id, p.key)))) : new Set(),
    )
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {heading ?? <h2 className="text-lg font-bold text-gray-900 dark:text-chalk">Email players</h2>}
        <p className="text-sm text-gray-500 dark:text-chalk-dim">
          Send results, program news or a quick message. Each player gets their own email
          {audience ? (
            <>
              {' '}
              from <span className="font-semibold text-gray-700 dark:text-chalk">{audience.sender.displayName}</span>, and replies go to{' '}
              <span className="font-semibold text-gray-700 dark:text-chalk [overflow-wrap:anywhere]">{audience.sender.replyTo}</span>.
            </>
          ) : (
            '.'
          )}
        </p>
      </div>
      {audience && !result && (
        <button type="button" onClick={reloadAudience} disabled={reloading || sending} className={backendButton('quiet', 'px-3 py-1.5 text-xs')}>
          <RefreshCwIcon className={reloading ? 'animate-spin' : ''} aria-hidden />
          Refresh list
        </button>
      )}
    </div>
  )

  if (!audience) {
    return (
      <div ref={rootRef} className="space-y-4 min-w-0">
        {header}
        <div className={`${CARD} px-5 py-10 text-center`}>
          {loadError ? (
            <div role="alert" className="space-y-3">
              <p className="text-sm font-bold text-gray-900 dark:text-chalk">{loadError.title}</p>
              <div className="text-sm text-gray-500 dark:text-chalk-dim">{loadError.body}</div>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null)
                  void reloadAudience()
                }}
                className={backendButton('secondary')}
              >
                <RefreshCwIcon aria-hidden /> Try again
              </button>
            </div>
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-chalk-dim">
              <LoaderCircleIcon className="w-4 h-4 animate-spin" aria-hidden /> Loading your players…
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="space-y-4 min-w-0">
      {header}
      {result ? (
        <SendResultPanel
          ref={resultRef}
          result={result}
          replyTo={preview?.replyTo ?? audience.sender.replyTo}
          onAnother={writeAnother}
        />
      ) : (
        <>
          <RecipientStep
            as={as}
            teams={teams}
            selected={selected}
            expanded={expanded}
            query={query}
            duplicates={duplicates}
            recipientCount={recipients.length}
            teamCount={teamIds.size}
            disabled={sending}
            onQuery={setQuery}
            onTogglePlayer={togglePlayer}
            onSetTeam={setTeam}
            onSetAll={setAll}
            onToggleExpand={toggleExpand}
            onClear={() => setSelected(new Set())}
          />
          <ContentStep
            as={as}
            content={content}
            offers={offers}
            undoLabel={undo?.label ?? null}
            disabled={sending}
            previewCandidates={previewCandidates}
            previewId={effectivePreview?.id ?? null}
            preview={preview}
            previewLoading={previewLoading && !previewBlocked}
            previewError={previewError}
            previewBlocked={previewBlocked}
            sender={audience.sender}
            onContent={patchContent}
            onTemplate={chooseTemplate}
            onUndo={undoTemplate}
            onPreviewId={setPreviewId}
            onGoToOffers={onGoToOffers}
            resultsExtra={
              multi.length > 0 ? (
                <ShotPicker
                  mode={shotMode}
                  multi={multi}
                  unsent={{ shots: unsentPlan?.shotTotal ?? 0, skipped: unsentPlan?.skipped.filter((x) => x.reason === 'nothing_new').length ?? 0 }}
                  picks={shotPicks}
                  disabled={sending}
                  onMode={(m) => patchContent({ shotMode: m })}
                  onPicks={setShotPicks}
                />
              ) : null
            }
          />
          <ReviewStep
            fromHeader={preview?.fromHeader ?? audience.sender.fromHeader}
            replyTo={preview?.replyTo ?? audience.sender.replyTo}
            subject={previewBlocked ? content.subject : (preview?.subject ?? content.subject)}
            personalized={/\{\{\s*first_name\s*\}\}/.test(content.subject)}
            includeResults={content.includeResults}
            plan={plan}
            duplicates={duplicates}
            excluded={notSent}
            problems={problems}
            warnings={warnings}
            sending={sending}
            error={sendError}
            onSend={send}
            onPreviewSetup={firstSetup ? previewSetupVersion : undefined}
          />
        </>
      )}
    </div>
  )
}
