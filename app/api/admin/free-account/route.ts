import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminSession } from '@/lib/admin-auth'
import { sendEntitlementConfirmation, sendCompSignupInvite, sendEntitlementChoice } from '@/lib/email-entitlements'
import { playersByEmail } from '@/lib/player-accounts'

async function isAdminAuthed(): Promise<boolean> {
  return isAdminSession()
}

export async function GET() {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await db`
    SELECT email, subscription_type, subscription_expires_at, created_at
    FROM email_list
    WHERE subscription_type = 'complimentary'
    ORDER BY created_at DESC
  `
  return NextResponse.json({ accounts })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json() as { email: string }
  if (!email?.trim()) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 10)

  // The grant always lives on email_list, keyed on the address. It reaches an
  // account only once that account has proven it owns the inbox — writing it
  // straight onto whatever users row carried the address (or creating a
  // password-less stub for it) handed it to whoever registered the address.
  await db`
    INSERT INTO email_list (email, subscription_type, subscription_expires_at)
    VALUES (${normalizedEmail}, 'complimentary', ${expiresAt})
    ON CONFLICT (email) DO UPDATE SET
      subscription_type = 'complimentary',
      subscription_expires_at = ${expiresAt}
  `

  // Several player accounts may share the address (siblings). The comp goes
  // to EXACTLY ONE (email_list.comp_user_id records which): the account it
  // already went to, else the single verified account, else the single
  // account. With several candidates the inbox gets one link per account and
  // the family chooses.
  const accounts = await playersByEmail(normalizedEmail)
  let compUserId: string | null = null
  try {
    const [row] = (await db`
      SELECT comp_user_id FROM email_list WHERE email = ${normalizedEmail}
    `) as unknown as [{ comp_user_id: string | null } | undefined]
    compUserId = row?.comp_user_id ?? null
  } catch {
    // comp_user_id missing (migrate-family-email.sql not applied yet).
  }
  const verified = accounts.filter((a) => !!a.email_verified_at)
  const account =
    accounts.find((a) => a.id === compUserId) ??
    (accounts.length === 1 ? accounts[0] : verified.length === 1 ? verified[0] : undefined)

  // Verified account → active now. Unverified → confirmation (or, for a
  // password-less account, setup) link to the inbox. No account → the signed
  // signup link, bound to this address. Email failures are non-fatal: the
  // grant is recorded and activates from any later proof of the inbox.
  let status: 'applied' | 'confirmation_sent' | 'invite_sent' | 'choice_sent' | 'pending' = 'pending'
  try {
    if (!account && accounts.length > 1) {
      const out = await sendEntitlementChoice(normalizedEmail, accounts)
      status = out === 'choice_sent' ? 'choice_sent' : 'pending'
    } else if (account) {
      const out = await sendEntitlementConfirmation(account.id)
      status = out === 'applied' ? 'applied' : out === 'confirm_sent' || out === 'setup_sent' ? 'confirmation_sent' : 'pending'
    } else {
      await sendCompSignupInvite(normalizedEmail)
      status = 'invite_sent'
    }
  } catch (err) {
    console.error('Failed to send complimentary access email:', err)
  }

  const message = {
    applied: 'Free membership is active on their account now.',
    confirmation_sent: 'They have an account — we emailed a link to confirm the address and activate it.',
    invite_sent: 'No account yet — we emailed a link to sign up with this address and activate it.',
    choice_sent: `${accounts.length} player accounts share this address — we emailed a link for each so they can choose which one gets it.`,
    pending: 'Grant recorded. It activates once they confirm the address.',
  }[status]

  return NextResponse.json({ success: true, status, message })
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json() as { email: string }
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  await db`
    UPDATE email_list
    SET subscription_type = NULL, subscription_expires_at = NULL
    WHERE email = ${normalizedEmail}
      AND subscription_type = 'complimentary'
  `
  // Revoking must also take it off the account it was applied to — clearing
  // only email_list left the comp live on the users row forever. Every
  // account on the address is checked: a comp only ever reaches one of them
  // (comp_user_id), and 'complimentary' is only ever set by this grant.
  await db`
    UPDATE users
    SET subscription_type = NULL, subscription_expires_at = NULL
    WHERE LOWER(email) = ${normalizedEmail}
      AND subscription_type = 'complimentary'
  `
  try {
    await db`UPDATE email_list SET comp_user_id = NULL WHERE email = ${normalizedEmail} AND subscription_type IS NULL`
  } catch {
    // comp_user_id missing (migrate-family-email.sql not applied yet).
  }

  return NextResponse.json({ success: true })
}
