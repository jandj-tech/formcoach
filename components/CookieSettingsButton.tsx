'use client'

import { useCookieConsent } from '@/lib/cookie-consent'

/**
 * Footer entry point for changing a stored choice. Withdrawing consent has to
 * be as easy as giving it, and the banner is gone once a choice exists.
 */
export default function CookieSettingsButton() {
  const { openSettings } = useCookieConsent()

  return (
    <button
      type="button"
      onClick={openSettings}
      className="text-sm text-chalk hover:text-ember-400 transition-colors text-left"
    >
      Cookie settings
    </button>
  )
}
