import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminSession } from '@/lib/admin-auth'

async function isAdmin() {
  return isAdminSession()
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scoreId, adminScore, adminNotes } = await req.json()

  if (!scoreId || adminScore == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const [updated] = await db`
    UPDATE criterion_scores
    SET admin_score = ${adminScore}, admin_notes = ${adminNotes || null}
    WHERE id = ${scoreId}
    RETURNING *
  `

  return NextResponse.json(updated)
}
