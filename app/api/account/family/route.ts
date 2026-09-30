import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, signSession, sessionCookieOptions } from '@/lib/auth'
import {
  FamilyError,
  familyForUser,
  requestShareByInbox,
  shareWithPassword,
  stopSharing,
} from '@/lib/account-family'

/**
 * Family settings: the other player accounts on my email, and the opt-in
 * shared login between them (lib/account-family.ts has the rules).
 *
 *   GET  → { me, inGroup, accounts: [{ id, firstName, shared, setupComplete }] }
 *   POST { action: 'share', withUserId, password }            password = the OTHER account's
 *   POST { action: 'share-by-inbox', withUserId, password }   password = my own; mails a link
 *   POST { action: 'stop-sharing', newPassword }
 *
 * Player sessions only. When my password changes (share, stop-sharing) my
 * older sessions end, so this one is re-issued: a new cookie, and `token` in
 * the JSON for a Bearer (app) caller.
 */

function fail(err: unknown) {
  if (err instanceof FamilyError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
  }
  console.error('[account/family] failed:', err instanceof Error ? err.message : err)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await familyForUser(session.userId))
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown
    withUserId?: unknown
    password?: unknown
    newPassword?: unknown
  }
  const bearer = req.headers.get('Authorization')?.startsWith('Bearer ') ?? false

  async function reissue(payload: Record<string, unknown>, passwordHash: string) {
    const token = await signSession({ userId: session!.userId, email: session!.email }, passwordHash)
    const res = NextResponse.json(bearer ? { ...payload, token } : payload)
    res.cookies.set(sessionCookieOptions(token))
    return res
  }

  try {
    switch (body.action) {
      case 'share': {
        const out = await shareWithPassword(session.userId, body.withUserId, body.password)
        return await reissue({ success: true, sharedWith: out.sharedWith }, out.passwordHash)
      }
      case 'share-by-inbox': {
        const out = await requestShareByInbox(session.userId, body.withUserId, body.password)
        return NextResponse.json({ success: true, sent: true, sharedWith: out.sharedWith })
      }
      case 'stop-sharing': {
        const out = await stopSharing(session.userId, body.newPassword)
        return await reissue({ success: true }, out.passwordHash)
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    return fail(err)
  }
}
