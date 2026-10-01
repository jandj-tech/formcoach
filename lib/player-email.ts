// Server side of the "Email players" composer: who may send, who they may
// reach, and the send itself. Shared by /api/player-email/{audience,preview,send}
// and by the legacy /api/team/announce route.
//
// Authorization rule, in one sentence: an org session may email players on
// any of the org's teams; a coach (team) session may email players on its ONE
// team. Every recipient is re-resolved here from { teamId, key } against the
// authorized teams' rosters. Emails, names, scores and result tokens are never
// taken from the client.

import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { teamResultsRoster, type RosterPlayer } from '@/lib/org-results'
import { getPurchasableOffers } from '@/lib/org-offers-db'
import { effectivePriceCents, type OrgOffer } from '@/lib/org-offers'
import type { VisibilityTier } from '@/lib/result-visibility'
import { PLAYER_EMAILS_PAUSED } from './player-email-pause'
import {
  BASE_URL,
  cleanSubject,
  renderPlayerEmail,
  sendPlayerEmail,
  type PlayerEmailOffersBlock,
  type PlayerEmailResultsBlock,
} from '@/lib/email'
import { onBehalfFrom } from '@/lib/email-senders'
import {
  PLAYER_EMAIL_LIMITS,
  PLAYER_EMAIL_TEMPLATES,
  playerEmailTemplate,
  type PlayerEmailContent,
  type PlayerEmailTemplateId,
} from '@/lib/player-email-templates'

/** Send at most this many emails concurrently. */
const SEND_CHUNK = 20
const GENERIC_COACH = 'Your coach'

/** Stand-in for the stock results text, for a player with no graded shot yet. */
const NO_SHOT_SUBJECT = '{{first_name}}, an update from {{team}}'
const NO_SHOT_MESSAGE =
  'Hi {{first_name}},\n\n' +
  "We don't have a graded shot for you on {{team}} yet. Once your next shot is uploaded and graded, you'll get your score and a full report showing exactly what to work on.\n\n" +
  'Keep practising, and bring any questions to our next session.\n\n' +
  '{{coach}}'

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------

export type SenderAs = 'org' | 'coach'

export function parseAs(value: unknown): SenderAs | null {
  return value === 'org' || value === 'coach' ? value : null
}

export interface OrgSender {
  kind: 'org'
  orgId: string
  orgName: string
  /** Where replies go: the org admin's address. */
  replyTo: string
  /** Name in the From header ("<displayName> via LearnHoops"). */
  displayName: string
}

export interface CoachSender {
  kind: 'coach'
  teamId: string
  orgId: string | null
  orgName: string | null
  teamName: string
  /** The coach's display name; the org name when an org admin opened the team. */
  coachName: string
  /** True when coachName is the generic fallback ("Your coach"). */
  coachNameIsGeneric: boolean
  /** An org admin working inside one team (via /api/org/open-team). */
  actingAsOrg: boolean
  replyTo: string
  displayName: string
}

export type PlayerEmailSender = OrgSender | CoachSender

/**
 * Who is signed in as the team's coach, or null when `email` is no longer a
 * coach on that team (removed assistant, changed head coach). An org admin
 * who opened the team is presented as the org, still scoped to that team.
 */
export async function coachSenderForTeam(teamId: string, sessionEmail: string): Promise<CoachSender | null> {
  const email = sessionEmail.trim().toLowerCase()
  if (!email) return null
  const [row] = (await db`
    SELECT t.id, t.name, t.admin_email, t.coach_nickname, t.organization_id,
           o.name AS org_name, o.admin_email AS org_admin_email,
           tc.email AS assistant_email, tc.nickname AS assistant_nickname
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    LEFT JOIN LATERAL (
      SELECT email, nickname FROM team_coaches
      WHERE team_id = t.id AND LOWER(email) = ${email}
      LIMIT 1
    ) tc ON TRUE
    WHERE t.id = ${teamId}
  `) as unknown as [
    | {
        id: string
        name: string
        admin_email: string
        coach_nickname: string | null
        organization_id: string | null
        org_name: string | null
        org_admin_email: string | null
        assistant_email: string | null
        assistant_nickname: string | null
      }
    | undefined,
  ]
  if (!row) return null

  const base = {
    kind: 'coach' as const,
    teamId: row.id,
    orgId: row.organization_id,
    orgName: row.org_name,
    teamName: row.name,
  }

  if (row.organization_id && row.org_name && row.org_admin_email && row.org_admin_email.toLowerCase() === email) {
    return {
      ...base,
      coachName: row.org_name,
      coachNameIsGeneric: false,
      actingAsOrg: true,
      replyTo: row.org_admin_email,
      displayName: row.org_name,
    }
  }

  let nickname: string | null
  let replyTo: string
  if (row.admin_email.toLowerCase() === email) {
    nickname = row.coach_nickname
    replyTo = row.admin_email
  } else if (row.assistant_email) {
    nickname = row.assistant_nickname
    replyTo = row.assistant_email
  } else {
    return null
  }
  const clean = nickname?.trim() || null
  return {
    ...base,
    coachName: clean ?? GENERIC_COACH,
    coachNameIsGeneric: !clean,
    actingAsOrg: false,
    replyTo,
    // With no nickname, the team name reads better in an inbox than "Your coach".
    displayName: clean ?? row.name,
  }
}

export async function orgSenderById(orgId: string): Promise<OrgSender | null> {
  const [org] = (await db`
    SELECT id, name, admin_email FROM organizations WHERE id = ${orgId}
  `) as unknown as [{ id: string; name: string; admin_email: string } | undefined]
  if (!org) return null
  return { kind: 'org', orgId: org.id, orgName: org.name, replyTo: org.admin_email, displayName: org.name }
}

/** The signed-in sender for `as`, or null when that session is missing/stale. */
export async function resolveSender(req: NextRequest, as: SenderAs): Promise<PlayerEmailSender | null> {
  if (as === 'org') {
    const session = await getOrgSessionFromRequest(req)
    if (!session?.orgId) return null
    return orgSenderById(session.orgId)
  }
  const session = await getTeamSessionFromRequest(req)
  if (!session?.teamId || !session.adminEmail) return null
  return coachSenderForTeam(session.teamId, session.adminEmail)
}

export function senderFromHeader(sender: PlayerEmailSender): string {
  return onBehalfFrom(sender.displayName)
}

/** Name used for {{coach}} and in the email's "From ..." line. */
function senderSignature(sender: PlayerEmailSender): { kind: 'org' | 'coach'; name: string; generic: boolean } {
  if (sender.kind === 'org') return { kind: 'org', name: sender.orgName, generic: false }
  if (sender.actingAsOrg) return { kind: 'org', name: sender.coachName, generic: false }
  return { kind: 'coach', name: sender.coachName, generic: sender.coachNameIsGeneric }
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

interface AuthorizedTeam {
  id: string
  name: string
  ageGroup: string | null
  coachName: string | null
  orgId: string | null
  orgName: string | null
}

async function authorizedTeams(sender: PlayerEmailSender): Promise<AuthorizedTeam[]> {
  const rows = (sender.kind === 'org'
    ? await db`
        SELECT t.id, t.name, t.age_group, t.coach_nickname, t.organization_id, o.name AS org_name
        FROM teams t JOIN organizations o ON o.id = t.organization_id
        WHERE t.organization_id = ${sender.orgId}
        ORDER BY t.name
      `
    : await db`
        SELECT t.id, t.name, t.age_group, t.coach_nickname, t.organization_id, o.name AS org_name
        FROM teams t LEFT JOIN organizations o ON o.id = t.organization_id
        WHERE t.id = ${sender.teamId}
      `) as unknown as Array<{
    id: string
    name: string
    age_group: string | null
    coach_nickname: string | null
    organization_id: string | null
    org_name: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ageGroup: r.age_group,
    coachName: r.coach_nickname?.trim() || null,
    orgId: r.organization_id,
    orgName: r.org_name,
  }))
}

export type PlayerReach = 'ok' | 'no_email' | 'unsubscribed' | 'bounced'

export interface AudiencePlayer extends RosterPlayer {
  /** Whether this player can be emailed, and if not, why. */
  status: PlayerReach
  /** Last time LearnHoops emailed this address on a coach's or org's behalf. */
  lastEmailedAt: string | null
}

export interface AudienceTeam {
  id: string
  name: string
  ageGroup: string | null
  coachName: string | null
  orgId: string | null
  players: AudiencePlayer[]
}

function reachOf(p: RosterPlayer): PlayerReach {
  if (!p.email) return 'no_email'
  if (p.unsubscribed) return 'unsubscribed'
  if (p.bounced) return 'bounced'
  return 'ok'
}

export async function loadAudience(sender: PlayerEmailSender): Promise<AudienceTeam[]> {
  const teams = await authorizedTeams(sender)
  const rosters = await Promise.all(teams.map((t) => teamResultsRoster(t.id)))
  const emails = [
    ...new Set(rosters.flat().map((p) => p.email?.toLowerCase()).filter((e): e is string => !!e)),
  ]
  const last = new Map<string, string>()
  if (emails.length) {
    const rows = (await db`
      SELECT email, MAX(sent_at) AS at FROM email_logs
      WHERE email = ANY(${emails}::text[])
        AND email_type IN ('player_email', 'org_results', 'team_announce')
      GROUP BY email
    `) as unknown as Array<{ email: string; at: Date | null }>
    for (const r of rows) if (r.at) last.set(r.email, new Date(r.at).toISOString())
  }
  return teams.map((t, i) => ({
    id: t.id,
    name: t.name,
    ageGroup: t.ageGroup,
    coachName: t.coachName,
    orgId: t.orgId,
    players: rosters[i].map((p) => ({
      ...p,
      status: reachOf(p),
      lastEmailedAt: p.email ? last.get(p.email.toLowerCase()) ?? null : null,
    })),
  }))
}

/** The org whose offers apply to this sender (org, or a coach's org team). */
export function senderOrgId(sender: PlayerEmailSender): string | null {
  return sender.orgId
}

export interface AudienceMeta {
  offers: { count: number; titles: string[]; hasBall: boolean; hasCourse: boolean }
  /**
   * Kept for API compatibility. Team/org uploads always show the player the
   * full report, so there is no free tier and no paywall to warn about.
   */
  results: {
    freeTierLabel: null
    paywallWithoutOffer: false
    paywalled: false
  }
}

const NO_PAYWALL: AudienceMeta['results'] = { freeTierLabel: null, paywallWithoutOffer: false, paywalled: false }

export async function audienceMeta(sender: PlayerEmailSender): Promise<AudienceMeta> {
  const orgId = senderOrgId(sender)
  if (!orgId) {
    return {
      offers: { count: 0, titles: [], hasBall: false, hasCourse: false },
      results: NO_PAYWALL,
    }
  }
  const offers = await getPurchasableOffers(orgId)
  return {
    offers: {
      count: offers.length,
      titles: offers.map((o) => o.title),
      hasBall: offers.some((o) => o.includesBall),
      hasCourse: offers.some((o) => o.includesCourse),
    },
    results: NO_PAYWALL,
  }
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

export interface RecipientPick {
  teamId: string
  key: string
}

export type RecipientStatus =
  | 'ok'
  | 'no_email'
  | 'unsubscribed'
  | 'bounced'
  /** Same address as another pick; one email per address (no per-player results). */
  | 'duplicate'
  /** The same player picked on two teams; they get one email. */
  | 'same_player'
  | 'not_allowed'
  /** No message and no graded shot: the email would be empty, so it isn't sent. */
  | 'nothing_to_send'
  /** Player emails are switched off while the org features are being tested (lib/player-email-pause.ts). */
  | 'paused'

export interface ResolvedRecipient {
  teamId: string
  teamName: string
  key: string
  name: string
  firstName: string | null
  email: string | null
  /** 'family': a name-only player emailed at a sibling's (shared) address. */
  emailSource: 'own' | 'family' | null
  userId: string | null
  submissionId: string | null
  token: string | null
  score: number | null
  /** When that shot was graded (ISO); picks the newest copy of a multi-team player. */
  gradedAt: string | null
  orgId: string | null
  orgName: string | null
  status: RecipientStatus
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY_RE = /^(member|roster|pending):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Well-formed picks only, identical picks collapsed. */
export function parsePicks(value: unknown): RecipientPick[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const out: RecipientPick[] = []
  for (const v of value) {
    if (!v || typeof v !== 'object') return null
    const { teamId, key } = v as { teamId?: unknown; key?: unknown }
    if (typeof teamId !== 'string' || typeof key !== 'string') return null
    const id = `${teamId.toLowerCase()}|${key.toLowerCase()}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ teamId, key })
  }
  return out
}

function notAllowed(pick: RecipientPick): ResolvedRecipient {
  // Nothing about a team the sender can't see is echoed back.
  return {
    teamId: pick.teamId,
    teamName: '',
    key: pick.key,
    name: 'Unknown player',
    firstName: null,
    email: null,
    emailSource: null,
    userId: null,
    submissionId: null,
    token: null,
    score: null,
    gradedAt: null,
    orgId: null,
    orgName: null,
    status: 'not_allowed',
  }
}

function firstNameOf(p: RosterPlayer): string | null {
  const f = p.firstName?.trim()
  if (f) return f.charAt(0).toUpperCase() + f.slice(1)
  return null
}

/**
 * Resolves each pick against the sender's authorized teams.
 *
 * Who counts as "the same email" depends on the content:
 *  - `perPlayer` (each player's results are included): one email per PLAYER.
 *    Siblings sharing a family address each get their own email there, with
 *    their own score and link. Only the same player picked on two teams
 *    collapses (`same_player`).
 *  - otherwise: one email per ADDRESS (a family gets one copy); later
 *    occurrences are `duplicate`.
 * When `preferGraded`, the occurrence with the most recently graded shot
 * wins, so a player on two teams gets their latest score (and the release is
 * recorded on that shot's team) rather than an older or message-only copy.
 * With `content`, a recipient whose email would be empty (no message and no
 * graded shot) is `nothing_to_send`.
 */
export async function resolveRecipients(
  sender: PlayerEmailSender,
  picks: RecipientPick[],
  opts: { preferGraded?: boolean; perPlayer?: boolean; content?: PlayerEmailContent } = {}
): Promise<ResolvedRecipient[]> {
  const teams = await authorizedTeams(sender)
  const allowed = new Map(teams.map((t) => [t.id.toLowerCase(), t]))
  const needed = [
    ...new Set(
      picks
        .filter((p) => UUID_RE.test(p.teamId) && allowed.has(p.teamId.toLowerCase()))
        .map((p) => p.teamId.toLowerCase())
    ),
  ]
  const rosters = new Map<string, Map<string, RosterPlayer>>()
  await Promise.all(
    needed.map(async (teamId) => {
      const team = allowed.get(teamId)!
      const players = await teamResultsRoster(team.id)
      rosters.set(teamId, new Map(players.map((p) => [p.key.toLowerCase(), p])))
    })
  )

  const resolved: ResolvedRecipient[] = picks.map((pick) => {
    const teamId = pick.teamId.toLowerCase()
    const team = allowed.get(teamId)
    const player = team && KEY_RE.test(pick.key) ? rosters.get(teamId)?.get(pick.key.toLowerCase()) : undefined
    if (!team || !player) return notAllowed(pick)
    const reach = reachOf(player)
    return {
      teamId: team.id,
      teamName: team.name,
      key: player.key,
      name: player.name,
      firstName: firstNameOf(player),
      email: player.email ? player.email.trim().toLowerCase() : null,
      emailSource: player.emailSource,
      userId: player.userId,
      submissionId: player.submissionId,
      token: player.token,
      score: player.score,
      gradedAt: player.gradedAt,
      orgId: team.orgId,
      orgName: team.orgName,
      status: reach,
    }
  })

  // One email per player (perPlayer) or per address per send.
  const dupStatus: RecipientStatus = opts.perPlayer ? 'same_player' : 'duplicate'
  const identity = (r: ResolvedRecipient) =>
    opts.perPlayer ? (r.userId ? `user:${r.userId}` : `row:${r.teamId}|${r.key.toLowerCase()}`) : r.email!
  const primary = new Map<string, number>()
  resolved.forEach((r, i) => {
    if (r.status !== 'ok' || !r.email) return
    const id = identity(r)
    const at = primary.get(id)
    if (at === undefined) {
      primary.set(id, i)
      return
    }
    const current = resolved[at]
    if (opts.preferGraded && gradedLater(r, current)) {
      current.status = dupStatus
      primary.set(id, i)
    } else {
      r.status = dupStatus
    }
  })
  if (opts.content) {
    const content = opts.content
    for (const r of resolved) {
      if (r.status === 'ok' && wouldBeEmpty(r, content)) r.status = 'nothing_to_send'
    }
  }
  return resolved
}

function hasGradedShot(r: ResolvedRecipient): boolean {
  return !!r.token && r.score !== null
}

/** `a` has a graded shot, and `b` has none or an older one. */
function gradedLater(a: ResolvedRecipient, b: ResolvedRecipient): boolean {
  if (!hasGradedShot(a)) return false
  if (!hasGradedShot(b)) return true
  const ta = a.gradedAt ? Date.parse(a.gradedAt) : NaN
  const tb = b.gradedAt ? Date.parse(b.gradedAt) : NaN
  if (Number.isNaN(ta)) return false
  return Number.isNaN(tb) || ta > tb
}

/**
 * The email would have no message and no score card. The stock results
 * template never is: an empty message there gets the honest no-shot text
 * (see buildPlayerEmail).
 */
export function wouldBeEmpty(r: ResolvedRecipient, content: PlayerEmailContent): boolean {
  if (content.message.trim()) return false
  if (content.includeResults && hasGradedShot(r)) return false
  return !(content.includeResults && content.template === 'results')
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const TEMPLATE_IDS = new Set<string>(PLAYER_EMAIL_TEMPLATES.map((t) => t.id))

export type ContentResult = { ok: true; content: PlayerEmailContent } | { ok: false; error: string }

/**
 * Validates the composer's content. An empty subject or message falls back to
 * the template's default text (the same text the composer shows). For a send,
 * a subject is required, and a message is required unless each player's
 * results are included. A preview is lenient so it can render while typing.
 */
export function normalizeContent(raw: unknown, mode: 'send' | 'preview'): ContentResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'content is required' }
  const c = raw as Record<string, unknown>
  const template = c.template === undefined ? 'message' : c.template
  if (typeof template !== 'string' || !TEMPLATE_IDS.has(template)) {
    return { ok: false, error: 'Unknown template' }
  }
  if (c.subject !== undefined && typeof c.subject !== 'string') return { ok: false, error: 'subject must be text' }
  if (c.message !== undefined && typeof c.message !== 'string') return { ok: false, error: 'message must be text' }
  const defaults = playerEmailTemplate(template as PlayerEmailTemplateId).defaults

  const rawSubject = ((c.subject as string | undefined) ?? '').trim()
  if (rawSubject.length > PLAYER_EMAIL_LIMITS.subject) {
    return { ok: false, error: `Keep the subject under ${PLAYER_EMAIL_LIMITS.subject} characters` }
  }
  const rawMessage = ((c.message as string | undefined) ?? '').replace(/\r\n?/g, '\n').trim()
  if (rawMessage.length > PLAYER_EMAIL_LIMITS.message) {
    return { ok: false, error: `Keep the message under ${PLAYER_EMAIL_LIMITS.message} characters` }
  }
  const includeResults = c.includeResults === true
  const subject = cleanSubject(rawSubject) || defaults.subject
  const message = rawMessage || (includeResults ? '' : defaults.message)

  if (mode === 'send') {
    if (!subject) return { ok: false, error: 'Add a subject' }
    if (!message && !includeResults) {
      return { ok: false, error: "Write a message, or include each player's results" }
    }
  }
  return {
    ok: true,
    content: {
      template: template as PlayerEmailTemplateId,
      subject,
      message,
      includeResults,
      includeOffers: c.includeOffers === true,
      includeShopLink: c.includeShopLink === true,
    },
  }
}

function fillTokens(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(first_name|team|org|coach)\s*\}\}/gi, (_, name: string) => vars[name.toLowerCase()] ?? '')
}

// ---------------------------------------------------------------------------
// Rendering + sending
// ---------------------------------------------------------------------------

interface OrgContext {
  offers: OrgOffer[]
}

type OrgCache = Map<string, Promise<OrgContext>>

function orgContext(cache: OrgCache, orgId: string): Promise<OrgContext> {
  let ctx = cache.get(orgId)
  if (!ctx) {
    ctx = getPurchasableOffers(orgId).then((offers) => ({ offers }))
    cache.set(orgId, ctx)
  }
  return ctx
}

export interface BuiltPlayerEmail {
  subject: string
  text: string
  html: string
  /** True when this player's score card and results link are in the email. */
  includesScore: boolean
  /** The org the results release is recorded under (null: no release). */
  releaseOrgId: string | null
  /** Always 'full' when there is a release: team uploads are never paywalled. */
  freeTier: VisibilityTier | null
}

export async function buildPlayerEmail(
  sender: PlayerEmailSender,
  recipient: ResolvedRecipient,
  content: PlayerEmailContent,
  cache: OrgCache = new Map(),
  fallbackEmail = 'player@example.com'
): Promise<BuiltPlayerEmail> {
  const sig = senderSignature(sender)
  const orgName = recipient.orgName ?? sender.orgName
  const vars = {
    first_name: recipient.firstName || 'there',
    team: recipient.teamName,
    org: orgName || recipient.teamName,
    coach: sig.name,
  }
  const ctx = recipient.orgId ? await orgContext(cache, recipient.orgId) : null

  const hasScore = content.includeResults && hasGradedShot(recipient)

  // The stock results text says "your score is below". For a player with no
  // graded shot yet that would be false, so the untouched default gets an
  // honest version instead. Anything the sender wrote themselves is kept.
  let subjectText = content.subject
  let messageText = content.message
  // An EMPTY message on the results template means "just the score"; with no
  // score that would leave only the footer, so it gets the honest text too.
  if (content.includeResults && !hasScore) {
    const stock = playerEmailTemplate('results').defaults
    const emptyResults = content.template === 'results' && !messageText.trim()
    if (messageText === stock.message || emptyResults) messageText = NO_SHOT_MESSAGE
    if (subjectText === stock.subject) subjectText = NO_SHOT_SUBJECT
  }
  const results: PlayerEmailResultsBlock | null = hasScore
    ? {
        score: recipient.score!,
        token: recipient.token!,
      }
    : null

  let offers: PlayerEmailOffersBlock | null = null
  if (content.includeOffers && ctx && recipient.orgId) {
    // With a results link, every offer is buyable from the results page.
    // Without one, only what the org's public offers page sells.
    const items = (hasScore ? ctx.offers : ctx.offers.filter((o) => o.includesBall || o.includesCourse)).map((o) => ({
      title: o.title,
      description: o.description,
      priceCents: effectivePriceCents(o),
      regularPriceCents: o.regularPriceCents,
    }))
    if (items.length) {
      offers = hasScore
        ? {
            heading: `Available from ${orgName || recipient.teamName}`,
            items,
            note: 'Buy any of these from your results page, using the button above.',
          }
        : {
            heading: `Available from ${orgName || recipient.teamName}`,
            items,
            href: `${BASE_URL}/offers/${recipient.orgId}`,
            cta: 'See details and sign up',
          }
    }
  }

  const rendered = renderPlayerEmail({
    recipientEmail: recipient.email ?? fallbackEmail,
    subject: fillTokens(subjectText, vars),
    message: fillTokens(messageText, vars),
    orgName,
    teamName: recipient.teamName,
    sender: sig,
    results,
    offers,
    shopLink: content.includeShopLink,
  })
  return {
    ...rendered,
    includesScore: hasScore,
    releaseOrgId: hasScore && recipient.orgId ? recipient.orgId : null,
    freeTier: ctx ? 'full' : null,
  }
}

export interface SendReport {
  sent: Array<{ name: string; team: string; email: string; includesScore: boolean }>
  skipped: Array<{ name: string; team: string; reason: Exclude<RecipientStatus, 'ok'>; detail: string }>
  failed: Array<{ name: string; team: string }>
  total: number
}

export const SKIP_DETAIL: Record<Exclude<RecipientStatus, 'ok'>, string> = {
  no_email: 'No email on file',
  unsubscribed: 'Unsubscribed from these emails',
  bounced: 'Email address bounced',
  duplicate: 'Same email as another selected player (sent once)',
  same_player: 'Also selected on another team (sent once)',
  not_allowed: 'Not on a team you can email',
  nothing_to_send: 'No message and no graded shot yet, so the email would be empty',
  paused: 'Player emails are paused while the org features are being tested',
}

export function skippedOf(recipients: ResolvedRecipient[]): SendReport['skipped'] {
  return recipients
    .filter((r): r is ResolvedRecipient & { status: Exclude<RecipientStatus, 'ok'> } => r.status !== 'ok')
    .map((r) => ({ name: r.name, team: r.teamName, reason: r.status, detail: SKIP_DETAIL[r.status] }))
}

/**
 * Sends to every `ok` recipient with bounded concurrency. For a results email
 * on an org team, the result_releases row goes in BEFORE the email (so the
 * "Shared with you by" line and the org's ball/class offers show), under the
 * team's org, with free_tier 'full' — team uploads always show the full
 * report; a fresh row is removed again if the email fails.
 * `unlocked` is never touched.
 */
export async function sendPlayerEmails(
  sender: PlayerEmailSender,
  content: PlayerEmailContent,
  recipients: ResolvedRecipient[],
  emailType = 'player_email'
): Promise<SendReport> {
  // Never send an empty body, even if a caller skipped resolveRecipients' check.
  for (const r of recipients) {
    if (r.status === 'ok' && wouldBeEmpty(r, content)) r.status = 'nothing_to_send'
    // Testing kill switch: nothing is sent and no result_releases row is written.
    if (r.status === 'ok' && PLAYER_EMAILS_PAUSED) r.status = 'paused'
  }
  const report: SendReport = { sent: [], skipped: skippedOf(recipients), failed: [], total: recipients.length }
  const deliverable = recipients.filter((r) => r.status === 'ok' && r.email)
  const cache: OrgCache = new Map()

  for (let i = 0; i < deliverable.length; i += SEND_CHUNK) {
    const batch = deliverable.slice(i, i + SEND_CHUNK)
    const results = await Promise.allSettled(
      batch.map(async (r) => {
        const email = r.email!
        const built = await buildPlayerEmail(sender, r, content, cache)
        let release: { id: string; inserted: boolean } | undefined
        if (built.releaseOrgId && built.freeTier && r.submissionId) {
          ;[release] = (await db`
            INSERT INTO result_releases (
              org_id, team_id, submission_id, recipient_user_id, recipient_email, free_tier, sent_at
            ) VALUES (
              ${built.releaseOrgId}, ${r.teamId}, ${r.submissionId}, ${r.userId}, ${email},
              ${built.freeTier}, NOW()
            )
            ON CONFLICT (submission_id) DO UPDATE
              SET free_tier = EXCLUDED.free_tier,
                  recipient_email = EXCLUDED.recipient_email,
                  recipient_user_id = COALESCE(result_releases.recipient_user_id, EXCLUDED.recipient_user_id),
                  resent_at = NOW()
            RETURNING id, (xmax = 0) AS inserted
          `) as unknown as [{ id: string; inserted: boolean }]
        }
        try {
          await sendPlayerEmail({
            to: email,
            fromName: sender.displayName,
            replyTo: sender.replyTo,
            subject: built.subject,
            text: built.text,
            html: built.html,
          })
        } catch (err) {
          if (release?.inserted) {
            await db`DELETE FROM result_releases WHERE id = ${release.id} AND unlocked = FALSE`.catch(() => {})
          }
          throw err
        }
        try {
          await db`INSERT INTO email_logs (email, email_type) VALUES (${email}, ${emailType})`
        } catch (err) {
          console.error('[player-email] email_logs insert failed:', err)
        }
        return built.includesScore
      })
    )
    results.forEach((res, idx) => {
      const r = batch[idx]
      if (res.status === 'fulfilled') {
        report.sent.push({ name: r.name, team: r.teamName, email: r.email!, includesScore: res.value })
      } else {
        console.error('[player-email] send failed:', res.reason)
        report.failed.push({ name: r.name, team: r.teamName })
      }
    })
  }
  return report
}
