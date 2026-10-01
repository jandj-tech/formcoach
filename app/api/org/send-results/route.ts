import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { rateLimit } from '@/lib/rate-limit'
import { orgTeam, sendableSubmissions } from '@/lib/org-results'
import { getPurchasableOffers } from '@/lib/org-offers-db'
import { effectivePriceCents } from '@/lib/org-offers'
import {
  renderOrgResultsEmail,
  renderPlayerResultsSetupEmail,
  sendOrgResultsEmail,
  sendOrgResultsSetupEmail,
  type OrgResultsEmailInput,
  type PlayerResultsSetupEmailInput,
} from '@/lib/email'
import {
  RESULTS_SETUP_PREVIEW_URL,
  resultsLandingPath,
  resultsSetupLink,
  setupRecipientFacts,
  type SetupRecipientFacts,
} from '@/lib/results-setup'

// Send at most this many emails concurrently (announce-route convention).
const SEND_CHUNK = 20

// Emails selected players their latest score with a link to their report,
// creating (or refreshing) the result_releases row. Team uploads always show
// the player the full report, so every release is stored with free_tier
// 'full'. `action: 'preview'` renders the first player's email and sends
// nothing.
//
// A player whose account isn't set up yet (added by email, no password) gets
// ONE "finish setting up to see your results" email instead — no score, no
// results link — however many of their shots are in the send; the setup link
// lands them on their results. Set-up players' emails are unchanged.
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

    const [offers, subs] = await Promise.all([
      getPurchasableOffers(session.orgId),
      sendableSubmissions(teamId, submissionIds),
    ])
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
      offers: emailOffers,
      recipientEmail: email,
    })

    // The setup email for a not-set-up player (url omitted: preview placeholder).
    const buildSetupInput = (
      s: (typeof subs)[number],
      email: string,
      count: number,
      facts: SetupRecipientFacts | undefined,
      url?: string
    ): PlayerResultsSetupEmailInput => {
      const first = s.playerName ? s.playerName.split(' ')[0] : null
      return {
        recipientEmail: email,
        subject: `${first ? `${first}, your` : 'Your'} shot results from ${org.name} are ready`,
        message: '',
        firstName: first,
        playerLabel: s.playerName ?? facts?.accountLabel ?? null,
        orgName: org.name,
        teamName: team.name,
        sender: { kind: 'org', name: org.name },
        shotCount: count,
        setupUrl: url ?? RESULTS_SETUP_PREVIEW_URL,
        sharedInbox: facts?.sharedInbox ?? false,
      }
    }

    if (preview) {
      const first = subs[0]
      if (!first) return NextResponse.json({ error: 'No graded shot to preview' }, { status: 400 })
      if (first.setupPending && first.userId) {
        const facts = (await setupRecipientFacts([first.userId])).get(first.userId)
        const rendered = renderPlayerResultsSetupEmail(
          buildSetupInput(first, first.email ?? 'player@example.com', 1, facts)
        )
        // No token: this version carries no results link.
        return NextResponse.json({ preview: rendered, token: null, variant: 'setup' })
      }
      const rendered = renderOrgResultsEmail(buildInput(first, first.email ?? 'player@example.com'))
      return NextResponse.json({ preview: rendered, token: first.token, variant: 'results' })
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
    const skippedRecentlyEmailed: string[] = []
    const failed: string[] = []
    let sent = 0
    let sentSetup = 0

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

    // Not set up yet: one setup email per player, grouped across their shots.
    const pendingByUser = new Map<string, (typeof subs)[number][]>()
    for (const s of deliverable) {
      if (!s.setupPending || !s.userId) continue
      pendingByUser.set(s.userId, [...(pendingByUser.get(s.userId) ?? []), s])
    }
    const normal = deliverable.filter((s) => !(s.setupPending && s.userId))

    const insertRelease = async (s: (typeof subs)[number], email: string) => {
      // The release row records the send (always free_tier 'full').
      // Created on first send; a resend re-stamps 'full' (repairing any
      // older lower snapshot) and resent_at. Never touches `unlocked`.
      const [release] = (await db`
        INSERT INTO result_releases (
          org_id, team_id, submission_id, recipient_user_id, recipient_email, free_tier, sent_at
        ) VALUES (
          ${session.orgId}, ${teamId}, ${s.submissionId}, ${s.userId}, ${email},
          'full', NOW()
        )
        ON CONFLICT (submission_id) DO UPDATE
          SET free_tier = EXCLUDED.free_tier,
              recipient_email = EXCLUDED.recipient_email,
              recipient_user_id = COALESCE(result_releases.recipient_user_id, EXCLUDED.recipient_user_id),
              resent_at = NOW()
        RETURNING id, (xmax = 0) AS inserted
      `) as unknown as [{ id: string; inserted: boolean }]
      return release
    }

    const pendingGroups = [...pendingByUser.entries()]
    const pendingFacts = await setupRecipientFacts(pendingGroups.map(([userId]) => userId))
    for (let i = 0; i < pendingGroups.length; i += SEND_CHUNK) {
      const batch = pendingGroups.slice(i, i + SEND_CHUNK)
      const results = await Promise.allSettled(
        batch.map(async ([userId, list]) => {
          const s = list[0]
          const email = s.email!.toLowerCase()
          const link = await resultsSetupLink(userId, resultsLandingPath(list.map((x) => x.submissionId)))
          if (!link.ok) {
            if (link.reason === 'rate_limited') return 'limited' as const
            // Finished setup a moment ago: they get the normal results emails.
            normal.push(...list)
            return 'normal' as const
          }
          const releases = []
          for (const x of list) releases.push(await insertRelease(x, email))
          try {
            await sendOrgResultsSetupEmail(
              buildSetupInput(s, email, list.length, pendingFacts.get(userId), link.url),
              org.admin_email
            )
          } catch (err) {
            for (const r of releases) {
              if (r?.inserted) await db`DELETE FROM result_releases WHERE id = ${r.id} AND unlocked = FALSE`
            }
            throw err
          }
          await db`INSERT INTO email_logs (email, email_type) VALUES (${email}, 'org_results')`
          return 'sent' as const
        })
      )
      results.forEach((r, idx) => {
        const label = batch[idx][1][0].playerName ?? 'A player'
        if (r.status === 'rejected') {
          console.error('[org/send-results] setup send failed:', r.reason)
          failed.push(label)
        } else if (r.value === 'sent') {
          sent += 1
          sentSetup += 1
        } else if (r.value === 'limited') {
          skippedRecentlyEmailed.push(label)
        }
      })
    }

    for (let i = 0; i < normal.length; i += SEND_CHUNK) {
      const batch = normal.slice(i, i + SEND_CHUNK)
      const results = await Promise.allSettled(
        batch.map(async (s) => {
          const email = s.email!.toLowerCase()
          // The release row records the send (always free_tier 'full').
          // Created on first send; a resend re-stamps 'full' (repairing any
          // older lower snapshot) and resent_at. Never touches `unlocked`.
          // It goes in BEFORE the email; if the email then fails on a first
          // send, the fresh row is removed again so the roster doesn't claim
          // "Sent".
          const [release] = (await db`
            INSERT INTO result_releases (
              org_id, team_id, submission_id, recipient_user_id, recipient_email, free_tier, sent_at
            ) VALUES (
              ${session.orgId}, ${teamId}, ${s.submissionId}, ${s.userId}, ${email},
              'full', NOW()
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
      // Additive: not set up yet, and already sent several setup emails recently.
      skippedRecentlyEmailed,
      // Additive: how many of `sent` were "finish setting up to see your results".
      sentSetup,
      failed,
      rejected,
      teamAccessCode: team.accessCode,
    })
  } catch (err) {
    console.error('[org/send-results] failed:', err)
    return NextResponse.json({ error: 'Could not send results' }, { status: 500 })
  }
}
