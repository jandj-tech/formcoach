import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// Freeze the just-reviewed eval results as the new accepted baseline.
// Append-only: past baselines stay queryable for history.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { grader, results } = await req.json()
  if (!results || typeof results !== 'object' || Object.keys(results).length === 0) {
    return NextResponse.json({ error: 'No results to accept' }, { status: 400 })
  }
  const [row] = (await db`
    INSERT INTO eval_baselines (grader, results)
    VALUES (${grader ? JSON.stringify(grader) : null}::jsonb, ${JSON.stringify(results)}::jsonb)
    RETURNING id, grader, results, accepted_at
  `) as unknown as [Record<string, unknown>]
  return NextResponse.json({ baseline: row })
}
