'use client'

import { useEffect, useState } from 'react'

/**
 * The currency this visitor will actually be charged ('USD' | 'CAD'), or null
 * until the answer arrives. /api/region derives it from the same helper the
 * checkout routes use, so a pixel event tagged with it cannot disagree with the
 * amount Stripe bills.
 *
 * Client components that already know the region (a server page can pass it
 * down as a prop) should do that instead — this costs one request.
 */
export function useRegionCurrency(): string | null {
  const [currency, setCurrency] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/region')
      .then((r) => r.json())
      .then(({ currency: c }) => {
        if (live && typeof c === 'string') setCurrency(c.toUpperCase())
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return currency
}
