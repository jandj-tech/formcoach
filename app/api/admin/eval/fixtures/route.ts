import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { authorFixtureFromAnalysis, listFixtures, latestBaseline } from '@/lib/eval'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// Everything the Test Bench page needs on load: fixtures, the current
// accepted baseline, and the active criteria names for the expectation editor.
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [fixtures, baseline, criteria, recent] = await Promise.all([
    listFixtures(),
    latestBaseline(),
    db`SELECT name FROM criteria WHERE active = true ORDER BY order_index` as unknown as Promise<Array<{ name: string }>>,
    // Recent analyses to pick reference shots from. "corrected" = the expert
    // has reviewed it in Learn Mode, which makes it the best fixture material.
    db`
      SELECT a.id, a.overall_score, a.created_at, a.frame_urls[1] AS thumb,
        EXISTS(
          SELECT 1 FROM criterion_scores cs
          WHERE cs.analysis_id = a.id AND cs.admin_score IS NOT NULL
        ) AS corrected
      FROM analyses a
      JOIN submissions s ON s.id = a.submission_id
      WHERE s.status = 'complete' AND array_length(a.frame_urls, 1) >= 20
      ORDER BY a.id DESC
      LIMIT 30
    ` as unknown as Promise<Array<{ id: number; overall_score: number | string; created_at: string; thumb: string | null; corrected: boolean }>>,
  ])
  return NextResponse.json({
    fixtures,
    baseline,
    criteriaNames: criteria.map((c) => c.name),
    recent,
    passes: Math.max(1, Math.min(5, parseInt(process.env.ANALYSIS_PASSES || '3', 10) || 3)),
  })
}

// Create a fixture from an existing analysis (expected ranges prefilled from
// the expert's corrections; the owner tightens them in the editor).
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { analysisId, slug } = await req.json()
    if (!Number.isInteger(Number(analysisId)) || typeof slug !== 'string') {
      return NextResponse.json({ error: 'analysisId (number) and slug (string) required' }, { status: 400 })
    }
    const fixture = await authorFixtureFromAnalysis(Number(analysisId), slug.trim())
    return NextResponse.json({ fixture })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = /duplicate key/i.test(msg) ? 409 : 400
    return NextResponse.json(
      { error: /duplicate key/i.test(msg) ? 'A reference shot with that name already exists' : msg },
      { status },
    )
  }
}
