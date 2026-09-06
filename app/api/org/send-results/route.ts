import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { rateLimit } from '@/lib/rate-limit'
import { orgTeam, sendableSubmissions } from '@/lib/org-results'
import { getOrgResultSettings, getPurchasableOffers } from '@/lib/org-offers-db'
import { effectivePriceCents } from '@/lib/org-offers'
import { TIER_LABELS, tierRank } from '@/lib/result-visibility'
import { renderOrgResultsEmail, sendOrgResultsEmail, type OrgResultsEmailInput } from '@/lib/email'

// Send at most this many emails concurrently (announce-route convention).
const SEND_CHUNK = 20

// Emails selected players their latest score with a link to their report,
// creating (or refreshing) the result_releases row that decides how much of
// the report the link shows. `action: 'preview'` renders the first player's
// email and sends nothing.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    teamId?: string
    submissionIds?: unknown
    action?: string
  }
  const teamId = (body.teamId ?? '').toString()
  const submissionIds = Array.isArray(body.submissionIds)
    ? body.submissionIds.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
    : []
  const preview = body.action === 'preview'

  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })
  if (submissionIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one player with a graded shot' }, { status: 400 })
  }
  if (submissionIds.length > 500) {
    return NextResponse.json({ error: 'Send to at most 500 players at a time' }, { status: 400 })
  }

  try {
    if (!(await orgIsEntitledById(session.orgId))) {
      return NextResponse.json({ error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true }, { status: 402 })
    }
    const team = await orgTeam(session.orgId, teamId)
    if (!team) return NextResponse.json({ error: 'Not your team' }, { status: 403 })

    const [org] = (await db`SELECT name, admin_email FROM organizations WHERE id = ${session.orgId}`) as unknown as [
      { name: string; admin_email: string } | undefined,
    ]
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const [settings, offers, subs] = await Promise.all([
      getOrgResultSettings(session.orgId),
      getPurchasableOffers(session.orgId),
      sendableSubmissions(teamId, submissionIds),
    ])
    const paywalled = tierRank(settings.freeTier) < tierRank(settings.unlockTier)
    const emailOffers = offers.map((o) => ({
      title: o.title,
      description: o.description,
      priceCents: effectivePriceCents(o),
      regularPriceCents: o.regularPriceCents,
    }))

    const buildInput = (s: (typeof subs)[number], email: string): OrgResultsEmailInput => ({
      playerName: s.playerName ? s.playerName.split(' ')[0] : null,
      orgName: org.name,
      teamName: team.name,
      score: s.score,
      token: s.token,
      freeTierLabel: TIER_LABELS[settings.freeTier],
      paywalled,
      offers: emailOffers,
      recipientEmail: email,
    })

    if (preview) {
      const first = subs[0]
      if (!first) return NextResponse.json({ error: 'No graded shot to preview' }, { status: 400 })
      const rendered = renderOrgResultsEmail(buildInput(first, first.email ?? 'player@example.com'))
      return NextResponse.json({ preview: rendered, token: first.token })
    }

    // Cap how often one org can blast — a careless or compromised account
    // can't repeatedly mail every family. Per-row resends count too.
    const limit = await rateLimit(`org-results:${session.orgId}`, 20, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'You have sent results several times recently — please wait a bit before sending again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const skippedUnreachable: string[] = []
    const skippedSuppressed: string[] = []
    const failed: string[] = []
    let sent = 0

    const deliverable = subs.filter((s) => {
      const label = s.playerName ?? 'A player'
      if (!s.email) {
        skippedUnreachable.push(label)
        return false
      }
      if (s.unsubscribed || s.bounced) {
        skippedSuppressed.push(label)
        return false
      }
      return true
    })

    for (let i = 0; i < deliverable.length; i += SEND_CHUNK) {
      const batch = deliverable.slice(i, i + SEND_CHUNK)
      const results = await Promise.allSettled(
        batch.map(async (s) => {
          const email = s.email!.toLowerCase()
          // The release row decides what the link shows. Created on first
          // send; a resend refreshes the free-tier snapshot and stamps
          // resent_at. Never touches `unlocked` — a paid unlock survives.
          // It goes in BEFORE the email so the link can never be opened
          // ungated; if the email then fails on a first send, the fresh row
          // is removed again so the roster doesn't claim "Sent".
          const [release] = (await db`
            INSERT INTO result_releases (
              org_id, team_id, submission_id, recipient_user_id, recipient_email, free_tier, sent_at
            ) VALUES (
              ${session.orgId}, ${teamId}, ${s.submissionId}, ${s.userId}, ${email},
              ${settings.freeTier}, NOW()
            )
            ON CONFLICT (submission_id) DO UPDATE
              SET free_tier = EXCLUDED.free_tier,
                  recipient_email = EXCLUDED.recipient_email,
                  recipient_user_id = COALESCE(result_releases.recipient_user_id, EXCLUDED.recipient_user_id),
                  resent_at = NOW()
            RETURNING id, (xmax = 0) AS inserted
          `) as unknown as [{ id: string; inserted: boolean }]
          try {
            await sendOrgResultsEmail(buildInput(s, email), org.admin_email)
          } catch (err) {
            if (release?.inserted) {
              await db`DELETE FROM result_releases WHERE id = ${release.id} AND unlocked = FALSE`
            }
            throw err
          }
          await db`INSERT INTO email_logs (email, email_type) VALUES (${email}, 'org_results')`
          return s
        })
      )
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') sent += 1
        else {
          console.error('[org/send-results] send failed:', r.reason)
          failed.push(batch[idx].playerName ?? 'A player')
        }
      })
    }

    // Anything requested but not returned by sendableSubmissions wasn't this
    // team's (or isn't graded yet) — report it rather than silently dropping.
    const known = new Set(subs.map((s) => s.submissionId))
    const rejected = submissionIds.filter((id) => !known.has(id)).length

    return NextResponse.json({
      success: true,
      sent,
      skippedUnreachable,
      skippedSuppressed,
      failed,
      rejected,
      teamAccessCode: team.accessCode,
    })
  } catch (err) {
    console.error('[org/send-results] failed:', err)
    return NextResponse.json({ error: 'Could not send results' }, { status: 500 })
  }
}
