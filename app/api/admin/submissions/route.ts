import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const submissions = await db`
    SELECT s.id, s.email, s.status, s.created_at,
           a.id as analysis_id, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    ORDER BY s.created_at DESC
    LIMIT 100
  `
  return NextResponse.json(submissions)
}
