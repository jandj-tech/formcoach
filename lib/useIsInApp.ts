'use client'

import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}
const clientSnapshot = () => navigator.userAgent.includes('LearnHoopsApp')
const serverSnapshot = () => false

// Client-side counterpart of lib/in-app.ts — same User-Agent marker set by
// the iOS app's WebView. useSyncExternalStore applies the real value at
// hydration time (no post-hydration flash where purchase UI is tappable
// in-app, and no hydration mismatch warnings).
export function useIsInApp(): boolean {
  return useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot)
}
