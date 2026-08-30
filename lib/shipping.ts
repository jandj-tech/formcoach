import 'server-only'
import { getUsdToCadRate } from '@/lib/fx'

// Address-based shipping quotes with zero external dependencies: prices come
// from built-in zone tables calibrated against published Canada Post and
// USPS retail rate charts (2026). Canadian orders ship from the Vaughan, ON
// warehouse via Canada Post; US orders from Las Vegas, NV via USPS — every
// order is domestic, and the zone is derived from the buyer's postal code
// (Canada) or state (US). No external rate API is called; nothing costs money.

export type ShippingAddress = {
  name?: string
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country: string
}

export type ShippingOptionQuote = {
  displayName: string
  amountCents: number
  currency: 'usd' | 'cad'
  carrier: string
  service: string
  estDaysMin?: number
  estDaysMax?: number
  source: 'table'
}

// ---------------------------------------------------------------------------
// Built-in zone tables (primary rate source)
// ---------------------------------------------------------------------------

// Delivery estimates shown to buyers = carrier transit time + handling.
// Handling covers the gap between the order landing and the parcel actually
// reaching the post office (packing, drop-off runs). Tune to the real
// drop-off cadence at each warehouse.
const HANDLING_DAYS_MIN = 1
const HANDLING_DAYS_MAX = 2

// Express service (Xpresspost / Priority Mail) moves by air, so transit is
// fairly flat nationwide regardless of ground zone.
const EXPRESS_TRANSIT_MIN = 1
const EXPRESS_TRANSIT_MAX = 3

// Canada, from Vaughan, ON. Zoned by the first letter of the postal code
// (the FSA letter maps cleanly to a region — finer than province for
// Ontario, where Toronto and Thunder Bay price very differently).
// Amounts are CAD cents for one ball (box bills at ~3.1 kg volumetric),
// calibrated against Canada Post Regular Parcel retail prices.
// daysMin/daysMax are carrier TRANSIT days; handling is added at quote time.
type Zone = { cents: number; daysMin: number; daysMax: number }
const CA_ZONES: Record<string, Zone> = {
  // GTA / Golden Horseshoe
  L: { cents: 1395, daysMin: 1, daysMax: 3 },
  M: { cents: 1395, daysMin: 1, daysMax: 3 },
  // Rest of southern/eastern Ontario
  K: { cents: 1695, daysMin: 2, daysMax: 4 },
  N: { cents: 1695, daysMin: 2, daysMax: 4 },
  // Northern Ontario
  P: { cents: 1895, daysMin: 3, daysMax: 6 },
  // Quebec
  G: { cents: 1895, daysMin: 2, daysMax: 5 },
  H: { cents: 1795, daysMin: 2, daysMax: 4 },
  J: { cents: 1795, daysMin: 2, daysMax: 5 },
  // Prairies
  R: { cents: 2195, daysMin: 4, daysMax: 7 },
  S: { cents: 2195, daysMin: 4, daysMax: 7 },
  T: { cents: 2195, daysMin: 4, daysMax: 7 },
  // British Columbia
  V: { cents: 2395, daysMin: 4, daysMax: 8 },
  // Maritimes
  E: { cents: 2195, daysMin: 3, daysMax: 6 },
  B: { cents: 2195, daysMin: 3, daysMax: 6 },
  C: { cents: 2195, daysMin: 3, daysMax: 6 },
  // Newfoundland
  A: { cents: 2595, daysMin: 5, daysMax: 9 },
  // Territories — ground service this remote genuinely takes weeks
  X: { cents: 3495, daysMin: 7, daysMax: 14 },
  Y: { cents: 3495, daysMin: 7, daysMax: 14 },
}
// Province fallback when the postal code is missing/unparseable.
const CA_PROVINCE_TO_LETTER: Record<string, string> = {
  ON: 'L', QC: 'H', MB: 'R', SK: 'S', AB: 'T', BC: 'V',
  NB: 'E', NS: 'B', PE: 'C', NL: 'A', YT: 'Y', NT: 'X', NU: 'X',
}

// US, from Las Vegas, NV. Zoned by state (USPS zones 1–8 approximated by
// distance from 89xxx). USD cents for one ball (box bills at ~3 lb),
// calibrated against USPS Ground Advantage retail prices.
const US_ZONE_NEAR: Zone = { cents: 1195, daysMin: 2, daysMax: 4 }       // ~zones 1-4
const US_ZONE_MOUNTAIN: Zone = { cents: 1395, daysMin: 2, daysMax: 4 }   // ~zones 4-5
const US_ZONE_CENTRAL: Zone = { cents: 1595, daysMin: 3, daysMax: 5 }    // ~zones 5-6
const US_ZONE_EAST: Zone = { cents: 1995, daysMin: 3, daysMax: 5 }       // ~zones 7-8
const US_ZONE_REMOTE: Zone = { cents: 2495, daysMin: 4, daysMax: 8 }     // AK/HI
const US_STATE_ZONES: Record<string, Zone> = {
  NV: US_ZONE_NEAR, AZ: US_ZONE_NEAR, UT: US_ZONE_NEAR, CA: US_ZONE_NEAR,
  OR: US_ZONE_MOUNTAIN, WA: US_ZONE_MOUNTAIN, ID: US_ZONE_MOUNTAIN,
  MT: US_ZONE_MOUNTAIN, WY: US_ZONE_MOUNTAIN, CO: US_ZONE_MOUNTAIN, NM: US_ZONE_MOUNTAIN,
  ND: US_ZONE_CENTRAL, SD: US_ZONE_CENTRAL, NE: US_ZONE_CENTRAL, KS: US_ZONE_CENTRAL,
  OK: US_ZONE_CENTRAL, TX: US_ZONE_CENTRAL, MN: US_ZONE_CENTRAL, IA: US_ZONE_CENTRAL,
  MO: US_ZONE_CENTRAL, AR: US_ZONE_CENTRAL, LA: US_ZONE_CENTRAL, WI: US_ZONE_CENTRAL,
  IL: US_ZONE_CENTRAL, MS: US_ZONE_CENTRAL,
  AK: US_ZONE_REMOTE, HI: US_ZONE_REMOTE,
}

// Bigger boxes bill at higher volumetric weight, but not linearly per ball.
// Derived from the 3 lb vs 10-12 lb (and 3.1 kg vs 6.25 kg) rate steps.
function countMultiplier(ballCount: number): number {
  if (ballCount <= 1) return 1
  if (ballCount === 2) return 1.7
  if (ballCount <= 4) return 2.4
  return 3
}

// Expedited (Xpresspost / Priority Mail Express-ish) relative to ground.
const EXPRESS_MULTIPLIER = 1.65

function zoneFor(to: ShippingAddress): Zone {
  if (to.country === 'CA') {
    const letter =
      to.postalCode?.trim().charAt(0).toUpperCase() ||
      CA_PROVINCE_TO_LETTER[(to.state || '').toUpperCase()] ||
      'V' // unknown → price like BC rather than undercharging
    return CA_ZONES[letter] ?? CA_ZONES[CA_PROVINCE_TO_LETTER[(to.state || '').toUpperCase()] ?? 'V'] ?? CA_ZONES.V
  }
  return US_STATE_ZONES[(to.state || '').toUpperCase()] ?? US_ZONE_EAST
}

async function tableQuotes(
  to: ShippingAddress,
  ballCount: number,
  sessionCurrency: 'usd' | 'cad'
): Promise<ShippingOptionQuote[]> {
  const zone = zoneFor(to)
  const localCurrency: 'usd' | 'cad' = to.country === 'CA' ? 'cad' : 'usd'
  const carrier = to.country === 'CA' ? 'canada_post' : 'usps'
  const carrierLabel = to.country === 'CA' ? 'Canada Post' : 'USPS'
  const standardLocal = Math.round(zone.cents * countMultiplier(ballCount))
  const expressLocal = Math.round(standardLocal * EXPRESS_MULTIPLIER)

  const [standard, express] = await Promise.all([
    convertToCurrency(standardLocal, localCurrency, sessionCurrency).catch(() => standardLocal),
    convertToCurrency(expressLocal, localCurrency, sessionCurrency).catch(() => expressLocal),
  ])

  return [
    {
      displayName: `${carrierLabel} Standard`,
      amountCents: standard,
      currency: sessionCurrency,
      carrier,
      service: 'standard',
      estDaysMin: zone.daysMin + HANDLING_DAYS_MIN,
      estDaysMax: zone.daysMax + HANDLING_DAYS_MAX,
      source: 'table',
    },
    {
      displayName: `${carrierLabel} Express`,
      amountCents: express,
      currency: sessionCurrency,
      carrier,
      service: 'express',
      estDaysMin: EXPRESS_TRANSIT_MIN + HANDLING_DAYS_MIN,
      estDaysMax: EXPRESS_TRANSIT_MAX + HANDLING_DAYS_MAX,
      source: 'table',
    },
  ]
}

async function convertToCurrency(
  amountCents: number,
  from: string,
  to: 'usd' | 'cad'
): Promise<number> {
  const f = from.toLowerCase()
  if (f === to) return amountCents
  const rate = await getUsdToCadRate()
  if (f === 'usd' && to === 'cad') return Math.round(amountCents * rate)
  if (f === 'cad' && to === 'usd') return Math.round(amountCents / rate)
  // Unexpected third currency — treat as unconvertible.
  throw new Error(`Cannot convert ${from} to ${to}`)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Quote cache: the Stripe callback fires on every completed address edit,
// so identical re-quotes within a session are common.
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 500
const quoteCache = new Map<string, { at: number; quotes: ShippingOptionQuote[] }>()

/**
 * Returns 1–2 shipping options (standard + express) for the address, priced
 * from the built-in zone tables. Never throws: the tables always produce a
 * price.
 */
export async function getShippingOptions(
  to: ShippingAddress,
  ballCount: number,
  sessionCurrency: 'usd' | 'cad'
): Promise<ShippingOptionQuote[]> {
  const key = [to.country, to.state, to.postalCode, ballCount, sessionCurrency].join('|')
  const cached = quoteCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.quotes

  const quotes = await tableQuotes(to, ballCount, sessionCurrency)

  if (quoteCache.size >= CACHE_MAX) {
    const oldest = quoteCache.keys().next().value
    if (oldest !== undefined) quoteCache.delete(oldest)
  }
  quoteCache.set(key, { at: Date.now(), quotes })
  return quotes
}
