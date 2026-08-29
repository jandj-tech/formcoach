import { redirect } from 'next/navigation'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import { isInAppRequest } from '@/lib/in-app'
import { getPendingFromCookie } from '@/lib/pending-org'
import OrgPricingClient from './OrgPricingClient'

// Reads cookies and writes the offer deadline, so it must never be cached.
export const dynamic = 'force-dynamic'

/**
 * The subscription panel, shown after the signup form and before checkout.
 *
 * Reads the pending signup from the httpOnly cookie — nothing identifying is
 * in the URL. Reading cookies during render is fine; only WRITING them is not,
 * which is why the cookie was set by /api/org/signup/start and the post-payment
 * login happens in a route handler.
 */
export default async function OrgPricingPage() {
  const pending = await getPendingFromCookie()

  // No pending signup, or it expired / was already used: there is nothing to
  // price. Send them back to fill the form in rather than showing plans that
  // cannot be bought.
  if (!pending) redirect('/org/signup')

  // The deadline was set when they pressed "Get started today"; this page only
  // reads it. Re-arming here would mean the countdown silently restarted on
  // every refresh, which is not a countdown. Starting a new signup resets it,
  // because that writes a new pending row.
  const offerExpiresAt = pending.offerExpiresAt
  const inApp = await isInAppRequest()

  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="flex-1">
        <OrgPricingClient
          orgName={pending.orgName}
          offerExpiresAt={offerExpiresAt ? offerExpiresAt.toISOString() : null}
          inApp={inApp}
        />
      </div>
      <SiteFooter />
    </main>
  )
}
