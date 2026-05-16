import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const [submission] = (await db`
    SELECT id, status FROM submissions WHERE token = ${token}
  `) as unknown as [{ id: string; status: string } | undefined]

  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
    overallScore: Number(analysis.overall_score),
    frameUrls: analysis.frame_urls ?? [],
    videoUrl: analysis.video_url ?? null,
    scores: scores.map((s) => ({
      id: s.id,
      name: s.name,
      score: s.ai_score !== null ? Number(s.ai_score) : null,
      reasoning: s.ai_reasoning,
    })),
  })
}
