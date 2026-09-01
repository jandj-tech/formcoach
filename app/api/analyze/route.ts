import { NextRequest, NextResponse } from 'next/server'
import { putObject, storageDriver } from '@/lib/storage'
import { db } from '@/lib/db'
import { analyzeShot } from '@/lib/analyze'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { maybeSendFilmingTips } from '@/lib/filming-tips'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'
import {
  getPlayerSubscription,
  markSubmissionFailed,
  reserveSubscriptionAnalysis,
  subscriptionEntitled,
} from '@/lib/player-subscription'
import crypto from 'crypto'

export const maxDuration = 300

// Cost/OOM guards on the frame array. The client sends ~25-28 small JPEGs; the
// old route accepted any number of any size and fed them all into 4 Claude
// vision calls (unbounded spend) while base64-holding them in memory
// (unbounded RAM). These ceilings are far above any legitimate upload.
const MAX_ANALYZE_FRAMES = 40
const MAX_ANALYZE_FRAME_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  // Set once a credit is atomically reserved below; called to undo that charge
  // if the analysis yields no shot or throws, so nothing is billed for a
  // non-result.
  let refundCharge: (() => Promise<void>) | null = null
  // Set once the submission row exists, so the failure path can mark it
  // 'failed' instead of stranding it at 'processing' forever (a stranded row
  // would also keep counting against a subscriber's allowance for 15 minutes —
  // see lib/player-subscription.ts countUsage).
  let submissionIdForFailure: string | null = null
  try {
    const formData = await req.formData()
    const files = formData.getAll('frames') as File[]
    const videoUrl = (formData.get('videoUrl') as string | null) || null
    console.log('[analyze] received videoUrl:', videoUrl ? 'YES' : 'NO', 'frames:', files.length)

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No frames provided' }, { status: 400 })
    }
    if (files.length > MAX_ANALYZE_FRAMES) {
      return NextResponse.json({ error: `Too many frames (max ${MAX_ANALYZE_FRAMES})` }, { status: 400 })
    }
    for (const f of files) {
      if (!(f instanceof File)) {
        return NextResponse.json({ error: 'Invalid frame' }, { status: 400 })
      }
      if (f.size > MAX_ANALYZE_FRAME_BYTES) {
        return NextResponse.json({ error: 'Frame too large' }, { status: 400 })
      }
    }

    const session = await getSessionFromRequest(req)

    // Team upload fields (optional)
    const teamCode = (formData.get('teamCode') as string | null) || null
    const playerFirstName = (formData.get('playerFirstName') as string | null) || null
    const playerLastName = (formData.get('playerLastName') as string | null) || null
    const isTeamUpload = !!(teamCode && playerFirstName && playerLastName)
    const isCoachSelf = formData.get('coachSelf') === 'true'

    // A coach or org owner analyzing their own shot. A team coach pays from
    // their personal coach_credits; an org owner pays from the org balance.
    let coachEmail: string | null = null
    let orgSelfId: string | null = null
    if (isCoachSelf) {
      const teamSession = await getTeamSessionFromRequest(req)
      const orgSession = teamSession ? null : await getOrgSessionFromRequest(req)
      const cEmail = teamSession?.adminEmail ?? orgSession?.adminEmail
      if (!cEmail) {
        return NextResponse.json({ error: 'Login required' }, { status: 401 })
      }
      coachEmail = cEmail.toLowerCase()
      if (orgSession && !teamSession) {
        orgSelfId = orgSession.orgId
        const [org] = (await db`
          SELECT COALESCE(token_balance, 0)::int AS token_balance
          FROM organizations WHERE id = ${orgSelfId}
        `) as unknown as [{ token_balance: number } | undefined]
        if (!org || org.token_balance < 1) {
          return NextResponse.json({ error: 'No analysis tokens' }, { status: 402 })
        }
      } else {
        const [cc] = (await db`
          SELECT credits FROM coach_credits WHERE email = ${coachEmail}
        `) as unknown as [{ credits: number } | undefined]
        if (!cc || cc.credits < 1) {
          return NextResponse.json({ error: 'No analysis credits' }, { status: 402 })
        }
      }
    }

    // Require login for non-team, non-coach-self uploads
    if (!isTeamUpload && !isCoachSelf && !session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const userId = session?.userId ?? null

    // Rate limit before any expensive work. This is the only route that runs
    // the full multi-pass Claude pipeline and it previously had NO limit at
    // all, so one credential in a loop could run up the API bill fast. Keyed
    // per caller (whichever identity applies) and per IP, mirroring the
    // detect-shot routes. Fails open on limiter error (see lib/rate-limit.ts).
    const callerKey =
      userId ? `player:${userId}`
      : isTeamUpload ? `code:${(teamCode ?? '').toUpperCase()}`
      : orgSelfId ? `org:${orgSelfId}`
      : coachEmail ? `coach:${coachEmail}`
      : 'anon'
    const perCaller = await rateLimit(`analyze:${callerKey}`, 30, 600)
    if (!perCaller.ok) {
      return NextResponse.json(
        { error: 'Too many analyses — please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(perCaller.retryAfterSeconds) } },
      )
    }
    const perIp = await rateLimitByIp(req, 'analyze', 60, 600)
    if (!perIp.ok) {
      return NextResponse.json(
        { error: 'Too many analyses — please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSeconds) } },
      )
    }

    // Every analysis requires an entitlement — the free signup analysis has
    // been discontinued, so an account with none is turned away here before
    // any work happens. Three ways a player can be entitled, in the order
    // they are consumed:
    //   1. legacy unlimited — pre-2026 subscription_type/expires_at holders,
    //      grandfathered exactly as before (never debited, no caps)
    //   2. the Player/Pro included allowance (weekly AND monthly caps both
    //      apply; enforced atomically at reservation below)
    //   3. purchased tokens
    // `isFreePreview` is retained (always false) so historical free-preview
    // submissions still read correctly. NOTE: balances are only RESERVED
    // (atomically) just before the Claude call below — this early check is a
    // fast fail for good UX.
    const isFreePreview = false
    let legacyUnlimited = false
    let hasEntitledPlan = false
    if (!isTeamUpload && userId) {
      const [user] = await db`
        SELECT analysis_tokens, subscription_type, subscription_expires_at, free_analysis_used
        FROM users WHERE id = ${userId}
      ` as unknown as [{ analysis_tokens: number; subscription_type: string | null; subscription_expires_at: string | null; free_analysis_used: boolean | null } | undefined]

      legacyUnlimited =
        !!user?.subscription_type &&
        !!user?.subscription_expires_at &&
        new Date(user.subscription_expires_at) > new Date()

      const playerSub = legacyUnlimited ? null : await getPlayerSubscription(userId)
      hasEntitledPlan = subscriptionEntitled(playerSub)

      const tokens = user?.analysis_tokens ?? 0

      // A subscriber at their cap with no tokens is caught at reservation
      // (which returns the reset dates); here we only turn away accounts with
      // no entitlement of any kind.
      if (!legacyUnlimited && !hasEntitledPlan && tokens <= 0) {
        return NextResponse.json({ error: 'No analysis tokens' }, { status: 402 })
      }
    }

    let teamId: string | null = null
    let teamPlayerId: string | null = null
    let teamCoachEmail: string | null = null

    if (isTeamUpload) {
      const [team] = await db`
        SELECT id, admin_email, credits FROM teams WHERE access_code = ${teamCode!.toUpperCase()} FOR UPDATE
      ` as unknown as [{ id: string; admin_email: string; credits: number } | undefined]

      if (!team) {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 })
      }

      // One coach balance funds team uploads: the coach's personal
      // coach_credits, with legacy teams.credits as a fallback so older
      // teams that still hold a team budget keep working.
      const [cc] = await db`
        SELECT COALESCE(credits, 0)::int AS credits FROM coach_credits WHERE LOWER(email) = ${team.admin_email.toLowerCase()}
      ` as unknown as [{ credits: number } | undefined]
      const coachBalance = cc?.credits ?? 0
      if (coachBalance + team.credits < 1) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }

      teamId = team.id
      teamCoachEmail = team.admin_email.toLowerCase()

      const lastNameClean = playerLastName!.trim()
      await db`
        INSERT INTO team_players (team_id, first_name, last_name_initial)
        VALUES (${teamId}, ${playerFirstName!.trim()}, ${lastNameClean})
        ON CONFLICT (team_id, first_name, last_name_initial) DO NOTHING
      `
      const [player] = await db`
        SELECT id FROM team_players
        WHERE team_id = ${teamId}
          AND first_name = ${playerFirstName!.trim()}
          AND last_name_initial = ${lastNameClean}
      ` as unknown as [{ id: string }]

      teamPlayerId = player.id
    }

    // For class team uploads, look up the joined player's user_id so the
    // class-enrollment auto-link below (line ~207) can update their
    // first_submission_id / final_submission_id and the certificate fires.
    // Falls through silently if the player hasn't joined yet via signup link.
    let classPlayerUserId: string | null = null
    if (isTeamUpload && teamId) {
      const [member] = (await db`
        SELECT user_id FROM team_memberships
        WHERE team_id = ${teamId}
          AND first_name = ${playerFirstName!.trim()}
          AND last_name_initial = ${playerLastName!.trim().charAt(0).toUpperCase()}
        LIMIT 1
      `) as unknown as Array<{ user_id: string | null }>
      classPlayerUserId = member?.user_id ?? null
    }

    // Create submission record
    const submissionToken = crypto.randomBytes(32).toString('hex')
    const submissionUserId = userId ?? classPlayerUserId
    const [submission] = await db`
      INSERT INTO submissions (token, status, user_id, team_id, team_player_id, email, is_free_preview)
      VALUES (${submissionToken}, 'processing', ${submissionUserId}, ${teamId}, ${teamPlayerId}, ${coachEmail}, ${isFreePreview})
      RETURNING id
    `
    submissionIdForFailure = submission.id

    // Upload frames to Vercel Blob + convert to base64 for Claude
    const frameBase64Array: string[] = []
    const frameMimeTypes: string[] = []
    const frameUrls: string[] = []

    // Whether object storage is configured for the active driver. On Vercel
    // Blob that's the write token; on the s3/R2 driver it's the bucket. Frames
    // are only pushed to storage (and their URLs recorded) when it is.
    const hasBlobToken =
      storageDriver() === 's3'
        ? !!process.env.S3_BUCKET
        : !!process.env.BLOB_READ_WRITE_TOKEN

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      frameBase64Array.push(base64)
      frameMimeTypes.push(file.type || 'image/jpeg')

      if (hasBlobToken) {
        const blob = await putObject(`frames/${submission.id}/frame-${i}.jpg`, buffer, {
          contentType: file.type || 'image/jpeg',
        })
        frameUrls.push(blob.url)
      }
    }

    // Identical-video fingerprint: same frames → same result, always.
    const framesHash = crypto
      .createHash('sha256')
      .update(frameBase64Array.join('|'))
      .digest('hex')

    type AnalyzeResult = Awaited<ReturnType<typeof analyzeShot>>
    let result: AnalyzeResult | null = null
    try {
      const [prior] = (await db`
        SELECT a.id, a.overall_score, a.critical_flags, a.player_type, a.player_name
        FROM analyses a
        JOIN submissions s ON s.id = a.submission_id
        WHERE a.frames_hash = ${framesHash}
          AND s.status = 'complete'
          AND (${submissionUserId}::uuid IS NOT NULL AND s.user_id = ${submissionUserId})
        ORDER BY a.id DESC LIMIT 1
      `) as unknown as [{
        id: number
        overall_score: number | string
        critical_flags: AnalyzeResult['critical_flags'] | null
        player_type: string | null
        player_name: string | null
      } | undefined]
      if (prior) {
        const priorScores = (await db`
          SELECT criterion_id, ai_score, ai_reasoning
          FROM criterion_scores WHERE analysis_id = ${prior.id}
        `) as unknown as Array<{ criterion_id: number; ai_score: number | string | null; ai_reasoning: string }>
        if (priorScores.length > 0) {
          result = {
            overall_score: Number(prior.overall_score),
            shot_detected: true,
            // Return the flags and player type the original grade actually
            // produced. The all-false / 'recreational' literals are only the
            // fallback for legacy rows written before these columns existed.
            player_assessment: {
              player_type: (prior.player_type ?? 'recreational') as AnalyzeResult['player_assessment']['player_type'],
              player_name: prior.player_name ?? null,
            },
            critical_flags: prior.critical_flags ?? { elbow_severely_out: false, followthrough_flick_to_side: false, arc_too_flat: false, chest_pass_hands: false, ball_behind_head: false },
            criteria: priorScores.map(ps => ({
              id: ps.criterion_id,
              score: ps.ai_score === null ? null : Number(ps.ai_score),
              reasoning: ps.ai_reasoning,
            })),
          }
          console.log('[analyze] identical frames — reusing analysis', prior.id)
        }
      }
    } catch (err) {
      // frames_hash or the grader-metadata columns may not exist until the
      // migration runs — grade fresh, exactly as before.
      console.warn('[analyze] fingerprint lookup skipped:', err instanceof Error ? err.message : err)
    }

    // --- Atomic credit reservation -----------------------------------------
    // Deduct the credit HERE, before the Claude call, with `WHERE ... > 0
    // RETURNING`. The old code checked the balance up top but only deducted
    // AFTER grading, so N concurrent uploads on a single credit all passed the
    // check and all ran the full ~$0.50 pipeline. Reserving atomically means
    // only one wins; the rest get 402. `refundCharge` undoes it on a no-shot
    // verdict or any failure, so nothing is billed for a non-result.
    // What funded this analysis, stamped onto the submission after the chain
    // ('subscription' is stamped inside its reservation transaction instead —
    // the stamp IS the usage record there, so it must commit atomically).
    let fundingSource: 'legacy' | 'token' | 'coach_credit' | 'team_credit' | 'org_balance' | null =
      null
    if (isTeamUpload && teamId) {
      const coachRows = teamCoachEmail
        ? ((await db`
            UPDATE coach_credits SET credits = credits - 1
            WHERE LOWER(email) = ${teamCoachEmail} AND credits > 0 RETURNING email
          `) as unknown as unknown[])
        : []
      if (coachRows.length > 0) {
        fundingSource = 'coach_credit'
        refundCharge = async () => {
          await db`UPDATE coach_credits SET credits = credits + 1 WHERE LOWER(email) = ${teamCoachEmail}`
        }
      } else {
        const teamRows = (await db`
          UPDATE teams SET credits = credits - 1 WHERE id = ${teamId} AND credits > 0 RETURNING id
        `) as unknown as unknown[]
        if (teamRows.length === 0) {
          await db`DELETE FROM submissions WHERE id = ${submission.id}`
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
        }
        fundingSource = 'team_credit'
        refundCharge = async () => {
          await db`UPDATE teams SET credits = credits + 1 WHERE id = ${teamId}`
        }
      }
    } else if (isCoachSelf && orgSelfId) {
      const rows = (await db`
        UPDATE organizations SET token_balance = token_balance - 1 WHERE id = ${orgSelfId} AND token_balance > 0 RETURNING id
      `) as unknown as unknown[]
      if (rows.length === 0) {
        await db`DELETE FROM submissions WHERE id = ${submission.id}`
        return NextResponse.json({ error: 'No analysis tokens' }, { status: 402 })
      }
      fundingSource = 'org_balance'
      refundCharge = async () => {
        await db`UPDATE organizations SET token_balance = token_balance + 1 WHERE id = ${orgSelfId}`
      }
    } else if (isCoachSelf && coachEmail) {
      const rows = (await db`
        UPDATE coach_credits SET credits = credits - 1 WHERE email = ${coachEmail} AND credits > 0 RETURNING email
      `) as unknown as unknown[]
      if (rows.length === 0) {
        await db`DELETE FROM submissions WHERE id = ${submission.id}`
        return NextResponse.json({ error: 'No analysis credits' }, { status: 402 })
      }
      fundingSource = 'coach_credit'
      refundCharge = async () => {
        await db`UPDATE coach_credits SET credits = credits + 1 WHERE email = ${coachEmail}`
      }
    } else if (!isTeamUpload && userId && !isFreePreview && legacyUnlimited) {
      // Grandfathered pre-2026 subscriber: unlimited, never debited — exactly
      // the behavior their subscription was sold with.
      fundingSource = 'legacy'
    } else if (!isTeamUpload && userId && !isFreePreview) {
      // Included subscription analyses are consumed BEFORE purchased tokens —
      // never the other way around, and never silently: the analyze UI reads
      // /api/my/usage first and tells the user when a purchased token is about
      // to be used.
      let limitInfo: { blockedBy: 'weekly' | 'monthly'; weeklyResetAt: string; monthlyResetAt: string } | null = null
      if (hasEntitledPlan) {
        const reserved = await reserveSubscriptionAnalysis(userId, submission.id)
        if (reserved.ok) {
          fundingSource = null // stamped 'subscription' inside the transaction
          // For an included analysis the "refund" is exclusion from the usage
          // count: mark the row failed and the window count no longer sees it.
          refundCharge = async () => {
            await markSubmissionFailed(submission.id)
          }
        } else if (reserved.reason === 'weekly' || reserved.reason === 'monthly') {
          limitInfo = {
            blockedBy: reserved.reason,
            weeklyResetAt: reserved.usage.weeklyResetAt.toISOString(),
            monthlyResetAt: reserved.usage.monthlyResetAt.toISOString(),
          }
        }
        // 'not_subscribed' (lapsed between the pre-check and now) falls
        // through to purchased tokens like any non-subscriber.
      }
      if (!refundCharge || limitInfo) {
        const rows = (await db`
          UPDATE users SET analysis_tokens = analysis_tokens - 1 WHERE id = ${userId} AND analysis_tokens > 0 RETURNING id
        `) as unknown as unknown[]
        if (rows.length === 0) {
          await db`DELETE FROM submissions WHERE id = ${submission.id}`
          if (limitInfo) {
            // Structured so the client can render the real reset dates
            // ("Your weekly allowance resets in 2 days") instead of a dead end.
            return NextResponse.json(
              {
                error: 'limit_reached',
                ...limitInfo,
                message:
                  limitInfo.blockedBy === 'weekly'
                    ? 'You’ve used your included analyses for this week.'
                    : 'You’ve used all your included analyses for this billing month.',
              },
              { status: 402 },
            )
          }
          return NextResponse.json({ error: 'No analysis tokens' }, { status: 402 })
        }
        fundingSource = 'token'
        refundCharge = async () => {
          await db`UPDATE users SET analysis_tokens = analysis_tokens + 1 WHERE id = ${userId}`
        }
      }
    }

    // Record what funded it (audit + keeps purchased-token analyses out of the
    // subscription usage count). Degrades silently on a database that hasn't
    // run the migration adding entitlement_source yet.
    if (fundingSource) {
      try {
        await db`UPDATE submissions SET entitlement_source = ${fundingSource} WHERE id = ${submission.id}`
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/column .* does not exist/i.test(msg)) throw err
      }
    }

    // Run Claude Vision analysis (fresh grade unless fingerprint matched)
    if (!result) result = await analyzeShot(frameBase64Array, frameMimeTypes)

    // No analyzable shot in the video — refund the reserved credit and discard
    // the submission so nothing is charged for a non-result.
    if (result.shot_detected === false) {
      if (refundCharge) await refundCharge()
      await db`DELETE FROM submissions WHERE id = ${submission.id}`
      return NextResponse.json(
        {
          error: 'no_shot',
          message:
            'We could not find a basketball shot in this video, so it was not analyzed and you were not charged.',
        },
        { status: 422 },
      )
    }

    // Store analysis. Tiered fallbacks mirror the existing video_url pattern:
    // a database that hasn't run `npm run migrate` yet degrades gracefully
    // instead of failing the upload.
    let analysis: { id: number }
    try {
      ;[analysis] = (await db`
        INSERT INTO analyses (submission_id, overall_score, frame_urls, video_url, frames_hash, critical_flags, player_type, player_name, grader_version)
        VALUES (${submission.id}, ${result.overall_score}, ${frameUrls}, ${videoUrl}, ${framesHash},
                ${JSON.stringify(result.critical_flags)}::jsonb,
                ${result.player_assessment?.player_type ?? 'recreational'},
                ${result.player_assessment?.player_name ?? null},
                ${result.grader_version ? JSON.stringify(result.grader_version) : null}::jsonb)
        RETURNING id
      `) as unknown as [{ id: number }]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/column .* does not exist/i.test(msg)) throw err
      console.warn('analyses grader-metadata columns missing — run `npm run migrate`. Inserting legacy shape.')
      try {
        ;[analysis] = (await db`
          INSERT INTO analyses (submission_id, overall_score, frame_urls, video_url, frames_hash)
          VALUES (${submission.id}, ${result.overall_score}, ${frameUrls}, ${videoUrl}, ${framesHash})
          RETURNING id
        `) as unknown as [{ id: number }]
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2)
        if (!/column .* does not exist/i.test(msg2)) throw err2
        console.warn('analyses.video_url column missing — run `npm run migrate`. Inserting without video URL.')
        ;[analysis] = (await db`
          INSERT INTO analyses (submission_id, overall_score, frame_urls)
          VALUES (${submission.id}, ${result.overall_score}, ${frameUrls})
          RETURNING id
        `) as unknown as [{ id: number }]
      }
    }

    // Store per-criterion scores
    for (const criterion of result.criteria) {
      await db`
        INSERT INTO criterion_scores (analysis_id, criterion_id, ai_score, ai_reasoning)
        VALUES (${analysis.id}, ${criterion.id}, ${criterion.score}, ${criterion.reasoning})
      `
    }

    // Mark submission complete
    await db`
      UPDATE submissions SET status = 'complete' WHERE id = ${submission.id}
    `

    // Class enrollment tracking — NO changes to scoring.
    // For first-time class players: every shot after the first gets a display score of
    // max(actual_score, first_score + 0.3). Boost lasts while the player is enrolled
    // in an active class. Once the package is inactive or they leave, no more boost.
    // Use whichever user_id this submission is actually tied to:
    // - self uploads → session.userId
    // - coach team uploads → the joined class player's user_id (resolved above)
    const enrollmentUserId = userId ?? classPlayerUserId
    if (enrollmentUserId) {
      try {
        // Pick the right enrollment when a player is in more than one class:
        //   - Coach team upload → prefer the enrollment whose package belongs
        //     to THIS team (the team the coach is uploading through).
        //   - Self upload (no team context) → oldest active enrollment.
        // The CASE in ORDER BY ranks the matching team's enrollment first;
        // tie-breaks by created_at so behavior stays predictable.
        const activeEnrollment = await db`
          SELECT e.id, e.first_submission_id, e.first_score, e.is_first_class
          FROM org_class_enrollments e
          JOIN org_class_packages p ON p.id = e.package_id
          LEFT JOIN teams t ON t.class_package_id = p.id
          WHERE e.user_id = ${enrollmentUserId}
            AND p.status = 'active'
          ORDER BY
            CASE WHEN ${teamId}::uuid IS NOT NULL AND t.id = ${teamId}::uuid THEN 0 ELSE 1 END,
            e.created_at ASC
          LIMIT 1
        ` as unknown as { id: string; first_submission_id: string | null; first_score: number | null; is_first_class: boolean }[]

        const enrollment = activeEnrollment[0]
        if (enrollment) {
          if (!enrollment.first_submission_id) {
            // First class shot — record baseline, no boost here
            await db`
              UPDATE org_class_enrollments
              SET first_submission_id = ${submission.id}, first_score = ${result.overall_score}
              WHERE id = ${enrollment.id}
            `
          } else {
            // Any subsequent shot while still enrolled — boost applies for first-timers only.
            // Real score in analyses table is always the true AI score, unchanged.
            // display_final_score is only used on the certificate and leaderboard.
            const realScore = result.overall_score
            const firstScore = Number(enrollment.first_score ?? 0)
            // Boost rules for first-time class players:
            // - When their real score actually improved over the baseline,
            //   we floor the displayed final at firstScore + 0.3 so a tiny
            //   real gain still reads as visible improvement.
            // - Capped at realScore + 0.3 so the boost never exceeds 0.3.
            // - If the real score is the same as (or lower than) the first
            //   score — e.g. they re-uploaded the EXACT same shot — we do
            //   NOT apply the boost. The certificate just shows the real
            //   score. The 0.05 threshold absorbs small AI noise between
            //   two analyses of an identical clip.
            const improved = realScore > firstScore + 0.05
            const displayScore = enrollment.is_first_class && improved
              ? Math.min(realScore + 0.3, Math.max(realScore, firstScore + 0.3))
              : realScore
            await db`
              UPDATE org_class_enrollments
              SET final_submission_id = ${submission.id},
                  final_score = ${realScore},
                  display_final_score = ${displayScore}
              WHERE id = ${enrollment.id}
            `
          }
        }
      } catch {
        // Non-fatal — class tracking never blocks the analysis result
      }
    }

    // The credit was already reserved atomically before the Claude call (see
    // "Atomic credit reservation" above) and stands now that the analysis
    // succeeded — nothing to deduct here. A free preview (isFreePreview, always
    // false today) would consume the one-time freebie instead.
    if (!isTeamUpload && userId && isFreePreview) {
      await db`UPDATE users SET free_analysis_used = true WHERE id = ${userId}`
    }

    // First analysis for whoever uploaded it → send the filming guide. Goes to
    // the person who held the camera, which for a team or coach upload is the
    // coach rather than the player: they are the one who chose the angle.
    // Awaited rather than fired and forgotten because the serverless function
    // is frozen the moment this response returns.
    await maybeSendFilmingTips(coachEmail ?? teamCoachEmail ?? session?.email ?? null)

    return NextResponse.json({
      submissionId: submission.id,
      analysisId: analysis.id,
      token: submissionToken,
    })
  } catch (err) {
    // Refund the reserved credit if we charged before failing, so a crash mid-
    // analysis never costs the user a credit.
    if (refundCharge) {
      try { await refundCharge() } catch (refundErr) {
        console.error('[analyze] refund after failure failed:', refundErr instanceof Error ? refundErr.message : refundErr)
      }
    }
    // Terminal state, not a stranded 'processing' row (markSubmissionFailed
    // never throws). Idempotent with the subscription refund above.
    if (submissionIdForFailure) await markSubmissionFailed(submissionIdForFailure)
    console.error('Analysis error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Analysis failed', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
