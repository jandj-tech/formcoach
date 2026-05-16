import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const packages = await db`
      SELECT
        p.id, p.player_count, p.price_per_player_cents, p.total_cents,
        p.token_pool, p.status, p.created_at,
        COUNT(e.id)::int AS enrolled_count,
        COUNT(e.final_submission_id)::int AS completed_count
      FROM org_class_packages p
      LEFT JOIN org_class_enrollments e ON e.package_id = p.id
      WHERE p.org_id = ${session.orgId}
      GROUP BY p.id
      ORDER BY p.created_at DESC
    ` as unknown as Array<{
      id: string
      player_count: number
      price_per_player_cents: number
      total_cents: number
      token_pool: number
      status: string
      created_at: string
      enrolled_count: number
      completed_count: number
    }>

    const enriched = await Promise.all(packages.map(async (pkg) => {
      const enrollments = await db`
        SELECT
          e.id, e.user_id, e.first_name, e.last_name_initial,
          e.first_score, e.final_score, e.display_final_score,
          e.is_first_class, e.certificate_issued_at, e.created_at,
          e.first_submission_id IS NOT NULL AS has_first,
          e.final_submission_id IS NOT NULL AS has_final
        FROM org_class_enrollments e
        WHERE e.package_id = ${pkg.id}
        ORDER BY e.created_at ASC
      ` as unknown as Array<{
        id: string
        user_id: string | null
        first_name: string | null
        last_name_initial: string | null
        first_score: number | null
        final_score: number | null
        display_final_score: number | null
        is_first_class: boolean
        certificate_issued_at: string | null
        created_at: string
        has_first: boolean
        has_final: boolean
      }>
      return { ...pkg, enrollments }
    }))

    return NextResponse.json({ packages: enriched })
  } catch (err) {
    console.error('[org/class] load error:', err)
    return NextResponse.json({ error: 'Failed to load class packages' }, { status: 500 })
  }
}
