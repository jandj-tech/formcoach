import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorFixtureFromAnalysis, listFixtures, latestBaseline } from '@/lib/eval'
import { isAdminSession } from '@/lib/admin-auth'

async function isAdmin() {
  return isAdminSession()
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
    const { analysisId, resultsUrl, slug } = await req.json()

    // Accept either an analysis id or a pasted results link/token. The
    // 64-hex code in /results/<token> is the submission token — resolve it
    // to that submission's newest analysis so the owner can add reference
    // shots straight from a report URL without knowing internal ids.
    let id = Number(analysisId)
    if (!Number.isInteger(id) || !analysisId) {
      const tokenMatch = typeof resultsUrl === 'string' ? resultsUrl.match(/[a-f0-9]{64}/i) : null
      if (!tokenMatch) {
        return NextResponse.json(
          { error: 'Provide an analysis ID or paste a results link (learnhoops.com/results/…)' },
          { status: 400 },
        )
      }
      const [row] = (await db`
        SELECT a.id
        FROM submissions s
        JOIN analyses a ON a.submission_id = s.id
        WHERE s.token = ${tokenMatch[0].toLowerCase()}
        ORDER BY a.created_at DESC
        LIMIT 1
      `) as unknown as [{ id: number } | undefined]
      if (!row) {
        return NextResponse.json({ error: 'No analysis found for that results link' }, { status: 404 })
      }
      id = Number(row.id)
    }

    const finalSlug = typeof slug === 'string' && slug.trim() ? slug.trim() : `shot-${id}`
    const fixture = await authorFixtureFromAnalysis(id, finalSlug)
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
