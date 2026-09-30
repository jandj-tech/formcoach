import { db } from '@/lib/db'

// Changing a team's head coach, from the org dashboard.
//
// The head-coach seat is the teams row itself (admin_email / password_hash),
// so "changing" it means overwriting that row. Everything that can act on the
// seat has to be reset in the same step, or it keeps working for whoever holds
// it: a still-open coach invite link (teams.coach_invite_token) would let the
// removed invitee set a password on the promoted coach's seat and log in as
// them, and a still-open reset link (teams.reset_token) would reset the
// promoted coach's password on every team. Both are cleared here, in the same
// transaction as the seat change, for every caller.
//
// "No head coach" is modelled the way a self-coached team already is: the
// org's own admin email with no password, which coachEmailForTeam() accepts
// through the organization branch.

export class HeadCoachError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 'org' = the organization coaches the team; 'next' = legacy "promote the oldest accepted coach". */
export type HeadCoachTarget = { coachId: string } | 'org' | 'next'

export interface HeadCoachPreview {
  teamId: string
  teamName: string
  orgName: string
  current: {
    email: string
    nickname: string | null
    /** The organization coaches this team itself. */
    isOrg: boolean
    /** Invited but never finished setup. */
    pending: boolean
    /** Their personal coach tokens (coach_credits). */
    tokens: number
    /** Other coaching seats they hold (any team, head or assistant). */
    otherTeams: number
  }
  candidates: Array<{ id: string; email: string; nickname: string | null; accepted: boolean }>
}

export interface HeadCoachResult {
  newHead: { email: string; nickname: string | null; isOrg: boolean }
  removed: { email: string; nickname: string | null } | null
  tokensReturned: number
  /** Tokens left with the removed coach (they coach other teams, or the org chose to leave them). */
  tokensKept: number
  orgTokenBalance: number | null
}

type Sql = typeof db

async function otherSeats(sql: Sql, email: string, teamId: string): Promise<number> {
  const [row] = (await sql`
    SELECT
      (SELECT COUNT(*) FROM teams WHERE LOWER(admin_email) = ${email} AND id <> ${teamId})::int
      + (SELECT COUNT(*) FROM team_coaches WHERE LOWER(email) = ${email} AND team_id <> ${teamId})::int
      AS n
  `) as unknown as [{ n: number }]
  return row?.n ?? 0
}

async function coachTokens(sql: Sql, email: string, lock = false): Promise<number> {
  const rows = (lock
    ? await sql`SELECT credits FROM coach_credits WHERE LOWER(email) = ${email} FOR UPDATE`
    : await sql`SELECT credits FROM coach_credits WHERE LOWER(email) = ${email}`) as unknown as Array<{ credits: number }>
  return rows.reduce((s, r) => s + (Number(r.credits) || 0), 0)
}

export async function loadHeadCoachPreview(orgId: string, teamId: string): Promise<HeadCoachPreview> {
  if (!UUID.test(teamId)) throw new HeadCoachError(404, 'Team not found')
  const [team] = (await db`
    SELECT t.id, t.name, t.admin_email, t.coach_nickname, (t.password_hash IS NULL) AS no_password,
           o.admin_email AS org_email, o.name AS org_name
    FROM teams t JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ${teamId} AND t.organization_id = ${orgId}
  `) as unknown as [{
    id: string; name: string; admin_email: string; coach_nickname: string | null
    no_password: boolean; org_email: string; org_name: string
  } | undefined]
  if (!team) throw new HeadCoachError(404, 'Team not found')

  const email = team.admin_email.toLowerCase()
  const isOrg = email === team.org_email.toLowerCase() && team.no_password
  const candidates = (await db`
    SELECT id, email, nickname, (password_hash IS NOT NULL) AS accepted
    FROM team_coaches WHERE team_id = ${teamId}
    ORDER BY created_at ASC
  `) as unknown as HeadCoachPreview['candidates']

  return {
    teamId: team.id,
    teamName: team.name,
    orgName: team.org_name,
    current: {
      email: team.admin_email,
      nickname: team.coach_nickname,
      isOrg,
      pending: team.no_password && !isOrg,
      tokens: isOrg ? 0 : await coachTokens(db, email),
      otherTeams: isOrg ? 0 : await otherSeats(db, email, teamId),
    },
    candidates: candidates.map(c => ({ ...c, accepted: !!c.accepted })),
  }
}

export async function changeHeadCoach(
  orgId: string,
  teamId: string,
  target: HeadCoachTarget,
  returnTokens: boolean,
): Promise<HeadCoachResult> {
  if (!UUID.test(teamId)) throw new HeadCoachError(404, 'Team not found')
  if (typeof target === 'object' && !UUID.test(target.coachId)) {
    throw new HeadCoachError(404, 'That coach is not on this team.')
  }

  return db.begin(async (tx) => {
    const sql = tx as unknown as Sql
    // Lock the seat so two changes can't interleave.
    const [team] = (await sql`
      SELECT t.id, t.admin_email, t.coach_nickname, (t.password_hash IS NULL) AS no_password,
             o.admin_email AS org_email
      FROM teams t JOIN organizations o ON o.id = t.organization_id
      WHERE t.id = ${teamId} AND t.organization_id = ${orgId}
      FOR UPDATE OF t
    `) as unknown as [{
      id: string; admin_email: string; coach_nickname: string | null; no_password: boolean; org_email: string
    } | undefined]
    if (!team) throw new HeadCoachError(404, 'Team not found')

    const oldEmail = team.admin_email.toLowerCase()
    const orgEmail = team.org_email.toLowerCase()
    const currentIsOrg = oldEmail === orgEmail && team.no_password

    let promoted: { id: string; email: string; password_hash: string; nickname: string | null } | null = null
    if (target === 'org') {
      if (currentIsOrg) throw new HeadCoachError(409, 'Your organization already coaches this team.')
    } else {
      const [row] = (target === 'next'
        ? await sql`
            SELECT id, email, password_hash, nickname FROM team_coaches
            WHERE team_id = ${teamId} AND password_hash IS NOT NULL
            ORDER BY created_at ASC LIMIT 1 FOR UPDATE
          `
        : await sql`
            SELECT id, email, password_hash, nickname FROM team_coaches
            WHERE id = ${target.coachId} AND team_id = ${teamId}
            FOR UPDATE
          `) as unknown as [{ id: string; email: string; password_hash: string | null; nickname: string | null } | undefined]
      if (!row) {
        throw target === 'next'
          ? new HeadCoachError(409, 'There is no other coach who has finished setup. Pick "I\'ll coach this team myself" or add a coach first.')
          : new HeadCoachError(404, 'That coach is not on this team.')
      }
      if (!row.password_hash) {
        throw new HeadCoachError(409, `${row.nickname || row.email} hasn't finished setting up their account yet, so they can't be head coach.`)
      }
      promoted = { ...row, password_hash: row.password_hash }
    }

    const newEmail = promoted ? promoted.email : team.org_email
    const newHash = promoted ? promoted.password_hash : null
    const newNickname = promoted ? promoted.nickname : null

    await sql`
      UPDATE teams SET
        admin_email = ${newEmail},
        password_hash = ${newHash},
        coach_nickname = ${newNickname},
        coach_invite_token = NULL,
        invite_sent_at = NULL,
        reset_token = NULL,
        reset_token_expires = NULL
      WHERE id = ${teamId}
    `

    // Inbox proof (lib/team-auth.ts credentialInboxProven) moves with the
    // promoted coach's credential: their assistant row — about to be deleted —
    // carried it, so without this a proven coach would lose unlocked tokens on
    // promotion. Only a proof still bound to their current hash is carried;
    // otherwise (and for an org takeover) the head row's proof is cleared.
    // Savepoint: before migrate-coach-email-proof.sql the columns don't exist,
    // and that must not abort the head-coach change.
    try {
      await tx.savepoint(async (sp) => {
        if (promoted) {
          await sp`
            UPDATE teams t SET
              coach_email_proven_at = CASE WHEN tc.email_proven_hash = tc.password_hash THEN tc.email_proven_at END,
              coach_email_proven_hash = CASE WHEN tc.email_proven_hash = tc.password_hash THEN tc.email_proven_hash END
            FROM team_coaches tc
            WHERE t.id = ${teamId} AND tc.id = ${promoted.id}
          `
        } else {
          await sp`UPDATE teams SET coach_email_proven_at = NULL, coach_email_proven_hash = NULL WHERE id = ${teamId}`
        }
      })
    } catch (err) {
      console.warn('[change-head-coach] inbox proof not carried:', err instanceof Error ? err.message : err)
    }

    const removedCoach = oldEmail !== newEmail.toLowerCase() && !currentIsOrg
    // The promoted coach's assistant seat becomes the head seat. The removed
    // coach loses every seat on this team (an extra assistant row would
    // otherwise keep their sessions alive).
    await sql`DELETE FROM team_coaches WHERE team_id = ${teamId} AND LOWER(email) = ${newEmail.toLowerCase()}`
    if (removedCoach) {
      await sql`DELETE FROM team_coaches WHERE team_id = ${teamId} AND LOWER(email) = ${oldEmail}`
    }

    let tokensReturned = 0
    let tokensKept = 0
    let orgTokenBalance: number | null = null
    if (removedCoach && oldEmail !== orgEmail) {
      const tokens = await coachTokens(sql, oldEmail, true)
      if (tokens > 0) {
        const seats = await otherSeats(sql, oldEmail, teamId)
        if (returnTokens && seats === 0) {
          await sql`UPDATE coach_credits SET credits = 0 WHERE LOWER(email) = ${oldEmail}`
          const [org] = (await sql`
            UPDATE organizations SET token_balance = COALESCE(token_balance, 0) + ${tokens}
            WHERE id = ${orgId}
            RETURNING token_balance
          `) as unknown as [{ token_balance: number }]
          tokensReturned = tokens
          orgTokenBalance = org?.token_balance ?? null
        } else {
          tokensKept = tokens
        }
      }
    }

    return {
      newHead: { email: newEmail, nickname: newNickname, isOrg: !promoted },
      removed: removedCoach ? { email: team.admin_email, nickname: team.coach_nickname } : null,
      tokensReturned,
      tokensKept,
      orgTokenBalance,
    }
  }) as Promise<HeadCoachResult>
}
