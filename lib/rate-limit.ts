import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

/**
 * Postgres-backed fixed-window rate limiting.
 *
 * Serverless means per-instance memory counters are close to useless — each
 * cold start gets a fresh, empty counter — so the limit lives in the database
 * every instance already shares. Same self-healing-schema approach the support
 * form uses (scripts/migrate-rate-limits.sql may not have been applied to the
 * deployed DATABASE_URL), so the table is created on first use.
 */

let tableEnsured = false
async function ensureTable() {
  if (tableEnsured) return
  await db`
    CREATE TABLE IF NOT EXISTS rate_limit_hits (
      id BIGSERIAL PRIMARY KEY,
      bucket VARCHAR(160) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await db`CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_created_idx ON rate_limit_hits (bucket, created_at)`
  tableEnsured = true
}

/** Best-effort client IP. Vercel always sets x-forwarded-for. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim().slice(0, 64)
  return req.headers.get('x-real-ip')?.slice(0, 64) || 'unknown'
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSeconds: number
}

/**
 * Records a hit against `bucket` and reports whether the caller is over budget.
 *
 * Fails OPEN on a database error, deliberately: a limiter that is itself broken
 * must not take down login for everyone. Every endpoint it guards has its own
 * authentication and authorization — this only blunts brute force and cost
 * abuse, so availability wins that particular trade.
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    await ensureTable()

    const key = bucket.slice(0, 160)
    const [row] = (await db`
      SELECT COUNT(*)::int AS hits
      FROM rate_limit_hits
      WHERE bucket = ${key}
        AND created_at > NOW() - (${windowSeconds} * INTERVAL '1 second')
    `) as unknown as [{ hits: number }]

    if (row.hits >= limit) {
      return { ok: false, retryAfterSeconds: windowSeconds }
    }

    await db`INSERT INTO rate_limit_hits (bucket) VALUES (${key})`

    // Opportunistic cleanup so the table cannot grow without bound. Runs on
    // roughly 1% of calls; nothing depends on rows older than a day.
    if (Math.random() < 0.01) {
      await db`DELETE FROM rate_limit_hits WHERE created_at < NOW() - INTERVAL '1 day'`
    }

    return { ok: true, retryAfterSeconds: 0 }
  } catch (err) {
    console.error('[rate-limit] check failed, allowing request:', err)
    return { ok: true, retryAfterSeconds: 0 }
  }
}

/** Convenience wrapper: limit one route by client IP. */
export async function rateLimitByIp(
  req: NextRequest,
  route: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  return rateLimit(`${route}:${clientIp(req)}`, limit, windowSeconds)
}
