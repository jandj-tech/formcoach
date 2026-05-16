import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { packageId, userId, firstName, lastNameInitial } = await req.json()
  if (!packageId || !firstName) {
    return NextResponse.json({ error: 'packageId and firstName required' }, { status: 400 })
  }

  // Verify package belongs to this org and has capacity
  const [pkg] = await db`
    SELECT p.id, p.player_count, p.token_pool, p.status,
           COUNT(e.id)::int AS enrolled_count
    FROM org_class_packages p
    LEFT JOIN org_class_enrollments e ON e.package_id = p.id
    WHERE p.id = ${packageId} AND p.org_id = ${session.orgId}
    GROUP BY p.id
  ` as unknown as [{ id: string; player_count: number; token_pool: number; status: string; enrolled_count: number } | undefined]

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (pkg.status !== 'active') return NextResponse.json({ error: 'Package is not active' }, { status: 400 })
  if (pkg.enrolled_count >= pkg.player_count) {
    return NextResponse.json({ error: 'Package is full — all player slots are taken' }, { status: 400 })
  }
  if (pkg.token_pool < 2) {
    return NextResponse.json({ error: 'Not enough analysis tokens remaining in this package' }, { status: 400 })
  }

  // Check if this is the player's first time in a class (determines 3% display rule)
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
    // Deduct 2 tokens from package pool
    await db`
      UPDATE org_class_packages
      SET token_pool = token_pool - 2
      WHERE id = ${packageId}
    `

    // Grant 2 tokens to the player's account if they have one
    if (userId) {
      await db`
        UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + 2
        WHERE id = ${userId}
      `
    }

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
