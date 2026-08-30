import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canManageClassPackage } from '@/lib/org-class-access'

export async function POST(req: NextRequest) {
  const { packageId, userId, firstName, lastNameInitial } = await req.json()
  if (!packageId || !firstName) {
    return NextResponse.json({ error: 'packageId and firstName required' }, { status: 400 })
  }

  // The owning org or the class team's coach — both run the class manager.
  if (!(await canManageClassPackage(req, packageId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Re-check capacity. No more
  // token-pool deduction or per-player token grant — the new model has the
  // org leader / coach uploading on each player's behalf out of the team's
  // credit pool, so players don't carry personal tokens.
  const [pkg] = await db`
    SELECT p.id, p.player_count, p.status,
           COUNT(e.id)::int AS enrolled_count
    FROM org_class_packages p
    LEFT JOIN org_class_enrollments e ON e.package_id = p.id
    WHERE p.id = ${packageId}
    GROUP BY p.id
  ` as unknown as [{ id: string; player_count: number; status: string; enrolled_count: number } | undefined]

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (pkg.status !== 'active') return NextResponse.json({ error: 'Package is not active' }, { status: 400 })
  if (pkg.enrolled_count >= pkg.player_count) {
    return NextResponse.json({ error: 'Package is full — all player slots are taken' }, { status: 400 })
  }

  // First-time class flag — drives the small display-score boost in analyze.
  let isFirstClass = true
  if (userId) {
    const [prior] = await db`
      SELECT e.id FROM org_class_enrollments e
      JOIN org_class_packages p ON p.id = e.package_id
      WHERE e.user_id = ${userId}
        AND e.final_submission_id IS NOT NULL
      LIMIT 1
    ` as unknown as [{ id: string } | undefined]
    isFirstClass = !prior
  }

  try {
    const [enrollment] = await db`
      INSERT INTO org_class_enrollments
        (package_id, user_id, first_name, last_name_initial, is_first_class)
      VALUES
        (${packageId}, ${userId ?? null}, ${firstName.trim()}, ${lastNameInitial?.trim() ?? null}, ${isFirstClass})
      RETURNING id
    ` as unknown as [{ id: string }]

    return NextResponse.json({ enrollmentId: enrollment.id })
  } catch (err) {
    console.error('[org/class/enroll] error:', err)
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 })
  }
}
