import 'server-only'
import { getUsdToCadRate } from '@/lib/fx'

// Live shipping quotes via Shippo (rates both Canada Post and USPS), with a
// flat zone table as fallback so checkout keeps working if the API is down.
// Canadian orders ship from the Vaughan, ON warehouse; US orders from the
// Las Vegas, NV warehouse — every order is domestic.

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
  source: 'live' | 'fallback'
}

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

// Flat fallback rates in the destination's own currency (CAD cents from
// Vaughan, USD cents from Las Vegas). Tuned near average carrier cost —
// adjust freely; the structure is what matters.
const CA_FALLBACK_CENTS: Record<string, number> = {
  ON: 1400,
  QC: 1700, MB: 1700,
  SK: 2100, AB: 2100, BC: 2100, NB: 2100, NS: 2100, PE: 2100,
  NL: 2800, YT: 2800, NT: 2800, NU: 2800,
}
const US_WEST = new Set(['NV', 'AZ', 'UT', 'CA'])
const US_MOUNTAIN_PACIFIC = new Set(['OR', 'WA', 'ID', 'MT', 'WY', 'CO', 'NM'])
const US_CENTRAL = new Set(['ND', 'SD', 'NE', 'KS', 'OK', 'TX', 'MN', 'IA', 'MO', 'AR', 'LA', 'WI', 'IL', 'MS'])

function fallbackCents(country: string, state: string | null | undefined): number {
  const s = (state || '').toUpperCase()
  if (country === 'CA') return CA_FALLBACK_CENTS[s] ?? 2100
  if (s === 'AK' || s === 'HI') return 2500
  if (US_WEST.has(s)) return 900
  if (US_MOUNTAIN_PACIFIC.has(s)) return 1100
  if (US_CENTRAL.has(s)) return 1300
  return 1500
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

// Quote cache: the Stripe callback fires on every completed address edit,
// so identical re-quotes within a session are common.
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 500
const quoteCache = new Map<string, { at: number; quotes: ShippingOptionQuote[] }>()

/**
 * Returns 1–2 shipping options for the address: the cheapest ground rate,
 * plus an expedited rate when one exists. Falls back to the flat zone table
 * on any error — this function never throws.
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
  try {
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

    quotes = []
    for (const r of [ground, expedited]) {
      if (!r) continue
      const { cents, currency } = rateCents(r, sessionCurrency)
      quotes.push({
        displayName: `${providerLabel(r.provider)} ${r.servicelevel?.name || 'Shipping'}`,
        amountCents: await convertToCurrency(cents, currency, sessionCurrency),
        currency: sessionCurrency,
        carrier: r.provider,
        service: r.servicelevel?.token || r.servicelevel?.name || 'unknown',
        estDaysMin: r.estimated_days ?? undefined,
        estDaysMax: r.estimated_days ? r.estimated_days + 2 : undefined,
        source: 'live',
      })
    }
    // An expedited option that isn't meaningfully faster or costs less than
    // ground just confuses — drop it.
    if (quotes.length === 2 && quotes[1].amountCents <= quotes[0].amountCents) {
      quotes = [quotes[1]]
    }
    if (quotes.length === 0) throw new Error('No usable rates')
  } catch (err) {
    console.error('[shipping] live rates failed, using fallback zone table:', err)
    const localCurrency: 'usd' | 'cad' = to.country === 'CA' ? 'cad' : 'usd'
    const perOrder = fallbackCents(to.country, to.state) + Math.max(0, ballCount - 1) * 500
    quotes = [{
      displayName: 'Standard Shipping',
      amountCents: await convertToCurrency(perOrder, localCurrency, sessionCurrency).catch(() => perOrder),
      currency: sessionCurrency,
      carrier: to.country === 'CA' ? 'canada_post' : 'usps',
      service: 'standard_fallback',
      estDaysMin: 3,
      estDaysMax: 9,
      source: 'fallback',
    }]
  }

  if (quoteCache.size >= CACHE_MAX) {
    const oldest = quoteCache.keys().next().value
    if (oldest !== undefined) quoteCache.delete(oldest)
  }
  quoteCache.set(key, { at: Date.now(), quotes })
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
