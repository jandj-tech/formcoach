import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

// Clears first/final progress on a class enrollment. Use when an enrollment
// has stale upload history from earlier testing — wipes first_submission_id,
// final_submission_id, first_score, final_score, display_final_score, and
// certificate_issued_at so the next upload counts as the player's "first
// upload after joining" again. Doesn't touch the submissions themselves
// (they stay in the user's account); only the class-tracking pointers.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { enrollmentId } = await req.json()
    const eid = typeof enrollmentId === 'string' ? enrollmentId.trim() : ''
    if (!eid) {
      return NextResponse.json({ error: 'enrollmentId required' }, { status: 400 })
    }

    // The enrollment must belong to a package owned by this org.
    const [own] = (await db`
      SELECT e.id FROM org_class_enrollments e
      JOIN org_class_packages p ON p.id = e.package_id
      WHERE e.id = ${eid} AND p.org_id = ${session.orgId}
      LIMIT 1
    `) as unknown as Array<{ id: string }>
    if (!own) {
      return NextResponse.json({ error: 'Enrollment not found in your organization' }, { status: 404 })
    }

    await db`
      UPDATE org_class_enrollments
      SET first_submission_id = NULL,
          final_submission_id = NULL,
          first_score = NULL,
          final_score = NULL,
          display_final_score = NULL,
          certificate_issued_at = NULL
      WHERE id = ${eid}
    `

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[org/reset-enrollment] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not reset enrollment' }, { status: 500 })
  }
}
