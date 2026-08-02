import { db } from '@/lib/db'

export interface ChatIdentity {
  isMember: boolean
  isCoach: boolean
  senderName: string
  muted: boolean
  chatMode: 'everyone' | 'coach-only'
  teamName: string
}

// Resolves what a logged-in user is allowed to do in a team's chat.
// Coaches are matched by account email (founding coach or added coach),
// players by team membership.
export async function resolveChatIdentity(
  teamId: string,
  userId: string,
  email: string,
): Promise<ChatIdentity | null> {
  const [team] = (await db`
    SELECT id, name, admin_email, coach_nickname,
           COALESCE(chat_mode, 'everyone') AS chat_mode
    FROM teams WHERE id = ${teamId}
  `) as unknown as [{ id: string; name: string; admin_email: string; coach_nickname: string | null; chat_mode: string } | undefined]
  if (!team) return null

  let isCoach = team.admin_email === email
  let coachNickname: string | null = isCoach ? team.coach_nickname : null
  if (!isCoach) {
    try {
      const [row] = (await db`
        SELECT nickname FROM team_coaches WHERE team_id = ${teamId} AND email = ${email} LIMIT 1
      `) as unknown as [{ nickname: string | null } | undefined]
      if (row) {
        isCoach = true
        coachNickname = row.nickname
      }
    } catch {}
  }

  const [membership] = (await db`
    SELECT first_name, last_name_initial FROM team_memberships
    WHERE team_id = ${teamId} AND user_id = ${userId} LIMIT 1
  `) as unknown as [{ first_name: string | null; last_name_initial: string | null } | undefined]

  if (!isCoach && !membership) return null

  let muted = false
  try {
    const rows = (await db`
      SELECT 1 FROM team_chat_mutes WHERE team_id = ${teamId} AND user_id = ${userId} LIMIT 1
    `) as unknown as unknown[]
    muted = rows.length > 0
  } catch {}

  const senderName = isCoach
    ? `${coachNickname || 'Coach'} (Coach)`
    : membership?.first_name
      ? `${membership.first_name}${membership.last_name_initial ? ` ${membership.last_name_initial.charAt(0)}.` : ''}`
      : 'Player'

  return {
    isMember: !!membership,
    isCoach,
    senderName,
    muted,
    chatMode: team.chat_mode === 'coach-only' ? 'coach-only' : 'everyone',
    teamName: team.name,
  }
}
