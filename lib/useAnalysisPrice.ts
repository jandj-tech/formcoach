'use client'

import { useEffect, useState } from 'react'
import { analysisUnitCents } from './team-pricing'

/**
 * The signed-in player's own per-analysis price.
 *
 * Every player-facing buy surface reads from this hook so one person never
 * sees two different prices on two different pages. Server pages that already
 * know the answer pass it as `initialInitiated` so the correct price is on
 * screen at first paint; the session fetch then confirms it for pages that
 * render without it (the shop, for one, used to fall back to $1.79 for a
 * player whose team had already unlocked the team rate).
 */
export function useAnalysisPrice(initialInitiated = false) {
  const [initiated, setInitiated] = useState(initialInitiated)

  useEffect(() => {
    let alive = true
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d?.user?.onInitiatedTeam === 'boolean') {
          setInitiated(d.user.onInitiatedTeam)
        }
      })
      .catch(() => {
        // Offline or logged out — keep whatever the server told us.
      })
    return () => {
      alive = false
    }
  }, [])

  return { initiated, baseUnitCents: analysisUnitCents(initiated) }
}
