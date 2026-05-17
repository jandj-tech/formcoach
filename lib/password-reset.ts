import crypto from 'crypto'
import { db } from '@/lib/db'

// Password resets work across every account type — players (`users`),
// organizations, founding coaches (`teams`) and additional coaches
// (`team_coaches`). The forgot-password and reset-password routes share this
// module so the lookup logic stays in one place.

export type AccountKind = 'user' | 'org' | 'team' | 'team_coach'

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Issues a password-reset token for whatever account owns `email`.
 * Account types are checked in the same priority order as login
 * (org → founding coach → additional coach → player). Returns the token, or
 * null if no account uses this email — callers should stay silent either way
 * so the response can't be used to probe which emails are registered.
 */
export async function issueResetToken(email: string): Promise<string | null> {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + TOKEN_TTL_MS)

  const orgs = (await db`
    UPDATE organizations SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE admin_email = ${email} RETURNING id
  `) as unknown as Array<{ id: string }>
  if (orgs.length > 0) return token

  // A founding coach can own several teams; the token goes on every team row
  // so the reset link resolves no matter which row is read back.
  const teams = (await db`
    UPDATE teams SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE admin_email = ${email} AND password_hash IS NOT NULL RETURNING id
  `) as unknown as Array<{ id: string }>
  if (teams.length > 0) return token

  const coaches = (await db`
    UPDATE team_coaches SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE email = ${email} AND password_hash IS NOT NULL RETURNING id
  `) as unknown as Array<{ id: string }>
  if (coaches.length > 0) return token

  const users = (await db`
    UPDATE users SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE email = ${email} RETURNING id
  `) as unknown as Array<{ id: string }>
  if (users.length > 0) return token

  return null
}

export interface ResetTarget {
  kind: AccountKind
  email: string
  userId?: string // set when kind === 'user'
  orgId?: string // set when kind === 'org'
  teamId?: string // set when kind === 'team' | 'team_coach'
  /** Where the freshly-logged-in account should land. */
  redirect: string
}

/**
 * Verifies a reset token, writes `passwordHash` to the matching account,
 * clears the token, and reports which session the caller should issue.
 * Returns null if the token is unknown or expired.
 */
export async function consumeResetToken(
  token: string,
  passwordHash: string,
): Promise<ResetTarget | null> {
  const [org] = (await db`
    SELECT id, admin_email FROM organizations
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `) as unknown as [{ id: string; admin_email: string } | undefined]
  if (org) {
    await db`
      UPDATE organizations
      SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ${org.id}
    `
    return { kind: 'org', orgId: org.id, email: org.admin_email, redirect: '/org/dashboard' }
  }

  const [team] = (await db`
    SELECT id, admin_email FROM teams
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `) as unknown as [{ id: string; admin_email: string } | undefined]
  if (team) {
    // All of a coach's teams share one password — update (and clear the token
    // on) every team they own.
    await db`
      UPDATE teams
      SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
      WHERE admin_email = ${team.admin_email}
    `
    return { kind: 'team', teamId: team.id, email: team.admin_email, redirect: '/team/dashboard' }
  }

  const [coach] = (await db`
    SELECT id, team_id, email FROM team_coaches
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `) as unknown as [{ id: string; team_id: string; email: string } | undefined]
  if (coach) {
    await db`
      UPDATE team_coaches
      SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ${coach.id}
    `
    return { kind: 'team_coach', teamId: coach.team_id, email: coach.email, redirect: '/team/dashboard' }
  }

  const [user] = (await db`
    SELECT id, email FROM users
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `) as unknown as [{ id: string; email: string } | undefined]
  if (user) {
    await db`
      UPDATE users
      SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ${user.id}
    `
    return { kind: 'user', userId: user.id, email: user.email, redirect: '/dashboard' }
  }

  return null
}
