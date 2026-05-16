import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const packageId = searchParams.get('packageId')
  if (!packageId) return NextResponse.json({ error: 'packageId required' }, { status: 400 })

  const [pkg] = await db`
    SELECT id FROM org_class_packages WHERE id = ${packageId} AND org_id = ${session.orgId}
  ` as unknown as [{ id: string } | undefined]
  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  const rows = await db`
    SELECT
      e.id,
      e.first_name,
      e.last_name_initial,
      e.first_score,
      e.display_final_score,
      e.final_score,
      e.is_first_class,
      e.certificate_issued_at,
      (e.final_submission_id IS NOT NULL) AS completed,
      (e.first_submission_id IS NOT NULL) AS started
    FROM org_class_enrollments e
    WHERE e.package_id = ${packageId}
    ORDER BY
      CASE WHEN e.display_final_score IS NOT NULL THEN e.display_final_score ELSE e.first_score END DESC NULLS LAST
  ` as unknown as Array<{
    id: string
    first_name: string | null
    last_name_initial: string | null
    first_score: number | null
    display_final_score: number | null
    final_score: number | null
    is_first_class: boolean
    certificate_issued_at: string | null
    completed: boolean
    started: boolean
  }>

  return NextResponse.json({ leaderboard: rows })
}
