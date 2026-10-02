import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { BCRYPT_COST } from './password'
import { sendOrgAdminInviteEmail } from './email'
import type { OrgSessionPayload } from './org-auth'

/**
 * Additional admin logins for an organization (scripts/migrate-org-admins.sql).
 *
 * Roles:
 *   owner — the organizations row itself (admin_email + password_hash). The
 *           account that created the org. Only it can remove admins.
 *   admin — a linked org_admins row. Once accepted it acts as the
 *           organization everywhere: every team, tokens, results, settings.
 *
 * Where the org identity is checked by EMAIL + password hash (session
 * fingerprints in lib/org-auth.ts and lib/team-auth.ts, password resets), a
 * linked admin resolves to its own row — never to the owner's credential.
 * Every query here tolerates the table not existing yet (pre-migration) by
 * returning "no admins".
 */

export type OrgRole = 'owner' | 'admin'

export interface OrgCredential {
  orgId: string
  /** The address as stored. */
  email: string
  hash: string | null
  role: OrgRole
}

export interface OrgAdminRow {
  id: string
  email: string
  name: string | null
  accepted: boolean
  inviteSentAt: Date | null
  createdAt: Date
}

const norm = (e: string) => e.toLowerCase().trim()

function missingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .*org_admins.* does not exist/i.test(msg)
}

/** The credential (owner or accepted admin) that `email` holds on `orgId`, or null. */
export async function orgCredential(orgId: string, email: string): Promise<OrgCredential | null> {
  const e = norm(email)
  if (!orgId || !e) return null
  const [owner] = (await db`
    SELECT admin_email, password_hash FROM organizations WHERE id = ${orgId} AND LOWER(admin_email) = ${e}
  `) as unknown as [{ admin_email: string; password_hash: string | null } | undefined]
  if (owner) return { orgId, email: owner.admin_email, hash: owner.password_hash, role: 'owner' }
  try {
    const [admin] = (await db`
      SELECT email, password_hash FROM org_admins
      WHERE org_id = ${orgId} AND LOWER(email) = ${e} AND accepted_at IS NOT NULL AND password_hash IS NOT NULL
    `) as unknown as [{ email: string; password_hash: string } | undefined]
    return admin ? { orgId, email: admin.email, hash: admin.password_hash, role: 'admin' } : null
  } catch (err) {
    if (missingTable(err)) return null
    throw err
  }
}

/** The role the session's email holds on its org right now (null = no longer an admin). */
export async function orgRoleOf(session: OrgSessionPayload): Promise<OrgRole | null> {
  const c = await orgCredential(session.orgId, session.adminEmail)
  return c?.role ?? null
}

/**
 * Login lookup: the org this email signs in to with `password`. The owner
 * row is checked first (same order as before), then an accepted admin row.
 */
export async function orgLoginForEmail(email: string, password: string): Promise<OrgCredential | null> {
  const e = norm(email)
  if (!e) return null
  const [owner] = (await db`
    SELECT id, admin_email, password_hash FROM organizations WHERE admin_email = ${e}
  `) as unknown as [{ id: string; admin_email: string; password_hash: string | null } | undefined]
  if (owner?.password_hash && (await bcrypt.compare(password, owner.password_hash))) {
    return { orgId: owner.id, email: owner.admin_email, hash: owner.password_hash, role: 'owner' }
  }
  try {
    const [admin] = (await db`
      SELECT org_id, email, password_hash FROM org_admins
      WHERE LOWER(email) = ${e} AND accepted_at IS NOT NULL AND password_hash IS NOT NULL
    `) as unknown as [{ org_id: string; email: string; password_hash: string } | undefined]
    if (admin && (await bcrypt.compare(password, admin.password_hash))) {
      return { orgId: admin.org_id, email: admin.email, hash: admin.password_hash, role: 'admin' }
    }
  } catch (err) {
    if (!missingTable(err)) throw err
  }
  return null
}

/** True when `email` is a linked (accepted or pending) admin anywhere. */
export async function isLinkedOrgAdminEmail(email: string): Promise<boolean> {
  const e = norm(email)
  if (!e) return false
  try {
    const [row] = (await db`SELECT 1 FROM org_admins WHERE LOWER(email) = ${e} LIMIT 1`) as unknown as [unknown | undefined]
    return !!row
  } catch (err) {
    if (missingTable(err)) return false
    throw err
  }
}

export async function listOrgAdmins(orgId: string): Promise<OrgAdminRow[]> {
  try {
    const rows = (await db`
      SELECT id, email, name, accepted_at, invite_sent_at, created_at FROM org_admins
      WHERE org_id = ${orgId} ORDER BY created_at ASC
    `) as unknown as Array<{ id: string; email: string; name: string | null; accepted_at: Date | null; invite_sent_at: Date | null; created_at: Date }>
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      accepted: !!r.accepted_at,
      inviteSentAt: r.invite_sent_at,
      createdAt: r.created_at,
    }))
  } catch (err) {
    if (missingTable(err)) return []
    throw err
  }
}

export class OrgAdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/**
 * Links `email` as an admin of `orgId` and emails the setup link. A pending
 * row for the same org gets a fresh token and a new email (resend). The
 * address must not already be an organization owner or a linked admin of
 * another org — one email signs in to one organization. A coach's address is
 * fine: coach and admin are separate logins with separate passwords.
 */
export async function inviteOrgAdmin(input: {
  orgId: string
  email: string
  name?: string | null
  invitedBy: string
}): Promise<{ id: string; resent: boolean; emailed: boolean }> {
  const e = norm(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new OrgAdminError('Enter a valid email address.')

  const [org] = (await db`
    SELECT name, admin_email FROM organizations WHERE id = ${input.orgId}
  `) as unknown as [{ name: string; admin_email: string } | undefined]
  if (!org) throw new OrgAdminError('Organization not found', 404)
  if (norm(org.admin_email) === e) throw new OrgAdminError('That is already the organization owner’s login.', 409)

  const [otherOrg] = (await db`SELECT 1 FROM organizations WHERE LOWER(admin_email) = ${e}`) as unknown as [unknown | undefined]
  if (otherOrg) throw new OrgAdminError('That email already runs another organization on LearnHoops.', 409)

  const [existing] = (await db`
    SELECT id, org_id, accepted_at FROM org_admins WHERE LOWER(email) = ${e}
  `) as unknown as [{ id: string; org_id: string; accepted_at: Date | null } | undefined]
  if (existing && existing.org_id !== input.orgId) {
    throw new OrgAdminError('That email is already an admin of another organization.', 409)
  }
  if (existing?.accepted_at) throw new OrgAdminError('That email is already an admin of your organization.', 409)

  const token = crypto.randomBytes(32).toString('hex')
  let id: string
  if (existing) {
    await db`
      UPDATE org_admins SET invite_token = ${token}, invite_sent_at = NOW(), name = COALESCE(${input.name ?? null}, name)
      WHERE id = ${existing.id}
    `
    id = existing.id
  } else {
    const [row] = (await db`
      INSERT INTO org_admins (org_id, email, name, invite_token, invite_sent_at, invited_by)
      VALUES (${input.orgId}, ${e}, ${input.name ?? null}, ${token}, NOW(), ${input.invitedBy})
      RETURNING id
    `) as unknown as [{ id: string }]
    id = row.id
  }

  let emailed = true
  try {
    await sendOrgAdminInviteEmail(e, org.name, token)
  } catch (err) {
    console.error('[org-admins] invite email failed:', err instanceof Error ? err.message : err)
    emailed = false
  }
  return { id, resent: !!existing, emailed }
}

/** Read-only: is this admin invite link still unused? Nothing is consumed or rotated. */
export async function orgAdminInviteValid(token: string): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) return false
  const rows = (await db`SELECT 1 FROM org_admins WHERE invite_token = ${token} LIMIT 1`) as unknown as unknown[]
  return rows.length > 0
}

/**
 * Accepts an invite: sets the password on the invited row and records inbox
 * proof (the link only ever went to that inbox). Returns the credential to
 * sign the session with.
 */
export async function acceptOrgAdminInvite(token: string, password: string): Promise<OrgCredential | null> {
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) return null
  const [row] = (await db`
    SELECT id, org_id, email FROM org_admins WHERE invite_token = ${token}
  `) as unknown as [{ id: string; org_id: string; email: string } | undefined]
  if (!row) return null
  const hash = await bcrypt.hash(password, BCRYPT_COST)
  await db`
    UPDATE org_admins
    SET password_hash = ${hash}, accepted_at = COALESCE(accepted_at, NOW()), invite_token = NULL,
        email_proven_at = NOW(), email_proven_hash = ${hash}
    WHERE id = ${row.id}
  `
  return { orgId: row.org_id, email: row.email, hash, role: 'admin' }
}

/** Removes a linked admin. Their sessions end at once (verifyOrgSession re-reads the row). */
export async function removeOrgAdmin(orgId: string, adminId: string): Promise<boolean> {
  const rows = (await db`
    DELETE FROM org_admins WHERE id = ${adminId} AND org_id = ${orgId} RETURNING id
  `) as unknown as unknown[]
  return rows.length > 0
}
