import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimitByIp } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { checkEmailAbuse } from '@/lib/email-abuse'
import { isCleanDisplayText, BLOCKED_TEXT_ERROR } from '@/lib/moderation'

export async function POST(req: NextRequest) {
  try {
    // Applications are reviewed by hand, so the cost of spam is an admin's
    // attention. Three an hour is far above what a real club needs and far
    // below what a scripted client wants.
    const limit = await rateLimitByIp(req, 'org-apply', 3, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many applications — try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { orgName, email, playerCount, website, turnstileToken } = await req.json()

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

    if (!orgName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Organization name and email are required' }, { status: 400 })
    }
    if (!isCleanDisplayText(orgName)) {
      return NextResponse.json({ error: BLOCKED_TEXT_ERROR }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()
    const count = typeof playerCount === 'number' ? playerCount : null

    const existing = await db`
      SELECT id FROM org_applications WHERE email = ${emailLower} AND status = 'pending'
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: 'An application for this email is already pending review.' }, { status: 409 })
    }

    // Catches the alias trick the August applications used: three Gmail
    // addresses that differed only in dot placement.
    const abuse = await checkEmailAbuse(emailLower, 'org_applications')
    if (!abuse.ok) {
      return NextResponse.json({ error: abuse.error }, { status: 409 })
    }

    await db`
      INSERT INTO org_applications (org_name, email, player_count)
      VALUES (${orgName.trim()}, ${emailLower}, ${count})
    `
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Org apply error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
