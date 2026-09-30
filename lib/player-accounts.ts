/**
 * Player accounts by email — several PLAYER accounts may share one address
 * (siblings under a parent's inbox; see scripts/migrate-family-email.sql).
 *
 * Nothing here may assume one row per email. The rules every caller follows:
 *   - Lookups return ALL player rows for lower(email), in one deterministic
 *     order (oldest first), so "the first row" is at least stable while
 *     callers are being moved off it.
 *   - A password decides which account a sign-in opens (matchPlayerPassword).
 *     Password-less rows (roster stubs, Google/Apple-only accounts) never
 *     match a password.
 *   - Anything keyed by the address alone — a guest purchase, a ball claim, a
 *     comp — lands on EXACTLY ONE account: the single verified account on that
 *     address (soleVerifiedPlayer), or it stays pending until the family picks.
 *
 * Works whether or not the old users_email_key unique constraint still exists.
 */

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { requireEnv } from '@/lib/env'
import { playerCredentialFingerprint } from '@/lib/auth'
import { fingerprintMatches } from '@/lib/org-auth'

export interface PlayerAccount {
  id: string
  email: string
  password_hash: string | null
  email_verified_at: Date | null
  roster_pending: boolean | null
  first_name: string | null
  last_initial: string | null
  nickname: string | null
  created_at: Date | null
}

function norm(email: string): string {
  return email.toLowerCase().trim()
}

/**
 * Upper bound on accounts one address can hold that a sign-in will check.
 * bcrypt is deliberately slow; a family never needs more than this.
 */
export const MAX_PLAYERS_PER_EMAIL = 8

/** Every player account on this address, oldest first (then by id). */
export async function playersByEmail(email: string): Promise<PlayerAccount[]> {
  const e = norm(email)
  if (!e) return []
  return (await db`
    SELECT id, email, password_hash, email_verified_at, roster_pending,
           first_name, last_initial, nickname, created_at
    FROM users
    WHERE LOWER(email) = ${e}
    ORDER BY created_at ASC NULLS LAST, id ASC
  `) as unknown as PlayerAccount[]
}

/**
 * The accounts on this address whose OWN password is `password` (at most
 * MAX_PLAYERS_PER_EMAIL checked, in playersByEmail order). Password-less rows
 * are skipped. Pass `accounts` to reuse a lookup already made.
 */
export async function matchPlayerPassword(
  email: string,
  password: string,
  accounts?: PlayerAccount[],
): Promise<PlayerAccount[]> {
  if (typeof password !== 'string' || !password) return []
  const rows = (accounts ?? (await playersByEmail(email)))
    .filter((a) => !!a.password_hash)
    .slice(0, MAX_PLAYERS_PER_EMAIL)
  const hits = await Promise.all(rows.map((a) => bcrypt.compare(password, a.password_hash!)))
  return rows.filter((_, i) => hits[i])
}

/**
 * The one account an address-keyed credit may land on: the single player
 * account on this address that has PROVEN the inbox. Null when there is none
 * or more than one — the caller keeps the credit pending and lets the family
 * choose (the emailed link).
 */
export async function soleVerifiedPlayer(email: string): Promise<{ id: string; email: string } | null> {
  const verified = (await playersByEmail(email)).filter((a) => !!a.email_verified_at)
  return verified.length === 1 ? { id: verified[0].id, email: verified[0].email } : null
}

/**
 * Parks `tokens` on a fresh one-time claim (pending_credit_claims — the same
 * table guest ball checkouts use). Redeemed into whichever account logs in or
 * signs up with the claim link (app/api/auth/login, signup, OAuth context).
 */
export async function createPendingCreditClaim(tokens: number): Promise<string> {
  const claimToken = crypto.randomUUID()
  await db`
    INSERT INTO pending_credit_claims (claim_token, tokens_to_grant)
    VALUES (${claimToken}, ${tokens})
  `
  return claimToken
}

// ---------------------------------------------------------------------------
// Player-choice token
// ---------------------------------------------------------------------------

/**
 * Short-lived proof that a password check just succeeded for SEVERAL player
 * accounts on one address (siblings in one shared-login group), naming exactly
 * the accounts the person may choose between — the player counterpart of the
 * team-choice token in lib/team-auth.ts.
 *
 * Each offered account is bound to the credential fingerprint of the password
 * hash that matched (the same `cv` a player session carries, lib/auth.ts), so
 * a password reset in the ten minutes since voids that account's choice.
 *
 * Signed with a key DERIVED from JWT_SECRET, never JWT_SECRET itself: every
 * session verifier accepts any JWT under that secret, so a choice token signed
 * with it would have to rely on shape checks alone not to pass as a session.
 */
export interface PlayerChoicePayload {
  kind: 'player-choice'
  email: string
  userIds: string[]
  /** userId → fingerprint of the password hash that matched at login. */
  cvs: Record<string, string>
}

const CHOICE_TTL = 60 * 10 // 10 minutes — long enough to pick from a list

let choiceKey: Uint8Array | undefined
function choiceSigningKey(): Uint8Array {
  if (!choiceKey) {
    choiceKey = new Uint8Array(crypto.createHmac('sha256', requireEnv('JWT_SECRET')).update('player-choice-v1').digest())
  }
  return choiceKey
}

export async function signPlayerChoice(
  email: string,
  accounts: Array<{ id: string; password_hash: string | null }>,
): Promise<string> {
  const userIds = accounts.map((a) => a.id)
  const cvs: Record<string, string> = {}
  for (const a of accounts) cvs[a.id] = playerCredentialFingerprint(a.id, a.password_hash)
  return new SignJWT({ kind: 'player-choice', email: norm(email), userIds, cvs } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHOICE_TTL}s`)
    .sign(choiceSigningKey())
}

export async function verifyPlayerChoice(token: unknown): Promise<PlayerChoicePayload | null> {
  if (typeof token !== 'string' || !token) return null
  try {
    const { payload } = await jwtVerify(token, choiceSigningKey(), { algorithms: ['HS256'] })
    const claims = payload as unknown as PlayerChoicePayload
    if (claims.kind !== 'player-choice') return null
    if (typeof claims.email !== 'string' || !claims.email) return null
    if (!Array.isArray(claims.userIds) || claims.userIds.length === 0) return null
    if (!claims.userIds.every((id) => typeof id === 'string' && id)) return null
    if (!claims.cvs || typeof claims.cvs !== 'object') return null
    return claims
  } catch {
    return null
  }
}

/**
 * The chosen account, re-read, when it is one the token offered, still carries
 * the token's address, and its CURRENT password hash is still the one that
 * matched (the fingerprint). Returns what a session is signed with, or null.
 */
export async function choiceRowForPlayer(
  choice: PlayerChoicePayload,
  userId: string,
): Promise<{ id: string; email: string; password_hash: string | null } | null> {
  if (!choice.userIds.includes(userId)) return null
  const want = choice.cvs[userId]
  if (typeof want !== 'string') return null
  const [row] = (await db`
    SELECT id, email, password_hash FROM users
    WHERE id = ${userId} AND LOWER(email) = ${norm(choice.email)}
  `) as unknown as [{ id: string; email: string; password_hash: string | null } | undefined]
  if (!row || !row.password_hash) return null
  return fingerprintMatches(want, playerCredentialFingerprint(row.id, row.password_hash)) ? row : null
}
