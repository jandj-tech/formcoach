import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

/**
 * Who is allowed to spend our money on an upload.
 *
 * The three endpoints in the upload flow — /api/upload-video (mints a Vercel
 * Blob write token) and /api/detect-shot-region + /api/detect-shot-window (call
 * the Anthropic API on our key) — were completely unauthenticated. Anyone could
 * loop them to run up the API bill or fill the blob store.
 *
 * They cannot simply require a player session, because a team upload is
 * deliberately anonymous: a coach hands out a team access code and players
 * upload without accounts. So the gate accepts any of the four ways a caller can
 * legitimately be mid-upload, mirroring exactly what /api/analyze itself
 * accepts.
 */

export type Uploader =
  | { kind: 'player'; userId: string }
  | { kind: 'team-coach'; teamId: string }
  | { kind: 'org'; orgId: string }
  | { kind: 'team-code'; teamId: string }

/** A stable per-caller identity for rate-limit buckets. */
export function uploaderKey(u: Uploader): string {
  switch (u.kind) {
    case 'player':
      return `player:${u.userId}`
    case 'team-coach':
      return `team:${u.teamId}`
    case 'org':
      return `org:${u.orgId}`
    case 'team-code':
      return `code:${u.teamId}`
  }
}

/**
 * Resolves the caller, or null when nobody legitimate is behind the request.
 *
 * `teamCode` comes from the request body for anonymous team uploads. It is
 * checked against the teams table, so an invalid or guessed code is rejected
 * before any paid work happens.
 */
export async function resolveUploader(
  req: NextRequest,
  teamCode?: string | null
): Promise<Uploader | null> {
  const player = await getSessionFromRequest(req)
  if (player?.userId) return { kind: 'player', userId: player.userId }

  const team = await getTeamSessionFromRequest(req)
  if (team?.teamId) return { kind: 'team-coach', teamId: team.teamId }

  const org = await getOrgSessionFromRequest(req)
  if (org?.orgId) return { kind: 'org', orgId: org.orgId }

  if (typeof teamCode === 'string' && teamCode.trim()) {
    const code = teamCode.trim().toUpperCase().slice(0, 32)
    const [team] = (await db`
      SELECT id FROM teams WHERE access_code = ${code}
    `) as unknown as [{ id: string } | undefined]
    if (team) return { kind: 'team-code', teamId: team.id }
  }

  return null
}
