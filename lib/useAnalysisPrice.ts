'use client'

import { useEffect, useState } from 'react'
import { analysisUnitCents } from './team-pricing'

/**
 * The signed-in player's own per-analysis price.
 *
 * Every player-facing buy surface reads from this hook so one person never
 * sees two different prices on two different pages. Server pages that already
 * know the answer pass it as `initialOnTeam` so the correct price is on
 * screen at first paint; the session fetch then confirms it for pages that
 * render without it.
 *
 * The session field is still called `onInitiatedTeam` because shipped iOS
 * builds read that name; it now means simply "on a team".
 */
export function useAnalysisPrice(initialOnTeam = false) {
  const [onTeam, setOnTeam] = useState(initialOnTeam)

  useEffect(() => {
    let alive = true
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d?.user?.onInitiatedTeam === 'boolean') {
          setOnTeam(d.user.onInitiatedTeam)
        }
      })
      .catch(() => {
        // Offline or logged out — keep whatever the server told us.
      })
    return () => {
      alive = false
    }
  }, [])

  return { onTeam, baseUnitCents: analysisUnitCents(onTeam) }
}
