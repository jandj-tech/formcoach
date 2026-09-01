import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import PricingClient from './PricingClient'
import { getSession } from '@/lib/auth'
import { getPlayerSubscription, subscriptionEntitled } from '@/lib/player-subscription'

export const metadata: Metadata = {
  title: 'Pricing — AI Shot Analysis Plans | LearnHoops',
  description:
    'LearnHoops Player: $18.95/month for 2 shot analyses per week (up to 6 per month). LearnHoops Pro: $28.95/month for 5 per week (up to 15 per month). Or buy individual analyses anytime.',
  alternates: { canonical: '/pricing' },
}

export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  // Signed-in state only steers the CTA (subscribe vs manage) — every price on
  // the page comes from lib/player-plans.ts on the client and the server
  // recomputes it at checkout, so nothing here can be tampered into a price.
  const session = await getSession()
  let currentPlan: 'player' | 'pro' | null = null
  let signedIn = false
  if (session) {
    signedIn = true
    const sub = await getPlayerSubscription(session.userId)
    if (subscriptionEntitled(sub)) currentPlan = sub.plan
  }

  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />
      <PricingClient signedIn={signedIn} currentPlan={currentPlan} />
      <SiteFooter />
    </main>
  )
}
