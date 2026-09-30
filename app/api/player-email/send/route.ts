import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { PLAYER_EMAIL_LIMITS } from '@/lib/player-email-templates'
import {
  normalizeContent,
  parseAs,
  parsePicks,
  resolveRecipients,
  resolveSender,
  sendPlayerEmails,
  skippedOf,
} from '@/lib/player-email'

// Emails delivered per hour, across all sends. An org-wide send to a large
// club fits in one go; a coach's budget covers several whole-team messages.
const ORG_RECIPIENTS_PER_HOUR = 1500
const COACH_RECIPIENTS_PER_HOUR = 300

// Sends one composed email to the selected players, each personalized and
// re-resolved server-side. Response:
//   { sent:[{name,team,email}], skipped:[{name,team,reason}], failed:[{name,team}], total }
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    as?: unknown
    content?: unknown
    recipients?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const as = parseAs(body.as)
  if (!as) return NextResponse.json({ error: "as must be 'org' or 'coach'" }, { status: 400 })

  const picks = parsePicks(body.recipients)
  if (!picks) return NextResponse.json({ error: 'recipients must be a list of players' }, { status: 400 })
  if (picks.length === 0) return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
  if (picks.length > PLAYER_EMAIL_LIMITS.recipients) {
    return NextResponse.json(
      { error: `Send to at most ${PLAYER_EMAIL_LIMITS.recipients} players at a time` },
      { status: 400 }
    )
  }

  const parsed = normalizeContent(body.content, 'send')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const content = parsed.content

  try {
    const sender = await resolveSender(req, as)
    if (!sender) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    if (sender.kind === 'org' && !(await orgIsEntitledById(sender.orgId))) {
      return NextResponse.json({ error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true }, { status: 402 })
    }

    const recipients = await resolveRecipients(sender, picks, {
      preferGraded: content.includeResults,
      // With results, every child gets their own email (siblings too).
      perPlayer: content.includeResults,
      // A player who would get neither a message nor a score is skipped.
      content,
    })

    // Nothing the sender is allowed to reach: refuse outright, send nothing.
    if (recipients.every((r) => r.status === 'not_allowed')) {
      return NextResponse.json(
        {
          error: 'You can only email players on your own teams',
          sent: [],
          skipped: skippedOf(recipients),
          failed: [],
          total: recipients.length,
        },
        { status: 403 }
      )
    }

    // Nobody reachable (no emails / all unsubscribed): report, don't burn quota.
    if (!recipients.some((r) => r.status === 'ok')) {
      return NextResponse.json({ sent: [], skipped: skippedOf(recipients), failed: [], total: recipients.length })
    }

    // A careless or compromised account can't repeatedly mail every family.
    const bucket =
      sender.kind === 'org' ? `player-email:org:${sender.orgId}` : `player-email:team:${sender.teamId}`
    const limit = await rateLimit(bucket, sender.kind === 'org' ? 20 : 10, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'You have sent several emails in the last hour. Please wait a little before sending another.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    // Send count alone would still allow 20 x 1000 emails an hour; cap the
    // number of RECIPIENTS too, which is what protects the shared sending
    // domain's reputation if an account is compromised.
    const deliverable = recipients.filter((r) => r.status === 'ok').length
    const budget = sender.kind === 'org' ? ORG_RECIPIENTS_PER_HOUR : COACH_RECIPIENTS_PER_HOUR
    const volume = await rateLimit(`${bucket}:recipients`, budget, 3600, deliverable)
    if (!volume.ok) {
      return NextResponse.json(
        {
          error: `That would go over the limit of ${budget} emails an hour. Send to fewer players now and the rest a little later.`,
        },
        { status: 429, headers: { 'Retry-After': String(volume.retryAfterSeconds) } }
      )
    }

    const report = await sendPlayerEmails(sender, content, recipients)
    return NextResponse.json(report)
  } catch (err) {
    console.error('[player-email/send] failed:', err)
    return NextResponse.json({ error: 'Could not send the email' }, { status: 500 })
  }
}
