import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { grantFreeOrgTokensIfEligible } from '@/lib/team-tokens'
import { CLASS_ANALYSES_PER_PLAYER } from '@/lib/org-class-pricing'

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

    // Class-package team: enforce the roster cap and grant 2 tokens from the
    // package pool on the player's first join. The (package_id, user_id) unique
    // index on org_class_enrollments stops a re-join from double-granting.
    if (team.class_package_id) {
      const [pkg] = await db`
        SELECT p.id, p.player_count, p.token_pool, p.status,
               COUNT(e.id)::int AS enrolled_count,
               BOOL_OR(e.user_id = ${session.userId}) AS already_enrolled
        FROM org_class_packages p
        LEFT JOIN org_class_enrollments e ON e.package_id = p.id
        WHERE p.id = ${team.class_package_id}
        GROUP BY p.id
      ` as unknown as [{
        id: string; player_count: number; token_pool: number; status: string
        enrolled_count: number; already_enrolled: boolean | null
      } | undefined]

      if (!pkg) {
        return NextResponse.json({ error: 'Class package not found' }, { status: 404 })
      }
      if (pkg.status !== 'active') {
        return NextResponse.json({ error: 'This class program is no longer active' }, { status: 400 })
      }

      const alreadyEnrolled = pkg.already_enrolled === true
      if (!alreadyEnrolled) {
        if (pkg.enrolled_count >= pkg.player_count) {
          return NextResponse.json(
            { error: 'This team is full — every player slot has been claimed' },
            { status: 400 },
          )
        }
        if (pkg.token_pool < CLASS_ANALYSES_PER_PLAYER) {
          return NextResponse.json(
            { error: 'No analysis tokens remaining in this class package' },
            { status: 400 },
          )
        }

        // Race-safe decrement: only succeeds if the pool still has enough.
        const drained = await db`
          UPDATE org_class_packages
          SET token_pool = token_pool - ${CLASS_ANALYSES_PER_PLAYER}
          WHERE id = ${pkg.id} AND token_pool >= ${CLASS_ANALYSES_PER_PLAYER}
          RETURNING id
        ` as unknown as Array<{ id: string }>
        if (drained.length === 0) {
          return NextResponse.json(
            { error: 'No analysis tokens remaining in this class package' },
            { status: 400 },
          )
        }

        // Insert enrollment, guarded by the (package_id, user_id) unique index.
        // If someone raced us to enroll the same player, refund the pool and skip.
        const enrolled = await db`
          INSERT INTO org_class_enrollments
            (package_id, user_id, first_name, last_name_initial, is_first_class)
          VALUES
            (${pkg.id}, ${session.userId}, ${firstNameClean}, ${lastInitialClean}, true)
          ON CONFLICT (package_id, user_id) DO NOTHING
          RETURNING id
        ` as unknown as Array<{ id: string }>

        if (enrolled.length === 0) {
          await db`
            UPDATE org_class_packages
            SET token_pool = token_pool + ${CLASS_ANALYSES_PER_PLAYER}
            WHERE id = ${pkg.id}
          `
        } else {
          await db`
            UPDATE users
            SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${CLASS_ANALYSES_PER_PLAYER}
            WHERE id = ${session.userId}
          `
        }
      }
    }

    await db`
      INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
      VALUES (${session.userId}, ${team.id}, ${firstNameClean}, ${lastInitialClean})
      ON CONFLICT (user_id, team_id) DO UPDATE
        SET first_name = ${firstNameClean}, last_name_initial = ${lastInitialClean}
    `

    // Grant free token to all eligible org team members (fires when team hits 8)
    await grantFreeOrgTokensIfEligible(team.id)

    return NextResponse.json({ success: true, teamName: team.name })
  } catch (err) {
    console.error('Team join error:', err)
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 })
  }
}
