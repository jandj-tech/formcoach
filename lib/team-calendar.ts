import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { resolveBaseUrl } from '@/lib/base-url'
import type { TeamEventRow } from '@/lib/team-schedule'
import type { IcsEventInput } from '@/lib/ics'

/**
 * Calendar subscription feeds.
 *
 * A subscribed calendar is fetched by Google's or Apple's servers, not by the
 * person who subscribed — no cookies, no session, no way to answer a login
 * prompt. So the URL is the credential, exactly as it is for every other
 * calendar feed on the internet (Google's own "secret address in iCal format"
 * works this way).
 *
 * What that buys an attacker who gets the URL: the team's practice times and
 * locations. Not names, not RSVPs, not anything about a child — the feed is
 * deliberately narrower than the schedule page it comes from. And it is
 * revocable in one click, which is the part that makes the trade acceptable.
 */

/** How far back a subscribed calendar carries history. */
export const FEED_HISTORY_DAYS = 120

export interface FeedTeam {
  id: string
  name: string
}

/** 32 bytes base64url — 43 chars, inside the VARCHAR(64) column. */
function mintToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * The team's feed token, creating one on first use.
 *
 * The UPDATE is conditional on the column still being NULL and returns the
 * winning row, so two people opening the calendar panel at the same moment end
 * up with the same token rather than one of them silently invalidating the
 * other's fresh subscription.
 */
export async function getOrCreateFeedToken(teamId: string): Promise<string> {
  const [existing] = (await db`
    SELECT calendar_feed_token FROM teams WHERE id = ${teamId}
  `) as unknown as [{ calendar_feed_token: string | null } | undefined]
  if (!existing) throw new Error('team not found')
  if (existing.calendar_feed_token) return existing.calendar_feed_token

  const [row] = (await db`
    UPDATE teams
    SET calendar_feed_token = ${mintToken()}
    WHERE id = ${teamId} AND calendar_feed_token IS NULL
    RETURNING calendar_feed_token
  `) as unknown as [{ calendar_feed_token: string } | undefined]
  if (row) return row.calendar_feed_token

  // Lost the race — someone else minted one between the SELECT and the UPDATE.
  const [now] = (await db`
    SELECT calendar_feed_token FROM teams WHERE id = ${teamId}
  `) as unknown as [{ calendar_feed_token: string | null } | undefined]
  if (!now?.calendar_feed_token) throw new Error('could not issue a calendar token')
  return now.calendar_feed_token
}

/** Mint a new token, breaking every existing subscription. Coach action. */
export async function rotateFeedToken(teamId: string): Promise<string> {
  const [row] = (await db`
    UPDATE teams SET calendar_feed_token = ${mintToken()}
    WHERE id = ${teamId}
    RETURNING calendar_feed_token
  `) as unknown as [{ calendar_feed_token: string } | undefined]
  if (!row) throw new Error('team not found')
  return row.calendar_feed_token
}

/** The team a feed token belongs to, or null. The token IS the credential. */
export async function teamForFeedToken(token: string): Promise<FeedTeam | null> {
  // Guard the obviously-invalid before touching the database: an empty or
  // absurd token should not become a query.
  if (!token || token.length < 20 || token.length > 64) return null
  const [row] = (await db`
    SELECT id, name FROM teams WHERE calendar_feed_token = ${token}
  `) as unknown as [{ id: string; name: string } | undefined]
  return row ? { id: row.id, name: row.name } : null
}

/**
 * Events a subscribed calendar should carry: recent history plus everything
 * ahead. Cancelled events are included — they are published as CANCELLED so a
 * subscriber sees the practice is off, which vanishing from the feed would not
 * tell them.
 */
export async function feedEvents(teamId: string): Promise<IcsEventInput[]> {
  const rows = (await db`
    SELECT id, type, title, location, notes, starts_at, time_tbd, status,
           created_at, updated_at
    FROM team_events
    WHERE team_id = ${teamId}
      AND starts_at > NOW() - make_interval(days => ${FEED_HISTORY_DAYS})
    ORDER BY starts_at ASC
    LIMIT 500
  `) as unknown as TeamEventRow[]

  return rows.map(row => ({
    id: row.id,
    type: row.type,
    title: row.title,
    location: row.location,
    notes: row.notes,
    startsAt: new Date(row.starts_at),
    timeTbd: row.time_tbd,
    cancelled: row.status === 'cancelled',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }))
}

/**
 * The three shapes of the same feed URL, because every calendar app wants a
 * different one:
 *
 *  - `webcal:` is what Apple Calendar (and iOS) opens as a subscription. An
 *    https link would download a one-off snapshot instead, which is the exact
 *    bug people hit: the schedule stops updating and nobody knows why.
 *  - Google takes an https URL, wrapped in its "add by URL" endpoint.
 *  - The plain https URL is what someone pastes into anything else.
 */
export function feedUrls(token: string) {
  const base = resolveBaseUrl()
  const https = `${base}/api/team/schedule/feed/${token}`
  const webcal = https.replace(/^https?:\/\//, 'webcal://')
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  }
}
