import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { addToEmailList } from '@/lib/email-list'
import { sendMetaEvent, makeRegistrationEvent, attributionFromRequest } from '@/lib/meta-server'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimitLogin } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { checkEmailAbuse } from '@/lib/email-abuse'
import { cleanOptionalDisplayText, capitalizeFirst } from '@/lib/moderation'
import { MAX_PLAYERS_PER_EMAIL } from '@/lib/player-accounts'
import { playerFirstName, siblingPasswordClash, SIBLING_PASSWORD_CODE } from '@/lib/password-reset'
import { resendPlayerSetup, adoptLegacySubmissions, claimPendingInvite } from '@/lib/roster-players'
import {
  verifyCompSignupToken,
  markEmailVerified,
  applyEmailEntitlement,
  hasPendingEntitlement,
  sendEntitlementConfirmation,
} from '@/lib/email-entitlements'

interface ExistingRow {
  id: string
  email: string
  password_hash: string | null
  roster_pending: boolean | null
  first_name: string | null
  nickname: string | null
  has_oauth: boolean
}

export async function POST(req: NextRequest) {
  try {
    const {
      email, password, nickname, teamInviteToken, claimToken, compToken, website, turnstileToken, metaEventId,
      anotherPlayer, firstName,
    } = await req.json()

    // Per email AND per IP (security audit item 8): a whole team of parents
    // signing up from one gym Wi-Fi must all get through (60/IP/hour), while
    // one address still can't be hammered (5/email/hour).
    const limit = await rateLimitLogin(req, 'signup', typeof email === 'string' ? email : null, {
      perIp: 60,
      perEmail: 5,
      windowSeconds: 3600,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    // Honeypot: a field hidden from real visitors. Bots fill every input they
    // find. Answer with a plain success so the operator cannot tell their
    // submission was dropped and start probing for the reason.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ success: true })
    }

    const captcha = await verifyTurnstile(req, turnstileToken)
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 })
    }

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Email and password (6+ chars) required' }, { status: 400 })
    }

    // Same display-text rule (and 50-char cap) as /api/account/nickname.
    const nicknameClean = cleanOptionalDisplayText(nickname, 50)
    if (!nicknameClean.ok) {
      return NextResponse.json({ error: nicknameClean.error }, { status: 400 })
    }
    const nicknameTrimmed = nicknameClean.value

    const emailLower = email.toLowerCase().trim()

    // "Adding another player on this email?" (the web signup page; the
    // shipped iOS app never sends it). Several player accounts may share one
    // address (siblings), told apart by their passwords — so this creates a
    // NEW account for that first name. A plain signup on a known address keeps
    // today's answer ("account exists — log in"), which the shipped app shows.
    let siblingFirstName: string | null = null
    if (anotherPlayer === true) {
      const fn = cleanOptionalDisplayText(firstName, 50)
      if (!fn.ok) return NextResponse.json({ error: fn.error }, { status: 400 })
      if (!fn.value) {
        return NextResponse.json({ error: "Enter the new player's first name." }, { status: 400 })
      }
      siblingFirstName = capitalizeFirst(fn.value)
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST)

    // Signup is serialized per address: with users_email_key gone, nothing
    // else stops a double submit (or two tabs) inserting two accounts. The
    // advisory lock is held for the transaction; the second request then sees
    // the first one's row and gets the normal "exists" answer.
    const outcome = await db.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'signup:' + emailLower}, 0))`
      const existing = (await sql`
        SELECT id, email, password_hash, roster_pending, first_name, nickname,
               EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_id = users.id) AS has_oauth
        FROM users WHERE LOWER(email) = ${emailLower}
        ORDER BY created_at ASC NULLS LAST, id ASC
        LIMIT ${MAX_PLAYERS_PER_EMAIL + 1}
      `) as unknown as ExistingRow[]

      if (existing.length > 0 && siblingFirstName === null) {
        return { kind: 'exists' as const, existing }
      }

      if (existing.length === 0) {
        // Signing up enrols the address in the marketing list, so an
        // unverified signup is a way to mail a stranger. Alias variants of one
        // Gmail inbox are the same account and must not each claim their own.
        // (A sibling on an address that already has accounts is the same
        // inbox, not an alias, so the check is for new addresses only.)
        const abuse = await checkEmailAbuse(emailLower, 'users')
        if (!abuse.ok) return { kind: 'abuse' as const, error: abuse.error }
      }

      if (siblingFirstName !== null && existing.length > 0) {
        const want = siblingFirstName.toLowerCase()
        const same = existing.find((r) => playerFirstName(r)?.toLowerCase() === want)
        if (same) return { kind: 'same_name' as const, row: same, name: siblingFirstName }
        if (existing.length >= MAX_PLAYERS_PER_EMAIL) return { kind: 'too_many' as const }
        // Different-password rule: the password is what tells siblings apart.
        const clash = await siblingPasswordClash(emailLower, password, null, sql)
        if (clash) return { kind: 'clash' as const, error: clash }
      }

      // free_analysis_used = true: the free signup analysis has been
      // discontinued, so new accounts start with no free upload.
      const [user] = (await sql`
        INSERT INTO users (email, password_hash, nickname, first_name, free_analysis_used)
        VALUES (${emailLower}, ${hash}, ${nicknameTrimmed}, ${siblingFirstName}, true)
        RETURNING id, email
      `) as unknown as [{ id: string; email: string }]
      return { kind: 'created' as const, user, sibling: existing.length > 0 }
    })

    if (outcome.kind === 'abuse') {
      return NextResponse.json({ error: outcome.error }, { status: 409 })
    }
    if (outcome.kind === 'too_many') {
      return NextResponse.json(
        { error: `This email already has ${MAX_PLAYERS_PER_EMAIL} player accounts — the most one email can hold.` },
        { status: 409 },
      )
    }
    if (outcome.kind === 'clash') {
      return NextResponse.json({ error: outcome.error, code: SIBLING_PASSWORD_CODE }, { status: 409 })
    }
    if (outcome.kind === 'same_name') {
      const { row, name } = outcome
      // A coach/org already added this child (password-less roster stub):
      // same rule as below — the setup link goes to the inbox, never a
      // password set from this form.
      if (row.roster_pending && !row.password_hash) {
        const out = await resendPlayerSetup(row.id)
        const error = out.ok
          ? `${name} was already added by a coach. We just sent ${name}'s setup link to that inbox — use it to finish ${name}'s account.`
          : `${name} was already added by a coach. Use the setup link in that inbox to finish ${name}'s account, or use “Forgot password” on the login page.`
        return NextResponse.json({ error, rosterPending: true, setupEmailSent: out.ok }, { status: 409 })
      }
      return NextResponse.json(
        {
          error: `${name} already has an account on this email. Log in with ${name}'s password, or use “Forgot password” on the login page.`,
          accountExists: true,
        },
        { status: 409 },
      )
    }
    if (outcome.kind === 'exists') {
      const existing = outcome.existing
      // Anyone on the address who can already sign in: the plain answer. The
      // web page offers "Adding another player on this email?" on this flag;
      // the shipped app ignores it and shows the message, as before.
      if (existing.some((r) => r.password_hash || r.has_oauth)) {
        return NextResponse.json({ error: 'Account already exists. Please log in.', accountExists: true }, { status: 409 })
      }
      // A player a coach/org added by email is a real but password-less stub
      // (roster_pending). Signing up with that email must NOT set a password
      // here: this form does not prove the person owns the inbox, and a
      // stranger who knows a parent's email would take over the child's
      // account (QA C2). Instead we (re)send the setup link to that inbox —
      // one per child, each naming that child — and the owner finishes setup
      // from there, keeping the same record.
      const stubs = existing.filter((r) => r.roster_pending && !r.password_hash).slice(0, MAX_PLAYERS_PER_EMAIL)
      if (stubs.length > 0) {
        const outs = []
        for (const stub of stubs) outs.push(await resendPlayerSetup(stub.id))
        const anySent = outs.some((o) => o.ok)
        const allLimited = outs.every((o) => !o.ok && o.reason === 'rate_limited')
        const [t] = (await db`
          SELECT t.name FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
          WHERE tm.user_id = ${stubs[0].id} ORDER BY tm.joined_at DESC LIMIT 1
        `) as unknown as [{ name: string } | undefined]
        const by = t?.name ? `This email was added by ${t.name}.` : 'A coach already added this email.'
        const link = stubs.length > 1 ? 'setup links (one per player)' : 'setup link'
        const error = anySent
          ? `${by} We just sent the ${link} to that inbox — use it to finish setting up the account.`
          : allLimited
            ? `${by} We already sent the ${link} to that inbox — check it (and the spam folder) to finish setting up the account.`
            : `${by} Use the setup link in that inbox to finish setting up the account, or use “Forgot password” on the login page to get a new one.`
        return NextResponse.json({ error, rosterPending: true, setupEmailSent: anySent }, { status: 409 })
      }
      // An old admin "free account" stub: password-less, never set up, no
      // provider identity. "Please log in" was a dead end — there is no
      // password to log in with. Same rule as the roster stub above: the form
      // proves nothing, so a setup link goes to the inbox (setting the password
      // there verifies the address and activates any comp on it).
      const out = await sendEntitlementConfirmation(existing[0].id, { requirePending: false })
      const sent = out === 'setup_sent'
      const error = sent
        ? 'An account for this email is waiting to be set up. We just emailed a link to that inbox — use it to set your password.'
        : out === 'rate_limited'
          ? 'An account for this email is waiting to be set up. We already emailed a setup link — check that inbox (and the spam folder).'
          : 'An account for this email is waiting to be set up. Use “Forgot password” on the login page to get a setup link.'
      return NextResponse.json({ error, setupEmailSent: sent }, { status: 409 })
    }

    const { user } = outcome
    const isSibling = outcome.sibling

    // Signup is open to anyone and proves nothing about the inbox, so a comp
    // (or any other email-keyed entitlement) on this address is NOT copied
    // onto the new account here — that handed it to whoever typed the address
    // first. It activates once the inbox is proven: either now, because they
    // came through the signed /signup?comp= link that was emailed to this very
    // address, or later from the confirmation link sent below.
    const compEmail = await verifyCompSignupToken(compToken)
    const inboxProven = compEmail !== null && compEmail === emailLower

    // Adopt this address's earlier anonymous shots — but never a coach's or
    // org admin's self-uploads (see adoptLegacySubmissions: this form does not
    // prove the inbox, so an email match alone is not ownership).
    // A sibling's account skips this: the address's earlier shots were
    // already offered to the account(s) that came first.
    if (!isSibling) await adoptLegacySubmissions(user.id, emailLower)

    // New accounts join the marketing list (they can unsubscribe any time;
    // a prior unsubscribe is preserved).
    await addToEmailList(emailLower)

    // Redeem a one-time claim token from a ball purchase (token is independent
    // of email). Consume-and-grant in one statement so a concurrent redemption
    // (double submit, webhook auto-credit) can never grant twice.
    if (claimToken) {
      try {
        await db`
          WITH claim AS (
            UPDATE pending_credit_claims SET redeemed_at = NOW()
            WHERE claim_token = ${claimToken} AND redeemed_at IS NULL AND tokens_to_grant > 0
            RETURNING tokens_to_grant
          )
          UPDATE users
          SET analysis_tokens = COALESCE(analysis_tokens, 0) + (SELECT tokens_to_grant FROM claim)
          WHERE id = ${user.id} AND EXISTS (SELECT 1 FROM claim)
        `
      } catch {
        // Non-fatal
      }
    }

    // If they registered via a coach invite link, claim their pending team
    // spot — and the shots the coach already uploaded for that invite.
    if (typeof teamInviteToken === 'string' && teamInviteToken) {
      try {
        await claimPendingInvite(user.id, teamInviteToken)
      } catch (err) {
        // Non-fatal: still create the account even if invite claim fails
        console.warn('Signup team-invite claim failed:', err instanceof Error ? err.message : err)
      }
    }

    // Fire server-side Meta CAPI event. The signup page sends the same
    // metaEventId it used for the browser pixel event, so Meta dedupes the
    // pair into one conversion. Skipped for signups made inside the iOS app —
    // Apple's ATT rules forbid tracking app users without authorization, and
    // the app never asks (attributionFromRequest returns {} for the app UA,
    // and the guard below skips the event entirely).
    const signupUA = req.headers.get('user-agent') ?? ''
    if (!signupUA.includes('LearnHoopsApp')) {
      const attr = attributionFromRequest(req)
      await sendMetaEvent(makeRegistrationEvent({
        email: emailLower,
        eventId: typeof metaEventId === 'string' && /^[\w-]{8,64}$/.test(metaEventId) ? metaEventId : undefined,
        ip: attr.ip,
        userAgent: attr.userAgent,
        fbp: attr.fbp,
        fbc: attr.fbc,
        url: attr.sourceUrl ?? 'https://www.learnhoops.com/signup',
      }))
    }

    // Email-keyed entitlement: activate now if the inbox is proven, otherwise
    // email the owner a confirmation link. Never fatal to signup.
    let pendingEntitlement = false
    try {
      if (inboxProven) {
        // Signing up through the comp link IS the family's choice of account
        // (several may share the address): the comp lands here, no second click.
        await markEmailVerified(user.id, emailLower)
        await applyEmailEntitlement(user.id, { chosen: true })
      } else if (await hasPendingEntitlement(user.id)) {
        pendingEntitlement = true
        await sendEntitlementConfirmation(user.id)
      }
    } catch (err) {
      console.warn('Signup entitlement check failed:', err instanceof Error ? err.message : err)
    }

    const token = await signSession({ userId: user.id, email: user.email }, hash)
    // pendingEntitlement is additive: already-shipped app builds ignore it.
    const res = NextResponse.json(pendingEntitlement ? { success: true, token, pendingEntitlement: true } : { success: true, token })
    res.cookies.set(sessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
