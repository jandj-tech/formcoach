import 'server-only'

// Sane fallback used if the FX API is unreachable. Updated occasionally.
const FALLBACK_USD_TO_CAD = 1.36

/**
 * Fetches the current USD→CAD rate from the European Central Bank
 * (via frankfurter.app — free, no API key, daily updates). Cached for
 * 1 hour via Next's fetch cache.
 */
export async function getUsdToCadRate(): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=CAD', {
      next: { revalidate: 3600, tags: ['fx-rates'] },
    })
    if (!res.ok) return FALLBACK_USD_TO_CAD
    const data = (await res.json()) as { rates?: { CAD?: number } }
    const rate = data.rates?.CAD
    return typeof rate === 'number' && rate > 0 ? rate : FALLBACK_USD_TO_CAD
  } catch {
    return FALLBACK_USD_TO_CAD
  }
}
