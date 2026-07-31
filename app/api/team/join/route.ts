import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { grantFreeOrgTokensIfEligible } from '@/lib/team-tokens'
import { isCleanDisplayText, BLOCKED_TEXT_ERROR } from '@/lib/moderation'

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    // firstName / lastInitial are accepted only as a one-time *initial* set
    // for users who have no canonical name yet (e.g. someone signing up via
    // /signup?teamCode=… joining their first team). Once users.first_name is
    // set, those fields are ignored — the canonical user name wins so a single
    // email can't appear under different names on different teams.
    const { teamCode, firstName, lastInitial } = await req.json()
    if (!isCleanDisplayText(`${firstName ?? ''} ${lastInitial ?? ''}`)) {
      return NextResponse.json({ error: BLOCKED_TEXT_ERROR }, { status: 400 })
    }
    if (!teamCode || typeof teamCode !== 'string') {
      return NextResponse.json({ error: 'Team code required' }, { status: 400 })
    }

    const [user] = await db`
      SELECT first_name, last_initial FROM users WHERE id = ${session.userId}
    ` as unknown as [{ first_name: string | null; last_initial: string | null } | undefined]

    let firstNameClean = user?.first_name?.trim() ?? ''
    let lastInitialClean = user?.last_initial?.trim().charAt(0).toUpperCase() ?? ''

    if (!firstNameClean || !lastInitialClean) {
      const rawFirst = typeof firstName === 'string' ? firstName.trim().slice(0, 100) : ''
      const bodyFirst = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1) : ''
      const bodyLast = typeof lastInitial === 'string'
        ? lastInitial.trim().charAt(0).toUpperCase() : ''
      if (!bodyFirst || !bodyLast) {
        return NextResponse.json(
          { error: 'Set your name on the dashboard first, then try joining.' },
          { status: 400 },
        )
      }
      firstNameClean = bodyFirst
      lastInitialClean = bodyLast
      await db`
        UPDATE users
        SET first_name = ${firstNameClean}, last_initial = ${lastInitialClean}
        WHERE id = ${session.userId}
      `
    }

    const [team] = await db`
      SELECT id, name, class_package_id
      FROM teams
      WHERE access_code = ${teamCode.trim().toUpperCase()}
    ` as unknown as [{ id: string; name: string; class_package_id: string | null } | undefined]

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

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

      // org_class_enrollments has a PARTIAL unique index on (package_id, user_id)
      // WHERE user_id IS NOT NULL — Postgres can't infer a partial index for
      // `ON CONFLICT (cols) DO UPDATE`, so we use plain `ON CONFLICT DO NOTHING`
      // (works regardless of which index conflicts) and follow up with an
      // explicit UPDATE if the row already existed.
      const inserted = (await db`
        INSERT INTO org_class_enrollments
          (package_id, user_id, first_name, last_name_initial, is_first_class)
        VALUES
          (${pkg.id}, ${session.userId}, ${firstNameClean}, ${lastInitialClean}, true)
        ON CONFLICT DO NOTHING
        RETURNING id
      `) as unknown as Array<{ id: string }>

      if (inserted.length === 0) {
        await db`
          UPDATE org_class_enrollments
          SET first_name = ${firstNameClean}, last_name_initial = ${lastInitialClean}
          WHERE package_id = ${pkg.id} AND user_id = ${session.userId}
        `
      }
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
    // Surface the DB / Postgres error message to server logs so we can see
    // exactly which step failed (constraint name, column, etc.).
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[team/join] failed:', detail)
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 })
  }
}
