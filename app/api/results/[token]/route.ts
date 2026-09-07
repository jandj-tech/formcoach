import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { humanizeReasoning } from '@/lib/sanitize'
import { resolveNoteAuthorForAnalysis } from '@/lib/coach-notes'
import { resolveResultAccess } from '@/lib/result-access'
import { categoryScores } from '@/lib/criteria-categories'
import type { VisibilityTier } from '@/lib/result-visibility'

// JSON twin of app/results/[token]/page.tsx for the iOS app. Visibility comes
// from the same resolver as the web page (lib/result-access.ts) so the two can
// never drift. This route deliberately carries NO offers, prices or purchase
// hints for any caller: buying is web-only and the web page doesn't use this
// route, so omitting them is free and unspoofable (App Store guideline 3.1.1).

const HIDDEN_REASONING = 'Not included in the results shared with you.'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const [submission] = (await db`
    SELECT id, status, user_id, is_free_preview FROM submissions WHERE token = ${token}
  `) as unknown as [{ id: string; status: string; user_id: string | null; is_free_preview: boolean | null } | undefined]

  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [analysis] = (await db`
    SELECT id, overall_score, frame_urls, video_url
    FROM analyses
    WHERE submission_id = ${submission.id}
    ORDER BY created_at DESC
    LIMIT 1
  `) as unknown as [{ id: number; overall_score: number; frame_urls: string[]; video_url: string | null } | undefined]

  if (!analysis) return NextResponse.json({ error: 'Analysis not ready' }, { status: 404 })

  // Org-release visibility (staff resolved from the cookie sessions; a
  // token-only caller is a player or a share-link holder).
  const coachAuthor = await resolveNoteAuthorForAnalysis(analysis.id)
  const access = await resolveResultAccess({
    submissionId: submission.id,
    isStaff: coachAuthor !== null,
  })

  // Legacy free-preview gate, only when no release governs: the free signup
  // analysis exposes only the overall score and the criterion names. Once the
  // owner's account holds a token (or an active subscription/comp) the report
  // unlocks permanently — buying is enough, unlocking consumes nothing.
  let locked = !access && !!submission.is_free_preview
  if (locked && submission.user_id) {
    const [owner] = (await db`
      SELECT analysis_tokens, subscription_type, subscription_expires_at
      FROM users WHERE id = ${submission.user_id}
    `) as unknown as [{ analysis_tokens: number | null; subscription_type: string | null; subscription_expires_at: string | null } | undefined]
    const ownerHasAccess =
      (owner?.analysis_tokens ?? 0) > 0 ||
      (!!owner?.subscription_type &&
        !!owner?.subscription_expires_at &&
        new Date(owner.subscription_expires_at) > new Date())
    if (ownerHasAccess) {
      await db`UPDATE submissions SET is_free_preview = false WHERE id = ${submission.id}`
      locked = false
    }
  }

  const tier: VisibilityTier = access ? access.tier : locked ? 'score' : 'full'
  const showNumbers = tier === 'full' || tier === 'breakdown'
  const showText = tier === 'full'

  // Reasoning is only ever SELECTed at 'full'; numbers only from 'breakdown'
  // up. Below that, criterion names alone leave the server.
  const scores = showText
    ? ((await db`
        SELECT cs.id, cs.ai_score, cs.ai_reasoning, c.name, c.order_index
        FROM criterion_scores cs
        JOIN criteria c ON cs.criterion_id = c.id
        WHERE cs.analysis_id = ${analysis.id}
        ORDER BY c.order_index
      `) as unknown as Array<{ id: number; ai_score: number | null; ai_reasoning: string; name: string }>)
    : showNumbers || tier === 'categories'
      ? ((await db`
          SELECT cs.id, cs.ai_score, '' AS ai_reasoning, c.name, c.order_index
          FROM criterion_scores cs
          JOIN criteria c ON cs.criterion_id = c.id
          WHERE cs.analysis_id = ${analysis.id}
          ORDER BY c.order_index
        `) as unknown as Array<{ id: number; ai_score: number | null; ai_reasoning: string; name: string }>)
      : ((await db`
          SELECT cs.id, NULL::numeric AS ai_score, '' AS ai_reasoning, c.name, c.order_index
          FROM criterion_scores cs
          JOIN criteria c ON cs.criterion_id = c.id
          WHERE cs.analysis_id = ${analysis.id}
          ORDER BY c.order_index
        `) as unknown as Array<{ id: number; ai_score: number | null; ai_reasoning: string; name: string }>)

  const categories =
    tier === 'categories'
      ? categoryScores(
          scores.map((s) => ({ name: s.name, score: s.ai_score !== null ? Number(s.ai_score) : null }))
        )
      : undefined

  // Media is 'full' tier content on org releases; legacy pages keep their
  // existing behavior.
  const showMedia = access ? tier === 'full' : true

  return NextResponse.json({
    submissionStatus: submission.status,
    // `locked` keeps its historical meaning for the app: not the full report.
    locked: tier !== 'full',
    visibility: tier,
    sharedBy: access ? access.release.orgName : null,
    overallScore: Number(analysis.overall_score),
    frameUrls: showMedia ? (analysis.frame_urls ?? []) : [],
    videoUrl: showMedia ? (analysis.video_url ?? null) : null,
    ...(categories ? { categories } : {}),
    scores: scores.map((s) => ({
      id: s.id,
      name: s.name,
      score: showNumbers && s.ai_score !== null ? Number(s.ai_score) : null,
      reasoning: showText
        ? humanizeReasoning(s.ai_reasoning)
        : access
          ? HIDDEN_REASONING
          : 'Buy an analysis token to unlock your full breakdown.',
    })),
  })
}
