import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { humanizeReasoning } from '@/lib/sanitize'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const [submission] = (await db`
    SELECT id, status, user_id, is_free_preview FROM submissions WHERE token = ${token}
  `) as unknown as [{ id: string; status: string; user_id: string | null; is_free_preview: boolean | null } | undefined]

  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Free-preview gate, mirroring the web results page: the free signup
  // analysis exposes only the overall score and the criterion names. Once
  // the owner's account holds a token (or an active subscription/comp) the
  // report unlocks permanently — buying is enough, unlocking consumes nothing.
  let locked = !!submission.is_free_preview
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

  const [analysis] = (await db`
    SELECT id, overall_score, frame_urls, video_url
    FROM analyses
    WHERE submission_id = ${submission.id}
    ORDER BY created_at DESC
    LIMIT 1
  `) as unknown as [{ id: number; overall_score: number; frame_urls: string[]; video_url: string | null } | undefined]

  if (!analysis) return NextResponse.json({ error: 'Analysis not ready' }, { status: 404 })

  const scores = (await db`
    SELECT cs.id, cs.ai_score, cs.ai_reasoning, c.name, c.order_index
    FROM criterion_scores cs
    JOIN criteria c ON cs.criterion_id = c.id
    WHERE cs.analysis_id = ${analysis.id}
    ORDER BY c.order_index
  `) as unknown as Array<{
    id: number
    ai_score: number | null
    ai_reasoning: string
    name: string
    order_index: number
  }>

  return NextResponse.json({
    submissionStatus: submission.status,
    locked,
    overallScore: Number(analysis.overall_score),
    frameUrls: analysis.frame_urls ?? [],
    videoUrl: analysis.video_url ?? null,
    // On a locked preview the real scores and reasoning never leave the
    // server — criterion names only, so the app can render locked cards.
    scores: scores.map((s) => ({
      id: s.id,
      name: s.name,
      score: locked ? null : s.ai_score !== null ? Number(s.ai_score) : null,
      reasoning: locked
        ? 'Buy an analysis token to unlock your full breakdown.'
        : humanizeReasoning(s.ai_reasoning),
    })),
  })
}
