import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canManageClassPackage } from '@/lib/org-class-access'
import { addPlayerToTeam, AddPlayerError, ensureClassEnrollmentByName } from '@/lib/roster-players'

// Program Manager "Add player". The player goes onto the class team's roster
// as a normal name-only player (exactly as the org's Add player does without
// an email), and that roster add enrols them in the class within its places
// (lib/roster-players ensureClassEnrollment). A shot uploaded for that roster
// player is then the one the class counts. Before, this made an enrolment
// with no player behind it, which nobody could ever upload for.
export async function POST(req: NextRequest) {
  const { packageId, userId, firstName, lastNameInitial } = await req.json()
  if (!packageId || !firstName || typeof firstName !== 'string') {
    return NextResponse.json({ error: 'packageId and firstName required' }, { status: 400 })
  }

  // The owning org or the class team's coach — both run the class manager.
  if (!(await canManageClassPackage(req, packageId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [pkg] = await db`
    SELECT p.id, p.player_count, p.status,
           t.id AS team_id, t.name AS team_name, o.name AS org_name
    FROM org_class_packages p
    LEFT JOIN teams t ON t.class_package_id = p.id
    LEFT JOIN organizations o ON o.id = p.org_id
    WHERE p.id = ${packageId}
    ORDER BY t.created_at ASC NULLS LAST
    LIMIT 1
  ` as unknown as [{
    id: string; player_count: number; status: string
    team_id: string | null; team_name: string | null; org_name: string | null
  } | undefined]

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (pkg.status !== 'active') return NextResponse.json({ error: 'Package is not active' }, { status: 400 })

  try {
    if (pkg.team_id) {
      const result = await addPlayerToTeam({
        teamId: pkg.team_id,
        firstName,
        lastName: typeof lastNameInitial === 'string' ? lastNameInitial : null,
        email: null,
        teamName: pkg.team_name,
        orgName: pkg.org_name,
        addedBy: pkg.org_name,
      })
      // The roster add enrolled a new player; a player already on the class
      // roster by this name is enrolled here (or already was).
      const enrol = await ensureClassEnrollmentByName(
        pkg.team_id,
        firstName,
        typeof lastNameInitial === 'string' ? lastNameInitial : null,
      )
      if (enrol.outcome === 'full') {
        return NextResponse.json({ error: 'Package is full — all player slots are taken' }, { status: 400 })
      }
      if (enrol.outcome === 'none') {
        return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 })
      }
      return NextResponse.json({
        enrollmentId: enrol.enrollmentId,
        alreadyEnrolled: result.status === 'already_on_team' && enrol.outcome === 'already',
        message: result.status === 'already_on_team'
          ? `${result.displayName} is already on the class team${enrol.outcome === 'already' ? ' and enrolled' : ' — now enrolled'}.`
          : `${result.displayName} is on the class team. Upload their shots from the team like any player.`,
      })
    }

    // An older package with no class team: the enrolment alone, as before —
    // counted and inserted under the same per-package lock as every other
    // enrolment (lib/roster-players ensureClassEnrollment), so parallel adds
    // can't overfill it.
    let isFirstClass = true
    if (userId) {
      const [prior] = await db`
        SELECT e.id FROM org_class_enrollments e
        WHERE e.user_id = ${userId} AND e.final_submission_id IS NOT NULL
        LIMIT 1
      ` as unknown as [{ id: string } | undefined]
      isFirstClass = !prior
    }
    const enrollment = await db.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'class-package:' + pkg.id}))`
      const [{ n }] = await sql`
        SELECT COUNT(*)::int AS n FROM org_class_enrollments WHERE package_id = ${pkg.id}
      ` as unknown as [{ n: number }]
      if (n >= pkg.player_count) return null
      const [row] = await sql`
        INSERT INTO org_class_enrollments
          (package_id, user_id, first_name, last_name_initial, is_first_class)
        VALUES
          (${packageId}, ${userId ?? null}, ${firstName.trim()}, ${lastNameInitial?.trim() ?? null}, ${isFirstClass})
        RETURNING id
      ` as unknown as [{ id: string }]
      return row
    }) as { id: string } | null
    if (!enrollment) {
      return NextResponse.json({ error: 'Package is full — all player slots are taken' }, { status: 400 })
    }
    return NextResponse.json({ enrollmentId: enrollment.id })
  } catch (err) {
    if (err instanceof AddPlayerError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[org/class/enroll] error:', err)
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 })
  }
}
