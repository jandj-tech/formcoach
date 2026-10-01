// Where to send someone after they sign in or finish setup, when the target
// came from a URL (attacker-controlled). Only a path on this site is allowed:
// never another origin, never a protocol-relative "//host" or the "/\host"
// form some browsers treat the same way, never control characters. Anything
// else falls back. Client-safe (no server imports).

const MAX_LEN = 512

export function safeLocalPath(next: unknown, fallback: string | null = null): string | null {
  if (typeof next !== 'string') return fallback
  const p = next.trim()
  if (!p || p.length > MAX_LEN) return fallback
  if (!p.startsWith('/') || p.startsWith('//')) return fallback
  // Backslashes ("/\evil.com") and any control / whitespace character (a
  // smuggled "\t" or newline is stripped by URL parsers and can rebuild "//").
  if (/[\\\u0000-\u0020\u007f]/.test(p)) return fallback
  try {
    // Resolve against a throwaway origin: if it lands anywhere else, refuse.
    const u = new URL(p, 'https://same.invalid')
    if (u.origin !== 'https://same.invalid') return fallback
    const out = `${u.pathname}${u.search}${u.hash}`
    // Dot segments can normalise "/..//evil.com" into "//evil.com": check again.
    if (!out.startsWith('/') || out.startsWith('//')) return fallback
    return out
  } catch {
    return fallback
  }
}
