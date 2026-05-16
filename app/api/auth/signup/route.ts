import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password, nickname, teamInviteToken } = await req.json()
    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Email and password (6+ chars) required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    const existing = await db`SELECT id FROM users WHERE email = ${emailLower}`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Account already exists. Please log in.' }, { status: 409 })
    }

    // Signup is open to anyone. If this email already has subscription state
    // (e.g. a legacy subscriber), carry it over — but it is not required.
    const [sub] = await db`
      SELECT subscription_type, subscription_expires_at
      FROM email_list
      WHERE email = ${emailLower}
    `

    const hash = await bcrypt.hash(password, 10)

    const nicknameTrimmed = nickname?.trim() || null

    const [user] = await db`
      INSERT INTO users (email, password_hash, subscription_type, subscription_expires_at, nickname)
      VALUES (${emailLower}, ${hash}, ${sub?.subscription_type ?? null}, ${sub?.subscription_expires_at ?? null}, ${nicknameTrimmed})
      RETURNING id, email
    ` as unknown as [{ id: string; email: string }]

    // Link any existing anonymous submissions for this email
    await db`UPDATE submissions SET user_id = ${user.id} WHERE email = ${emailLower} AND user_id IS NULL`

    // Carry over any analysis tokens that accumulated in email_list (e.g. from a ball purchase before account creation)
    try {
      const [emailEntry] = await db`
        SELECT analysis_tokens FROM email_list WHERE email = ${emailLower}
      ` as unknown as [{ analysis_tokens: number } | undefined]
      if (emailEntry?.analysis_tokens && emailEntry.analysis_tokens > 0) {
        await db`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${emailEntry.analysis_tokens} WHERE id = ${user.id}`
        await db`UPDATE email_list SET analysis_tokens = 0 WHERE email = ${emailLower}`
      }
    } catch {
      // Non-fatal
    }

    // If they registered via a coach invite link, claim their pending team spot
    if (teamInviteToken) {
      try {
        const [pending] = await db`
          SELECT id, team_id, first_name, last_name_initial
          FROM pending_team_members WHERE invite_token = ${teamInviteToken}
        ` as unknown as [{ id: string; team_id: string; first_name: string; last_name_initial: string | null } | undefined]
        if (pending) {
          await db`
            INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
            VALUES (${user.id}, ${pending.team_id}, ${pending.first_name}, ${pending.last_name_initial})
            ON CONFLICT (user_id, team_id) DO UPDATE
              SET first_name = EXCLUDED.first_name, last_name_initial = EXCLUDED.last_name_initial
          `
          await db`DELETE FROM pending_team_members WHERE id = ${pending.id}`
        }
      } catch {
        // Non-fatal: still create the account even if invite claim fails
      }
    }

    const token = await signSession({ userId: user.id, email: user.email })
    const res = NextResponse.json({ success: true, token })
    res.cookies.set(sessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
