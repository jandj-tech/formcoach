import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { runFixtureOnce } from '@/lib/eval'
import type { EvalFixtureRow } from '@/lib/eval'

// One request = ONE full grading of ONE fixture (the normal N-pass ensemble,
// or 1 pass in quick mode). The Test Bench page loops fixtures/runs and
// aggregates client-side, keeping each request comfortably inside the
// serverless time limit.
export const maxDuration = 300

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { slug, quick } = await req.json()
    const [fixture] = (await db`
      SELECT id, slug, analysis_id, description, frames_hash, frame_urls, expected, active
      FROM eval_fixtures WHERE slug = ${slug}
    `) as unknown as [EvalFixtureRow | undefined]
    if (!fixture) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })

    const run = await runFixtureOnce(fixture, quick ? { passes: 1 } : undefined)
    return NextResponse.json({ run })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
