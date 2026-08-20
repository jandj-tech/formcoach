import type { NextRequest } from 'next/server'

/**
 * Where the buyer is, and what to bill them in.
 *
 * Canada is billed in CAD. Everywhere else — the United States and the rest of
 * the world — is billed in USD.
 *
 * The country comes from Vercel's edge geolocation header, never from the
 * request body. Currency used to be whatever the client said it was: the
 * dashboard fetched /api/region and posted it back, the results paywall never
 * did and silently defaulted to 'US', so one person could be quoted CAD on one
 * page and USD on another for the same token. It also meant anyone could pick
 * their own currency by editing one field, and since a price is the same
 * NUMBER in both, picking CAD was a real discount.
 *
 * Physical orders are the deliberate exception: `app/api/checkout/route.ts`
 * keeps taking the region from the cart, because there the currency should
 * follow the address the ball is being shipped to, which the buyer chooses
 * and which is not necessarily where they are sitting.
 */
export type Region = 'CA' | 'US'
export type Currency = 'cad' | 'usd'

/**
 * Headers that carry the caller's country, in the order they are trusted.
 *
 * Only the platform sets these — a client cannot, because the edge overwrites
 * whatever arrived. Listing several is what keeps currency correct across a
 * host move: on Vercel only the first exists, behind Cloudflare only the
 * second, and Render/Fly/Netlify use the third or fourth. Without this,
 * leaving Vercel silently bills every Canadian in USD, because the lookup
 * fails closed to 'US' and nothing errors.
 */
const COUNTRY_HEADERS = [
  'x-vercel-ip-country', // Vercel
  'cf-ipcountry', // Cloudflare (incl. R2/Workers in front of any origin)
  'x-nf-client-connection-country', // Netlify
  'fly-client-country', // Fly.io
  'x-geo-country', // common reverse-proxy convention
  'x-country-code',
] as const

/** The buyer's country, from whichever platform header is present. Non-Canada reads as US. */
export function regionFromRequest(req: NextRequest): Region {
  for (const h of COUNTRY_HEADERS) {
    const v = req.headers.get(h)
    if (v && v.trim().toUpperCase() === 'CA') return 'CA'
    // A present-but-different header is an answer: this caller is not in Canada.
    if (v && v.trim()) return 'US'
  }
  return 'US'
}

/** The Stripe currency for a region. */
export function currencyForRegion(region: Region): Currency {
  return region === 'CA' ? 'cad' : 'usd'
}

/** The Stripe currency to bill this request in. */
export function currencyForRequest(req: NextRequest): Currency {
  return currencyForRegion(regionFromRequest(req))
}
