'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

const OPTIONS = [
  { value: 'light', label: 'Light', hint: 'The default.' },
  { value: 'dark', label: 'Dark', hint: 'Easier on the eyes in a dark room.' },
  { value: 'system', label: 'System', hint: 'Follow your device.' },
] as const

/**
 * Light / dark / system picker for the account pages.
 *
 * Light is the default and stays the default — dark is opt-in, so nobody's
 * account changes appearance without asking for it.
 *
 * The mounted guard is not optional. `useTheme` has no value during SSR (the
 * choice lives in localStorage), so rendering the selected state on the server
 * would hand React a different tree than the browser builds, and hydration
 * would tear. Until mount, nothing is marked selected.
 */
export default function AppearanceToggle() {
  const { theme, setTheme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the first client render; there is no server equivalent to read
    setIsMounted(true)
  }, [])

  const selected = isMounted ? theme : undefined

  return (
    <div>
      <div role="radiogroup" aria-label="Appearance" className="flex flex-wrap gap-2">
        {OPTIONS.map(option => {
          const isSelected = selected === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(option.value)}
              className={`flex-1 min-w-[6.5rem] rounded-xl border px-4 py-3 text-left transition-colors ${
                isSelected
                  ? 'border-orange-500 bg-orange-50 dark:bg-ember-500/10'
                  : 'border-gray-200 dark:border-courtline hover:border-gray-300 dark:hover:border-chalk-dim'
              }`}
            >
              <span className="block text-sm font-bold text-black dark:text-chalk">
                {option.label}
              </span>
              <span className="block text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
                {option.hint}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-500 dark:text-chalk-dim mt-3">
        Applies to your account pages, and is remembered on this device.
      </p>
    </div>
  )
}
