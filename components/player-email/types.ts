// Client-side shapes for the /api/player-email/* routes, plus the small pure
// helpers the composer's steps share. The server re-resolves every recipient,
// so nothing here is trusted — it only drives what the sender sees.

export type SenderAs = 'org' | 'coach'

export interface AudiencePlayer {
  key: string
  kind?: 'member' | 'roster' | 'pending'
  userId: string | null
  teamPlayerId: string | null
  name: string
  email: string | null
  /** 'family': a name-only player reached at a sibling's shared address. */
  emailSource?: 'own' | 'family' | null
  /** Whose account a family email belongs to ("Olivia P."). */
  familyOf?: string | null
  /** Another row on the team has the same name; `detail` tells them apart. */
  sameNameAsAnother?: boolean
  detail?: string | null
  submissionId: string | null
  token: string | null
  score: number | null
  gradedAt: string | null
  sentAt: string | null
  resentAt: string | null
  unlocked: boolean
  unsubscribed: boolean
  bounced: boolean
  /** Added by email, account not set up yet: results go out as a "finish setup" email. */
  setupPending?: boolean
  /** Every graded shot the team holds for this player, newest first. */
  shots?: AudienceShot[]
}

export interface AudienceShot {
  submissionId: string
  score: number
  gradedAt: string | null
  thumb: string | null
  /** When results for this shot were last emailed. */
  sentAt: string | null
}

export interface AudienceTeam {
  id: string
  name: string
  ageGroup: string | null
  coachName: string | null
  players: AudiencePlayer[]
}

export interface Audience {
  sender: { kind: SenderAs; displayName: string; replyTo: string; fromHeader: string }
  teams: AudienceTeam[]
  offers: { count: number; titles: string[] }
}

export interface PreviewResponse {
  subject: string
  html: string
  fromHeader: string
  replyTo: string
  to: string
  includesScore: boolean
  /** 'setup': this player gets the "finish setting up to see your results" version. */
  variant?: 'results' | 'setup'
}

export interface SendResponse {
  sent: Array<{ name: string; team: string; email: string; setupRequired?: boolean; shotCount?: number }>
  skipped: Array<{ name: string; team: string; reason: string }>
  failed: Array<{ name: string; team: string }>
  total: number
}

/** A selectable row: one player on one team. */
export function pickId(teamId: string, key: string): string {
  return `${teamId}|${key}`
}

/** Shown under a player reached through a sibling's address. */
export function familyEmailLabel(p: AudiencePlayer): string | null {
  if (p.emailSource !== 'family' || !p.email) return null
  return p.familyOf ? `Uses ${p.familyOf}'s family email` : 'Uses a family email'
}

/** Why a player cannot be emailed, in plain words — or null when they can. */
export function blockReason(p: AudiencePlayer): string | null {
  if (!p.email) return 'No email on file'
  if (p.bounced) return 'Email address bounced'
  if (p.unsubscribed) return 'Unsubscribed from emails'
  return null
}

export function canEmail(p: AudiencePlayer): boolean {
  return blockReason(p) === null
}

/** With results included, this player gets the "finish setting up to see your results" email. */
export function getsSetupEmail(p: AudiencePlayer, includeResults: boolean): boolean {
  return includeResults && !!p.setupPending && !!p.userId && hasGradedShot(p)
}

/** Server skip codes → plain words. Unknown codes are shown as-is, tidied. */
export function skipReasonText(reason: string): string {
  switch (reason) {
    case 'no_email':
      return 'No email on file'
    case 'unsubscribed':
      return 'Unsubscribed from emails'
    case 'bounced':
      return 'Email address bounced'
    case 'duplicate':
      return 'Same email address as another player in this send (they got one email)'
    case 'same_player':
      return 'Also selected on another team (they got one email)'
    case 'not_allowed':
      return 'Not on a team you can email'
    case 'nothing_to_send':
      return 'No message and no graded shot yet, so nothing was sent'
    case 'nothing_new':
      return 'No new shots since their last results email'
    case 'shots_unavailable':
      return 'The chosen shots are not available for this player any more'
    case 'recently_emailed':
      return "Hasn't set up their account and already got several emails about it in the last hour. Try again later"
    default:
      return reason.replace(/_/g, ' ')
  }
}

export function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export interface Recipient {
  id: string
  team: AudienceTeam
  player: AudiencePlayer
}

export interface Duplicate extends Recipient {
  /** The recipient who actually gets the one email for this address. */
  keptBy: Recipient
  /** Same player on two teams (vs. two players sharing one address). */
  samePerson: boolean
}

/**
 * Selected rows → who actually gets an email. Mirrors the server
 * (resolveRecipients): with `perPlayer` (results included) one email per
 * player, so siblings sharing an address each get their own, and a player
 * picked on several teams gets the copy with their most recently graded shot;
 * otherwise one per address, first occurrence (team order, then roster order)
 * wins.
 */
export function resolveSelection(
  teams: AudienceTeam[],
  selected: ReadonlySet<string>,
  perPlayer = false,
): { recipients: Recipient[]; duplicates: Duplicate[]; teamIds: Set<string> } {
  const recipients: Recipient[] = []
  const duplicates: Duplicate[] = []
  const byEmail = new Map<string, Recipient>()
  const teamIds = new Set<string>()
  for (const team of teams) {
    for (const player of team.players) {
      const id = pickId(team.id, player.key)
      if (!selected.has(id) || !canEmail(player)) continue
      teamIds.add(team.id)
      const addr = perPlayer
        ? player.userId
          ? `user:${player.userId}`
          : `row:${team.id}|${player.key.toLowerCase()}`
        : player.email!.trim().toLowerCase()
      const first = byEmail.get(addr)
      const r: Recipient = { id, team, player }
      if (first) {
        const samePerson =
          first.player.key === player.key || (!!player.userId && first.player.userId === player.userId)
        if (perPlayer && gradedLater(player, first.player)) {
          // This team's copy has the newer shot: it takes the email.
          recipients[recipients.indexOf(first)] = r
          byEmail.set(addr, r)
          for (const d of duplicates) if (d.keptBy === first) d.keptBy = r
          duplicates.push({ ...first, keptBy: r, samePerson })
        } else {
          duplicates.push({ ...r, keptBy: first, samePerson })
        }
      } else {
        byEmail.set(addr, r)
        recipients.push(r)
      }
    }
  }
  return { recipients, duplicates, teamIds }
}

function hasGradedShot(p: AudiencePlayer): boolean {
  return !!p.token && p.score !== null
}

/** Mirrors the server: `a` has a graded shot, and `b` has none or an older one. */
function gradedLater(a: AudiencePlayer, b: AudiencePlayer): boolean {
  if (!hasGradedShot(a)) return false
  if (!hasGradedShot(b)) return true
  const ta = a.gradedAt ? Date.parse(a.gradedAt) : NaN
  const tb = b.gradedAt ? Date.parse(b.gradedAt) : NaN
  if (Number.isNaN(ta)) return false
  return Number.isNaN(tb) || ta > tb
}

export const CARD = 'bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl'

export const INPUT =
  'w-full rounded-xl border border-gray-300 dark:border-courtline bg-white dark:bg-ink-950 px-3.5 py-2.5 ' +
  'text-sm text-gray-900 dark:text-chalk placeholder:text-gray-400 dark:placeholder:text-chalk-dim/70 ' +
  'focus:outline-none focus:border-ember-500 focus-visible:ring-2 focus-visible:ring-ember-400/60'

export const CHECKBOX = 'w-4 h-4 shrink-0 accent-ember-500 cursor-pointer disabled:cursor-not-allowed'

/** Graded shots a player has on this team (newest first). */
export function shotsOf(p: AudiencePlayer): AudienceShot[] {
  return p.shots ?? []
}

/** Shots whose results haven't been emailed yet. */
export function unsentShots(p: AudiencePlayer): AudienceShot[] {
  return shotsOf(p).filter((s) => !s.sentAt)
}

/** "Sep 30", or "Sep 30, 4:12 PM" with `withTime`. */
export function shotDate(iso: string | null, withTime = false): string {
  if (!iso) return 'Undated'
  const d = new Date(iso)
  return withTime
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
