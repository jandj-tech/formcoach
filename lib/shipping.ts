import 'server-only'
import { getUsdToCadRate } from '@/lib/fx'

// Address-based shipping quotes with zero external dependencies: prices come
// from built-in zone tables calibrated against published Canada Post and
// USPS retail rate charts (2026). Canadian orders ship from the Vaughan, ON
// warehouse via Canada Post; US orders from Las Vegas, NV via USPS — every
// order is domestic, and the zone is derived from the buyer's postal code
// (Canada) or state (US).
//
// If SHIPPO_API_KEY is ever set, live carrier rates are fetched instead and
// the tables become the fallback. Without a key nothing is called and
// nothing costs money.

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
  source: 'live' | 'table'
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
// Optional live rates via Shippo (only when SHIPPO_API_KEY is set)
// ---------------------------------------------------------------------------

function warehouseFor(country: string) {
  if (country === 'CA') {
    return {
      name: process.env.SHIP_FROM_CA_NAME || 'LearnHoops',
      street1: process.env.SHIP_FROM_CA_LINE1 || '',
      city: process.env.SHIP_FROM_CA_CITY || 'Vaughan',
      state: process.env.SHIP_FROM_CA_STATE || 'ON',
      zip: process.env.SHIP_FROM_CA_ZIP || '',
      country: 'CA',
    }
  }
  return {
    name: process.env.SHIP_FROM_US_NAME || 'LearnHoops',
    street1: process.env.SHIP_FROM_US_LINE1 || '',
    city: process.env.SHIP_FROM_US_CITY || 'Las Vegas',
    state: process.env.SHIP_FROM_US_STATE || 'NV',
    zip: process.env.SHIP_FROM_US_ZIP || '',
    country: 'US',
  }
}

// One parcel per order. A boxed ball is ~25×25×25 cm at ~0.9 kg including
// packaging; multi-ball orders ship in the next box size up.
function parcelFor(ballCount: number) {
  const n = Math.max(1, ballCount)
  const dims =
    n === 1 ? { length: 25, width: 25, height: 25 }
    : n === 2 ? { length: 50, width: 25, height: 25 }
    : n <= 4 ? { length: 50, width: 50, height: 25 }
    : { length: 50, width: 50, height: 50 }
  return {
    ...dims,
    distance_unit: 'cm',
    weight: Math.round(n * 0.9 * 100) / 100,
    mass_unit: 'kg',
  }
}

type ShippoRate = {
  amount: string
  currency: string
  amount_local?: string
  currency_local?: string
  provider: string
  servicelevel?: { name?: string; token?: string }
  estimated_days?: number | null
}

async function fetchShippoRates(
  to: ShippingAddress,
  ballCount: number
): Promise<ShippoRate[]> {
  const apiKey = process.env.SHIPPO_API_KEY
  if (!apiKey) throw new Error('SHIPPO_API_KEY not set')
  const from = warehouseFor(to.country)
  if (!from.street1 || !from.zip) throw new Error(`Warehouse address for ${to.country} not configured`)

  const res = await fetch('https://api.goshippo.com/shipments/', {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address_from: from,
      address_to: {
        name: to.name || 'Customer',
        street1: to.line1 || '',
        street2: to.line2 || undefined,
        city: to.city || '',
        state: to.state || '',
        zip: to.postalCode || '',
        country: to.country,
      },
      parcels: [parcelFor(ballCount)],
      async: false,
    }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Shippo ${res.status}`)
  const data = (await res.json()) as { rates?: ShippoRate[] }
  return data.rates ?? []
}

function rateCents(r: ShippoRate, sessionCurrency: 'usd' | 'cad'): { cents: number; currency: string } {
  // Prefer the destination-local amount when it's already in the session
  // currency; otherwise return the base amount for conversion.
  if (r.currency_local?.toLowerCase() === sessionCurrency && r.amount_local) {
    return { cents: Math.round(parseFloat(r.amount_local) * 100), currency: sessionCurrency }
  }
  return { cents: Math.round(parseFloat(r.amount) * 100), currency: r.currency }
}

async function liveQuotes(
  to: ShippingAddress,
  ballCount: number,
  sessionCurrency: 'usd' | 'cad'
): Promise<ShippingOptionQuote[]> {
  const expectedProvider = to.country === 'CA' ? 'canada_post' : 'usps'
  const rates = (await fetchShippoRates(to, ballCount))
    .filter((r) => r.provider?.toLowerCase() === expectedProvider)
    .filter((r) => Number.isFinite(parseFloat(r.amount)))
  if (rates.length === 0) throw new Error('No rates returned')

  const ground = rates
    .filter((r) => (r.estimated_days ?? 8) <= 8)
    .sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))[0]
    ?? rates.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))[0]
  const expedited = rates
    .filter((r) => (r.estimated_days ?? 99) <= 3 && r !== ground)
    .sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))[0]

  let quotes: ShippingOptionQuote[] = []
  for (const r of [ground, expedited]) {
    if (!r) continue
    const { cents, currency } = rateCents(r, sessionCurrency)
    quotes.push({
      displayName: `${providerLabel(r.provider)} ${r.servicelevel?.name || 'Shipping'}`,
      amountCents: await convertToCurrency(cents, currency, sessionCurrency),
      currency: sessionCurrency,
      carrier: r.provider,
      service: r.servicelevel?.token || r.servicelevel?.name || 'unknown',
      estDaysMin: r.estimated_days ? r.estimated_days + HANDLING_DAYS_MIN : undefined,
      estDaysMax: r.estimated_days ? r.estimated_days + 2 + HANDLING_DAYS_MAX : undefined,
      source: 'live',
    })
  }
  // An expedited option that isn't meaningfully faster or costs less than
  // ground just confuses — drop it.
  if (quotes.length === 2 && quotes[1].amountCents <= quotes[0].amountCents) {
    quotes = [quotes[1]]
  }
  if (quotes.length === 0) throw new Error('No usable rates')
  return quotes
}

function providerLabel(provider: string): string {
  const p = provider.toLowerCase()
  if (p === 'canada_post') return 'Canada Post'
  if (p === 'usps') return 'USPS'
  if (p === 'ups') return 'UPS'
  if (p === 'fedex') return 'FedEx'
  return provider
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
 * from the built-in zone tables — or from live Shippo rates when a key is
 * configured. Never throws: the tables always produce a price.
 */
export async function getShippingOptions(
  to: ShippingAddress,
  ballCount: number,
  sessionCurrency: 'usd' | 'cad'
): Promise<ShippingOptionQuote[]> {
  const key = [to.country, to.state, to.postalCode, ballCount, sessionCurrency].join('|')
  const cached = quoteCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.quotes

  let quotes: ShippingOptionQuote[]
  if (process.env.SHIPPO_API_KEY) {
    try {
      quotes = await liveQuotes(to, ballCount, sessionCurrency)
    } catch (err) {
      console.error('[shipping] live rates failed, using zone table:', err)
      quotes = await tableQuotes(to, ballCount, sessionCurrency)
    }
  } else {
    quotes = await tableQuotes(to, ballCount, sessionCurrency)
  }

  if (quoteCache.size >= CACHE_MAX) {
    const oldest = quoteCache.keys().next().value
    if (oldest !== undefined) quoteCache.delete(oldest)
  }
  quoteCache.set(key, { at: Date.now(), quotes })
  return quotes
}
