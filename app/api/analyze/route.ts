import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { analyzeShot } from '@/lib/analyze'
import { getSessionFromRequest } from '@/lib/auth'
import crypto from 'crypto'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('frames') as File[]
    const videoUrl = (formData.get('videoUrl') as string | null) || null
    console.log('[analyze] received videoUrl:', videoUrl ? 'YES' : 'NO', 'frames:', files.length)

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No frames provided' }, { status: 400 })
    }

    const session = await getSessionFromRequest(req)

    // Team upload fields (optional)
    const teamCode = (formData.get('teamCode') as string | null) || null
    const playerFirstName = (formData.get('playerFirstName') as string | null) || null
    const playerLastName = (formData.get('playerLastName') as string | null) || null
    const isTeamUpload = !!(teamCode && playerFirstName && playerLastName)

    // Require login for non-team uploads
    if (!isTeamUpload && !session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const userId = session?.userId ?? null

    // Check + reserve token before doing any expensive work
    if (!isTeamUpload && userId) {
      const [user] = await db`
        SELECT analysis_tokens, subscription_type, subscription_expires_at
        FROM users WHERE id = ${userId}
      ` as unknown as [{ analysis_tokens: number; subscription_type: string | null; subscription_expires_at: string | null } | undefined]

      const isSubscribed =
        !!user?.subscription_type &&
        !!user?.subscription_expires_at &&
        new Date(user.subscription_expires_at) > new Date()

      const tokens = user?.analysis_tokens ?? 0

      if (!isSubscribed && tokens <= 0) {
        return NextResponse.json({ error: 'No analysis tokens' }, { status: 402 })
      }
    }

    let teamId: string | null = null
    let teamPlayerId: string | null = null

    if (isTeamUpload) {
      const [team] = await db`
        SELECT id, credits FROM teams WHERE access_code = ${teamCode!.toUpperCase()} FOR UPDATE
      ` as unknown as [{ id: string; credits: number } | undefined]

      if (!team) {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 })
      }
      if (team.credits < 1) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }

      teamId = team.id

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

    // Create submission record
    const submissionToken = crypto.randomBytes(32).toString('hex')
    const [submission] = await db`
      INSERT INTO submissions (token, status, user_id, team_id, team_player_id)
      VALUES (${submissionToken}, 'processing', ${userId}, ${teamId}, ${teamPlayerId})
      RETURNING id
    `

    // Upload frames to Vercel Blob + convert to base64 for Claude
    const frameBase64Array: string[] = []
    const frameMimeTypes: string[] = []
    const frameUrls: string[] = []

    const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      frameBase64Array.push(base64)
      frameMimeTypes.push(file.type || 'image/jpeg')

      if (hasBlobToken) {
        const blob = await put(`frames/${submission.id}/frame-${i}.jpg`, buffer, {
          access: 'public',
          contentType: file.type || 'image/jpeg',
        })
        frameUrls.push(blob.url)
      }
    }

    // Run Claude Vision analysis
    const result = await analyzeShot(frameBase64Array, frameMimeTypes)

    // Store analysis
    let analysis: { id: number }
    try {
      ;[analysis] = (await db`
        INSERT INTO analyses (submission_id, overall_score, frame_urls, video_url)
        VALUES (${submission.id}, ${result.overall_score}, ${frameUrls}, ${videoUrl})
        RETURNING id
      `) as unknown as [{ id: number }]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/column.*video_url.*does not exist/i.test(msg)) throw err
      console.warn('analyses.video_url column missing — run `npm run migrate`. Inserting without video URL.')
      ;[analysis] = (await db`
        INSERT INTO analyses (submission_id, overall_score, frame_urls)
        VALUES (${submission.id}, ${result.overall_score}, ${frameUrls})
        RETURNING id
      `) as unknown as [{ id: number }]
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
    if (userId) {
      try {
        const activeEnrollment = await db`
          SELECT e.id, e.first_submission_id, e.first_score, e.is_first_class
          FROM org_class_enrollments e
          JOIN org_class_packages p ON p.id = e.package_id
          WHERE e.user_id = ${userId}
            AND p.status = 'active'
          ORDER BY e.created_at ASC
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
            const displayScore = enrollment.is_first_class
              ? Math.max(realScore, firstScore + 0.3)
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

    // Deduct token after successful analysis
    if (!isTeamUpload && userId) {
      await db`
        UPDATE users SET analysis_tokens = analysis_tokens - 1
        WHERE id = ${userId} AND analysis_tokens > 0
      `
    }

    if (isTeamUpload && teamId) {
      await db`UPDATE teams SET credits = credits - 1 WHERE id = ${teamId} AND credits > 0`
    }

    return NextResponse.json({
      submissionId: submission.id,
      analysisId: analysis.id,
      token: submissionToken,
    })
  } catch (err) {
    console.error('Analysis error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Analysis failed', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
