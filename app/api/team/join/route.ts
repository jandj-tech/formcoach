import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { grantFreeOrgTokensIfEligible } from '@/lib/team-tokens'

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const { teamCode, firstName, lastInitial } = await req.json()
    if (!teamCode || typeof teamCode !== 'string') {
      return NextResponse.json({ error: 'Team code required' }, { status: 400 })
    }
    if (!firstName || !lastInitial) {
      return NextResponse.json({ error: 'First name and last initial required' }, { status: 400 })
    }

    const [team] = await db`
      SELECT id, name, class_package_id
      FROM teams
      WHERE access_code = ${teamCode.trim().toUpperCase()}
    ` as unknown as [{ id: string; name: string; class_package_id: string | null } | undefined]

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const firstNameClean = String(firstName).trim()
    const lastInitialClean = String(lastInitial).trim().charAt(0).toUpperCase()

    // Class-package team: enforce the roster cap and record the enrollment.
    // No tokens are granted to the player — the org leader / team coach
    // uploads videos on their behalf using the team's shared credit pool.
    // The (package_id, user_id) unique index makes re-joins idempotent.
    if (team.class_package_id) {
      const [pkg] = await db`
        SELECT p.id, p.player_count, p.status,
               COUNT(e.id)::int AS enrolled_count,
               BOOL_OR(e.user_id = ${session.userId}) AS already_enrolled
        FROM org_class_packages p
        LEFT JOIN org_class_enrollments e ON e.package_id = p.id
        WHERE p.id = ${team.class_package_id}
        GROUP BY p.id
      ` as unknown as [{
        id: string; player_count: number; status: string
        enrolled_count: number; already_enrolled: boolean | null
      } | undefined]

      if (!pkg) {
        return NextResponse.json({ error: 'Class package not found' }, { status: 404 })
      }
      if (pkg.status !== 'active') {
        return NextResponse.json({ error: 'This class program is no longer active' }, { status: 400 })
      }
      if (pkg.already_enrolled !== true && pkg.enrolled_count >= pkg.player_count) {
        return NextResponse.json(
          { error: 'This class is full — every player slot has been claimed' },
          { status: 400 },
        )
      }

      await db`
        INSERT INTO org_class_enrollments
          (package_id, user_id, first_name, last_name_initial, is_first_class)
        VALUES
          (${pkg.id}, ${session.userId}, ${firstNameClean}, ${lastInitialClean}, true)
        ON CONFLICT (package_id, user_id) DO UPDATE
          SET first_name = ${firstNameClean}, last_name_initial = ${lastInitialClean}
      `
    }

    await db`
      INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
      VALUES (${session.userId}, ${team.id}, ${firstNameClean}, ${lastInitialClean})
      ON CONFLICT (user_id, team_id) DO UPDATE
        SET first_name = ${firstNameClean}, last_name_initial = ${lastInitialClean}
    `

    // Free-token grant for the legacy (non-class) org-team flow. Class teams
    // skip this because their credits live on the team via the webhook.
    if (!team.class_package_id) {
      await grantFreeOrgTokensIfEligible(team.id)
    }

    return NextResponse.json({ success: true, teamName: team.name })
  } catch (err) {
    console.error('Team join error:', err)
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 })
  }
}
