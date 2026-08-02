import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendSupportRequestEmail } from '@/lib/email'

// Topic slugs the form is allowed to send, mapped to the label shown in the
// notification email. Must stay in sync with app/support/SupportForm.tsx.
const TOPICS: Record<string, string> = {
  account: 'Account & login',
  analysis: 'Shot analysis results',
  orders: 'Orders & shipping',
  billing: 'Credits, tokens & billing',
  teams: 'Teams & organizations',
  report: 'Report inappropriate content',
  other: 'Something else',
}

// Spam throttle: submissions are recorded in support_requests and counted
// before a new one is accepted. Kept loose — the honeypot is the primary bot
// defense, and one IP can be a whole school or team on shared wifi. These
// only stop a runaway flood.
const MAX_PER_IP_PER_HOUR = 10
const MAX_PER_EMAIL_PER_DAY = 10
const MAX_TOTAL_PER_DAY = 150

// Self-healing schema: the deployed database is not guaranteed to have had
// scripts/migrate-support-requests.sql applied (Vercel's DATABASE_URL can
// differ from .env.local), so ensure the table exists before first use.
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured) return
  await db`
    CREATE TABLE IF NOT EXISTS support_requests (
      id SERIAL PRIMARY KEY,
      topic VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      ip VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await db`CREATE INDEX IF NOT EXISTS support_requests_ip_created_idx ON support_requests (ip, created_at)`
  await db`CREATE INDEX IF NOT EXISTS support_requests_email_created_idx ON support_requests (email, created_at)`
  tableEnsured = true
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const { topic, name, email, message, website } = await req.json()

    // Honeypot: a hidden field real visitors never see. Bots that fill every
    // input get a fake success and nothing is stored or sent.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ success: true })
    }

    const topicLabel = TOPICS[String(topic)]
    if (!topicLabel) {
      return NextResponse.json({ error: 'Pick a topic' }, { status: 400 })
    }
    const cleanName = String(name || '').trim()
    if (!cleanName || cleanName.length > 100) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const cleanEmail = String(email || '').toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 255) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    }
    const cleanMessage = String(message || '').trim()
    if (cleanMessage.length < 10) {
      return NextResponse.json({ error: 'Tell us a little more (at least 10 characters)' }, { status: 400 })
    }
    if (cleanMessage.length > 5000) {
      return NextResponse.json({ error: 'Message is too long (max 5000 characters)' }, { status: 400 })
    }

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'

    const counts = (await db`
      SELECT
        COUNT(*) FILTER (WHERE ip = ${ip} AND created_at > NOW() - INTERVAL '1 hour')::int AS ip_recent,
        COUNT(*) FILTER (WHERE email = ${cleanEmail})::int AS email_recent,
        COUNT(*)::int AS total_recent
      FROM support_requests
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `) as unknown as Array<{ ip_recent: number; email_recent: number; total_recent: number }>
    if (
      counts[0].ip_recent >= MAX_PER_IP_PER_HOUR ||
      counts[0].email_recent >= MAX_PER_EMAIL_PER_DAY ||
      counts[0].total_recent >= MAX_TOTAL_PER_DAY
    ) {
      return NextResponse.json(
        { error: 'You have sent several messages recently — please try again in about an hour.' },
        { status: 429 },
      )
    }

    await db`
      INSERT INTO support_requests (topic, name, email, message, ip)
      VALUES (${topic}, ${cleanName}, ${cleanEmail}, ${cleanMessage}, ${ip})
    `

    try {
      await sendSupportRequestEmail({
        topic: topicLabel,
        name: cleanName,
        email: cleanEmail,
        message: cleanMessage,
      })
    } catch {
      // The request is stored, but nobody is notified — tell the visitor so
      // their question doesn't silently disappear.
      return NextResponse.json(
        { error: 'We could not send your message right now — please try again in a few minutes.' },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Support request error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
