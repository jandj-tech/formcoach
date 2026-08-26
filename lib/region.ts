import type { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Reader } from 'maxmind'

/**
 * Where the buyer is, and what to bill them in.
 *
 * Canada is billed in CAD. Everywhere else — the United States and the rest of
 * the world — is billed in USD. A price is the same NUMBER in both ($1.49 USD ↔
 * $1.49 CAD), so this only chooses the currency label Stripe charges in.
 *
 * Country is resolved in two steps, best signal first:
 *   1. A platform geolocation header, if the host sets one (Vercel, Cloudflare,
 *      Netlify, Fly…). None of these exist on the cPanel/Apache box, but the
 *      list is kept so that putting a CDN in front later "just works" and a real
 *      edge signal always wins.
 *   2. Otherwise, an OFFLINE lookup of the caller's IP against a bundled CC0
 *      IP-to-country database — no network call, no API key. This is what keeps
 *      Canadians on CAD after the move off Vercel, where step 1 used to answer.
 *
 * It never trusts a currency sent in the request body: currency used to be
 * whatever the client said, so one person could be quoted CAD on one page and
 * USD on another, and anyone could pick the cheaper currency by editing a field.
 *
 * Physical orders are the deliberate exception: `app/api/checkout/route.ts`
 * keeps taking the region from the cart, because there the currency should
 * follow the shipping address, not where the buyer happens to be sitting.
 */
export type Region = 'CA' | 'US'
export type Currency = 'cad' | 'usd'

/**
 * Headers that carry the caller's country, in the order they are trusted. Only
 * the platform sets these — a client cannot, because the edge overwrites
 * whatever arrived. Present-but-absent on the cPanel box, which is why the IP
 * fallback below exists.
 */
const COUNTRY_HEADERS = [
  'x-vercel-ip-country', // Vercel
  'cf-ipcountry', // Cloudflare (incl. any CDN put in front of the origin later)
  'x-nf-client-connection-country', // Netlify
  'fly-client-country', // Fly.io
  'x-geo-country', // common reverse-proxy convention
  'x-country-code',
] as const

/**
 * The only thing the detection below needs from a request is the ability to
 * read a header. Widening the parameter to this lets a Server Component —
 * which gets a ReadonlyHeaders from next/headers, never a NextRequest —
 * reuse exactly this logic instead of a second copy that would drift out of
 * sync. NextRequest already satisfies the shape, so no caller changes.
 */
type HeaderSource = { headers: { get(name: string): string | null } }

/** Country from a trusted platform header, or null if the host sets none. */
function regionFromHeaders(req: HeaderSource): Region | null {
  for (const h of COUNTRY_HEADERS) {
    const v = req.headers.get(h)
    if (v && v.trim()) return v.trim().toUpperCase() === 'CA' ? 'CA' : 'US'
  }
  return null
}

// --- offline IP → country -------------------------------------------------

type CountryRecord = { country_code?: string }

// The reader is built once from the bundled DB and cached. `undefined` = not
// tried yet; `null` = tried and unavailable (every lookup then falls back to
// US, so a missing DB degrades to the pre-existing behaviour, never an error).
let reader: InstanceType<typeof Reader> | null | undefined

function getReader(): InstanceType<typeof Reader> | null {
  if (reader !== undefined) return reader
  const candidates = [
    // `next start` (cwd = repo root), or a tracer-copied file under standalone.
    path.join(process.cwd(), 'lib/geo/country.mmdb'),
    // The standalone server.js does chdir(__dirname) into .next/standalone, so
    // reach the committed repo file two levels up — the whole git checkout is
    // present on the cPanel box alongside the build.
    path.join(process.cwd(), '..', '..', 'lib/geo/country.mmdb'),
    path.join(process.cwd(), '.next/standalone/lib/geo/country.mmdb'),
  ]
  // __dirname is present in the compiled server bundle; guard in case it isn't.
  try {
    if (typeof __dirname === 'string') {
      candidates.push(path.join(__dirname, 'geo/country.mmdb'))
      candidates.push(path.join(__dirname, 'country.mmdb'))
    }
  } catch {
    /* no __dirname in this runtime */
  }
  for (const p of candidates) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
        reader = new Reader(fs.readFileSync(/*turbopackIgnore: true*/ p))
        return reader
      }
    } catch {
      // try the next candidate path
    }
  }
  reader = null
  return reader
}

const PRIVATE_IP = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|f[cd])/i

/** Strip brackets and, for IPv4, a trailing :port so maxmind gets a bare IP. */
function cleanIp(raw: string): string {
  let ip = raw.trim().replace(/^\[|\]$/g, '')
  // IPv4 with a port ("1.2.3.4:56789") — but never an IPv6 address.
  if (ip.includes('.') && !ip.includes('::') && ip.split(':').length === 2) {
    ip = ip.split(':')[0]
  }
  return ip
}

/**
 * The caller's public IP. Takes the first PUBLIC address in X-Forwarded-For —
 * the original client — skipping private hops the reverse proxy may append
 * (e.g. a localhost Apache→app hop). Falls back to X-Real-IP.
 */
function clientIp(req: HeaderSource): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => cleanIp(s)).filter(Boolean)
    const publicIp = parts.find((p) => !PRIVATE_IP.test(p))
    if (publicIp) return publicIp
    if (parts.length) return parts[0]
  }
  const real = req.headers.get('x-real-ip')
  return real ? cleanIp(real) : null
}

/** Country from the caller's IP, via the offline DB. Unknown/missing → US. */
function regionFromIp(req: HeaderSource): Region {
  try {
    const ip = clientIp(req)
    if (!ip) return 'US'
    const rec = getReader()?.get(ip) as CountryRecord | null | undefined
    return rec?.country_code?.toUpperCase() === 'CA' ? 'CA' : 'US'
  } catch {
    return 'US'
  }
}

/** The buyer's country: trusted header first, then IP geolocation, else US. */
export function regionFromRequest(req: NextRequest): Region {
  return regionFromHeaders(req) ?? regionFromIp(req)
}

/**
 * The buyer's country inside a Server Component, which never sees a
 * NextRequest. Same two-step detection as regionFromRequest — platform header
 * first, then the offline IP lookup — so a page and an API route resolve the
 * same visitor to the same country.
 *
 * next/headers is imported dynamically so it stays out of the module graph of
 * the API routes that import this file for currency only.
 */
export async function regionFromServerHeaders(): Promise<Region> {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    return regionFromRequest({ headers: { get: (n: string) => h.get(n) } } as NextRequest)
  } catch {
    return 'US'
  }
}

/** The Stripe currency for a region. */
export function currencyForRegion(region: Region): Currency {
  return region === 'CA' ? 'cad' : 'usd'
}

/** The Stripe currency to bill this request in. */
export function currencyForRequest(req: NextRequest): Currency {
  return currencyForRegion(regionFromRequest(req))
}
