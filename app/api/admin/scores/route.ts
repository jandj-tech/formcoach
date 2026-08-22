import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminSession } from '@/lib/admin-auth'

async function isAdmin() {
  return isAdminSession()
}

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const analysisId = req.nextUrl.searchParams.get('analysisId')
  if (!analysisId) return NextResponse.json({ error: 'Missing analysisId' }, { status: 400 })

  const scores = await db`
    SELECT cs.id, cs.ai_score, cs.ai_reasoning, cs.admin_score, cs.admin_notes,
           c.name as criterion_name
    FROM criterion_scores cs
    JOIN criteria c ON cs.criterion_id = c.id
    WHERE cs.analysis_id = ${analysisId}
    ORDER BY c.order_index
  `

  return NextResponse.json(scores)
}
