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

/** The buyer's country, as Vercel resolved it. Anything but Canada reads as US. */
export function regionFromRequest(req: NextRequest): Region {
  return req.headers.get('x-vercel-ip-country') === 'CA' ? 'CA' : 'US'
}

/** The Stripe currency for a region. */
export function currencyForRegion(region: Region): Currency {
  return region === 'CA' ? 'cad' : 'usd'
}

/** The Stripe currency to bill this request in. */
export function currencyForRequest(req: NextRequest): Currency {
  return currencyForRegion(regionFromRequest(req))
}
