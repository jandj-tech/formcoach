/**
 * Required-secret access, resolved lazily and never defaulted.
 *
 * Every one of these used to be read as `process.env.X || '<hardcoded>'` or
 * guarded by `if (secret) { check }`. Both shapes fail OPEN: a missing variable
 * silently downgraded the app to a publicly-known signing key, or skipped a
 * webhook's authentication entirely. This repo is public, so the fallback
 * string was readable by anyone.
 *
 * Reads are lazy (inside a function, not at module scope) so a missing variable
 * fails the request that needs it rather than the whole build, and cached so a
 * hot path does not re-validate on every call.
 */

const cache = new Map<string, string>()

/** Throws unless the variable is set to a non-empty value. */
export function requireEnv(name: string): string {
  const hit = cache.get(name)
  if (hit !== undefined) return hit

  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(
      `${name} is not set. Refusing to serve this request — a missing secret must ` +
        `never fall back to a default or skip an authentication check.`
    )
  }

  cache.set(name, value)
  return value
}

let jwtKey: Uint8Array | undefined

/** HMAC key for every session cookie (player, team, org, admin). */
export function jwtSecret(): Uint8Array {
  if (!jwtKey) jwtKey = new TextEncoder().encode(requireEnv('JWT_SECRET'))
  return jwtKey
}

/**
 * Constant-time string comparison. Plain `!==` on a secret leaks its length and
 * a timing signal on the matching prefix; irrelevant over the open internet in
 * most cases, but free to do correctly.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
