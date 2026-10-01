// The CSV import preview's look-ahead for rows WITH an email (read-only).
//
// importNameMatches (lib/roster-players.ts) covers the name-only rows. This
// covers the rest, so the preview can say what the import will do before
// anything is added:
//  - onTeam: rows the import would report as "already on team" — the email's
//    account for this child (same first name, or the address's one unnamed
//    account) is already a member. Mirrors addPlayerToTeam's link rule.
//  - warnings: the gentle same-name note the import adds afterwards
//    (sameNameTwinWarning, and the "another player in this file" note).
// Keep in step with addPlayerToTeam / importPlayersToTeam.

import { db } from '@/lib/db'
import { importRowProblem } from '@/lib/csv'
import { MAX_IMPORT_ROWS, type ImportRowInput } from '@/lib/roster-players'

const clean = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ')
const initialOf = (last: string) => clean(last).charAt(0).toUpperCase() || null
const label = (first: string, li: string | null) => `${first}${li ? ` ${li}.` : ''}`

interface EmailAccount {
  ownerFirst: string
  onTeam: boolean
}

async function accountsOn(teamId: string, email: string): Promise<EmailAccount[]> {
  const rows = (await db`
    SELECT NULLIF(TRIM(u.first_name), '') AS first_name,
           NULLIF(split_part(TRIM(COALESCE(u.nickname, '')), ' ', 1), '') AS nick_first,
           (SELECT NULLIF(TRIM(m.first_name), '') FROM team_memberships m
             WHERE m.user_id = u.id AND COALESCE(TRIM(m.first_name), '') <> ''
             ORDER BY m.joined_at ASC LIMIT 1) AS m_first,
           EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.user_id = u.id AND tm.team_id = ${teamId}) AS on_team
    FROM users u
    WHERE LOWER(u.email) = ${email}
  `) as unknown as Array<{ first_name: string | null; nick_first: string | null; m_first: string | null; on_team: boolean }>
  return rows.map((r) => ({
    ownerFirst: (r.first_name || r.m_first || r.nick_first || '').trim().toLowerCase(),
    onTeam: !!r.on_team,
  }))
}

/** Same first name + last initial on the team, as findSameNameOnTeam sees it. */
async function sameNameOnTeam(
  teamId: string,
  first: string,
  li: string | null,
  email: string,
): Promise<{ pending: boolean; nameOnly: boolean; any: boolean }> {
  const f = first.toLowerCase()
  const i = li ?? ''
  // A name-only entry at this very address becomes the new account (no note).
  const pending = (await db`
    SELECT 1 FROM pending_team_members
    WHERE team_id = ${teamId} AND LOWER(TRIM(first_name)) = ${f}
      AND UPPER(COALESCE(TRIM(last_name_initial), '')) = ${i}
      AND LOWER(TRIM(COALESCE(contact_email, ''))) <> ${email}
  `) as unknown as unknown[]
  let players: unknown[] = []
  try {
    players = (await db`
      SELECT 1 FROM team_players
      WHERE team_id = ${teamId} AND LOWER(TRIM(first_name)) = ${f}
        AND UPPER(COALESCE(TRIM(last_name_initial), '')) = ${i}
    `) as unknown as unknown[]
  } catch {
    // team_players may not exist on an old schema
  }
  const members = (await db`
    SELECT 1 FROM team_memberships
    WHERE team_id = ${teamId} AND LOWER(TRIM(first_name)) = ${f}
      AND UPPER(COALESCE(TRIM(last_name_initial), '')) = ${i}
  `) as unknown as unknown[]
  return {
    pending: pending.length > 0,
    nameOnly: players.length > 0,
    any: pending.length + players.length + members.length > 0,
  }
}

export async function importEmailRowCheck(
  teamId: string,
  input: ImportRowInput[] | undefined,
): Promise<{ onTeam: number[]; warnings: Record<number, string> }> {
  const rows = Array.isArray(input) ? input.slice(0, MAX_IMPORT_ROWS) : []
  const onTeam: number[] = []
  const warnings: Record<number, string> = {}
  // Earlier rows of this file by first name + last initial (importPlayersToTeam's `seen`).
  const seen = new Map<string, Array<{ last: string; email: string }>>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {}
    const first = clean(row.firstName)
    const last = clean(row.lastName)
    const email = clean(row.email).toLowerCase()
    if (importRowProblem({ firstName: first, lastName: last, parentName: row.parentName, email })) continue
    const li = initialOf(last)
    const key = `${first.toLowerCase()}|${li ?? ''}`
    const earlier = seen.get(key) ?? []
    // "Same player as row N": the preview shows those itself.
    if (earlier.some((e) => e.last.toLowerCase() === last.toLowerCase() && e.email === email)) continue
    seen.set(key, [...earlier, { last, email }])
    if (!email) {
      if (earlier.length > 0) warnings[i] = `Another player in this file is also ${label(first, li)} — check this isn’t a duplicate.`
      continue
    }

    const accounts = await accountsOn(teamId, email)
    const want = first.toLowerCase()
    const same = accounts.filter((a) => a.ownerFirst === want)
    const linked = same.length > 0 ? same.some((a) => a.onTeam) : accounts.length === 1 && !accounts[0].ownerFirst && accounts[0].onTeam
    if (linked) {
      onTeam.push(i)
      continue
    }
    const match = await sameNameOnTeam(teamId, first, li, email)
    const name = label(first, li)
    if (match.pending) {
      warnings[i] = `There’s also a ${name} on this team without an email. If that’s the same player, use Add email on that row with this same email — their shots move to this account and the extra entry goes away.`
    } else if (match.nameOnly) {
      warnings[i] = `There’s also a ${name} on this team without an email. If that’s the same player, remove the extra entry.`
    } else if (match.any) {
      warnings[i] = `Another player on this team is also ${name} — check this isn’t a duplicate. Their emails tell them apart.`
    } else if (earlier.length > 0 && earlier.some((e) => !e.email)) {
      warnings[i] = `Another player in this file is also ${name} — check this isn’t a duplicate.`
    }
  }
  return { onTeam, warnings }
}
