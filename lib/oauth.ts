/**
 * Google and Apple sign-in, built on the session system this app already has.
 *
 * There is no auth library here on purpose. Every account type (player, coach,
 * organization, admin) is already a `jose`-signed JWT in its own cookie, and a
 * drop-in framework would have wanted to own that. What a provider gives us is
 * a verified identity; turning one into a session is fifteen lines of code we
 * already wrote. So this module does exactly one job — hand back a trustworthy
 * {provider, subject, email} — and lib/oauth-account.ts decides who that is.
 *
 * Both providers are used in the authorization-code flow with a signed `state`
 * and a `nonce` bound into the ID token.
 */

import { SignJWT, jwtVerify, createRemoteJWKSet, importPKCS8, type JWTPayload } from 'jose'
import { requireEnv, jwtSecret } from '@/lib/env'
import { resolveBaseUrl } from '@/lib/base-url'

export type OAuthProvider = 'google' | 'apple'

/**
 * Short-lived companion to the signed `state`, set by the start route and
 * checked by the callback. Lives here, not in a route module: Next forbids
 * a route.ts from exporting anything but its handlers, and the webpack build
 * fails type-checking on the extra export (Turbopack lets it slide).
 */
export const OAUTH_STATE_COOKIE = 'fc_oauth_state'

export function isOAuthProvider(v: string): v is OAuthProvider {
  return v === 'google' || v === 'apple'
}

/** Verified identity handed back by a provider. */
export interface OAuthProfile {
  provider: OAuthProvider
  /** The provider's stable id for this person. Never reused, never changes. */
  subject: string
  email: string | null
  emailVerified: boolean
  name: string | null
  /** Apple only — stored so account deletion can revoke the grant. */
  refreshToken?: string | null
}

/**
 * Site origin, no trailing slash. Must match the console redirect URIs exactly.
 *
 * Read through resolveBaseUrl rather than straight from NEXT_PUBLIC_BASE_URL:
 * the cPanel box still carries the retired `formcoach-psi.vercel.app` value from
 * the original `vercel env pull`, and a redirect_uri built from that is rejected
 * outright by both Google and Apple. The resolver refuses stale origins and
 * falls back to the live site instead.
 */
export function baseUrl(): string {
  return resolveBaseUrl().replace(/\/+$/, '')
}

export function callbackUrl(provider: OAuthProvider): string {
  return `${baseUrl()}/api/auth/oauth/${provider}/callback`
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

/** Where the finished sign-in should land. */
export type OAuthMode = 'web' | 'mobile'

export interface OAuthState {
  nonce: string
  mode: OAuthMode
  next: string
  provider: OAuthProvider
  /**
   * Signup context the provider knows nothing about but that the account is
   * worthless without: free analyses bought with a ball, a coach's invite, a
   * team code typed on the signup form. A redirect to Google drops every one of
   * them unless they ride along in the state and are re-applied on the way back.
   */
  claimToken?: string
  teamInvite?: string
  teamCode?: string
}

const STATE_TTL = '10m'

/**
 * `state` is a signed JWT rather than an opaque value in a cookie.
 *
 * Apple posts its callback from appleid.apple.com as a cross-site form POST,
 * and a cookie strict enough to be worth setting would not be sent with it.
 * Signing the state carries the nonce and the return target through the round
 * trip without depending on the cookie surviving. A matching cookie is set as
 * well and checked when present (see the callback route) — belt and braces on
 * the Google path, which does keep it.
 */
export async function signState(state: OAuthState): Promise<string> {
  return new SignJWT(state as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject('oauth-state')
    .setExpirationTime(STATE_TTL)
    .sign(jwtSecret())
}

export async function verifyState(token: string): Promise<OAuthState | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { subject: 'oauth-state' })
    const s = payload as unknown as OAuthState
    if (!s.nonce || !s.provider) return null
    return s
  } catch {
    return null
  }
}

/**
 * `next` comes from a query string, so it is attacker-controlled. Only same-site
 * paths are allowed through — otherwise the sign-in flow becomes an open
 * redirect that launders our domain's reputation.
 */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback
  if (!next.startsWith('/') || next.startsWith('//')) return fallback
  return next
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export function googleClientId(): string {
  return requireEnv('GOOGLE_OAUTH_CLIENT_ID')
}

export function googleAuthUrl(opts: { state: string; nonce: string; loginHint?: string }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', googleClientId())
  url.searchParams.set('redirect_uri', callbackUrl('google'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', opts.state)
  url.searchParams.set('nonce', opts.nonce)
  // Always show the chooser. Without this a shared device silently signs in as
  // whoever used it last, which on a team's tablet is the wrong player.
  url.searchParams.set('prompt', 'select_account')
  if (opts.loginHint) url.searchParams.set('login_hint', opts.loginHint)
  return url.toString()
}

async function googleExchange(code: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
      redirect_uri: callbackUrl('google'),
      grant_type: 'authorization_code',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string; error?: string }
  if (!res.ok || !data.id_token) {
    throw new Error(`Google token exchange failed: ${data.error_description ?? data.error ?? res.status}`)
  }
  return data.id_token
}

/** Verifies a Google ID token's signature, issuer, audience and nonce. */
export async function verifyGoogleIdToken(idToken: string, expectedNonce?: string): Promise<OAuthProfile> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: GOOGLE_ISSUERS,
    audience: googleClientId(),
  })
  assertNonce(payload, expectedNonce)

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null
  return {
    provider: 'google',
    subject: String(payload.sub),
    email,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: typeof payload.name === 'string' ? payload.name : null,
  }
}

export async function googleProfileFromCode(code: string, nonce: string): Promise<OAuthProfile> {
  return verifyGoogleIdToken(await googleExchange(code), nonce)
}

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

/**
 * The web flow and the iOS app are two different Apple clients: the site
 * authenticates as a Services ID, the app as its bundle identifier. An ID token
 * is only valid for the client that asked for it, so the audience has to follow
 * whichever one started the flow.
 */
export function appleWebClientId(): string {
  return requireEnv('APPLE_SERVICES_ID')
}

export function appleAppClientId(): string {
  return process.env.APPLE_APP_BUNDLE_ID?.trim() || 'com.learnhoops.app'
}

/**
 * Apple has no static client secret: it is an ES256 JWT signed with the .p8
 * key from the developer portal, valid for at most six months. Minting one per
 * request costs nothing and removes a credential that would otherwise silently
 * expire twice a year.
 */
async function appleClientSecret(clientId: string): Promise<string> {
  const pkcs8 = requireEnv('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n')
  const key = await importPKCS8(pkcs8, 'ES256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: requireEnv('APPLE_KEY_ID') })
    .setIssuer(requireEnv('APPLE_TEAM_ID'))
    .setIssuedAt()
    .setExpirationTime('10m')
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .sign(key)
}

export function appleAuthUrl(opts: { state: string; nonce: string }): string {
  const url = new URL('https://appleid.apple.com/auth/authorize')
  url.searchParams.set('client_id', appleWebClientId())
  url.searchParams.set('redirect_uri', callbackUrl('apple'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'name email')
  // Requesting any scope forces form_post; Apple rejects the request otherwise.
  url.searchParams.set('response_mode', 'form_post')
  url.searchParams.set('state', opts.state)
  url.searchParams.set('nonce', opts.nonce)
  return url.toString()
}

interface AppleTokenResponse {
  id_token?: string
  refresh_token?: string
  error?: string
  error_description?: string
}

async function appleExchange(code: string, clientId: string): Promise<AppleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: await appleClientSecret(clientId),
    grant_type: 'authorization_code',
  })
  // Apple validates redirect_uri only for the web client — the native app never
  // had one, and sending an empty value fails the request.
  if (clientId === appleWebClientId()) body.set('redirect_uri', callbackUrl('apple'))

  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await res.json().catch(() => ({}))) as AppleTokenResponse
  if (!res.ok || !data.id_token) {
    throw new Error(`Apple token exchange failed: ${data.error_description ?? data.error ?? res.status}`)
  }
  return data
}

export async function verifyAppleIdToken(
  idToken: string,
  opts: { audience: string; nonce?: string }
): Promise<OAuthProfile> {
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: opts.audience,
  })
  assertNonce(payload, opts.nonce)

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null
  return {
    provider: 'apple',
    subject: String(payload.sub),
    email,
    // Apple sends this as the string "true" more often than the boolean.
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: null,
  }
}

export async function appleProfileFromCode(
  code: string,
  opts: { nonce?: string; clientId?: string }
): Promise<OAuthProfile> {
  const clientId = opts.clientId ?? appleWebClientId()
  const tokens = await appleExchange(code, clientId)
  const profile = await verifyAppleIdToken(tokens.id_token!, { audience: clientId, nonce: opts.nonce })
  return { ...profile, refreshToken: tokens.refresh_token ?? null }
}

/**
 * Revokes a Sign in with Apple grant. App Review requires this when an account
 * that used Apple sign-in is deleted — without it, Apple still lists us under
 * the user's "Apps Using Apple ID" after their account is gone.
 */
export async function appleRevoke(refreshToken: string, clientId: string): Promise<void> {
  await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await appleClientSecret(clientId),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
  })
}

// ---------------------------------------------------------------------------

/**
 * The nonce is what stops an ID token minted for some other site from being
 * replayed at ours, so a missing one is a failure and never a shrug.
 */
function assertNonce(payload: JWTPayload, expected?: string) {
  if (!expected) return
  if (payload.nonce !== expected) throw new Error('OAuth nonce mismatch')
}
