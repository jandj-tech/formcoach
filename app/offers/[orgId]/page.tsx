import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { fulfillOfferSession } from '@/lib/org-offer-fulfillment'
import { getPurchasableOffers } from '@/lib/org-offers-db'
import { effectivePriceCents, hasAnchorPrice } from '@/lib/org-offers'
import OfferCta, { type OfferCtaOffer } from '@/app/results/[token]/OfferCta'

// Standalone shop page for one organization's products (the Shooting Class,
// the ball bundle) — so a club can sell the class to families who haven't
// had a shot graded yet. Breakdown-only offers need a report to unlock, so
// they are left off this page. The org id is unguessable (UUID) and reveals
// nothing an access code would.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: { params: Promise<{ orgId: string }> }): Promise<Metadata> {
  const { orgId } = await params
  let name = 'Organization'
  if (UUID_RE.test(orgId)) {
    try {
      const [org] = (await db`SELECT name FROM organizations WHERE id = ${orgId}`) as unknown as [{ name: string } | undefined]
      if (org) name = org.name
    } catch {}
  }
  return { title: `${name} — Offers | LearnHoops`, robots: { index: false } }
}

export default async function OrgOffersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ offer_purchased?: string; offer_session?: string }>
}) {
  const { orgId } = await params
  const sp = await searchParams
  if (!UUID_RE.test(orgId)) return notFound()

  const [org] = (await db`
    SELECT name, platform_share_percent FROM organizations WHERE id = ${orgId}
  `) as unknown as [{ name: string; platform_share_percent: string | null } | undefined]
  if (!org) return notFound()

  // Safety net for a lagging webhook — same idempotent fulfillment.
  if (sp.offer_purchased === '1' && typeof sp.offer_session === 'string' && /^cs_[A-Za-z0-9_]+$/.test(sp.offer_session)) {
    try {
      const stripeSession = await getStripe().checkout.sessions.retrieve(sp.offer_session)
      if (stripeSession.metadata?.orgId === orgId) await fulfillOfferSession(stripeSession, 'success')
    } catch (err) {
      console.error('[offers] success safety net failed:', err)
    }
  }

  const offers = (await getPurchasableOffers(orgId)).filter((o) => o.includesBall || o.includesCourse)
  const cta: OfferCtaOffer[] = offers.map((o) => ({
    id: o.id,
    kind: o.kind,
    title: o.title,
    description: o.description,
    priceCents: effectivePriceCents(o),
    regularPriceCents: o.regularPriceCents,
    hasAnchor: hasAnchorPrice(o),
    includesBall: o.includesBall,
    includesBreakdown: o.includesBreakdown,
    unlockScope: o.unlockScope,
    shippingCents: o.includesBall ? o.shippingCents : 0,
  }))

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-8">
        <div>
          <p className="text-orange-500 text-xs font-bold uppercase tracking-widest mb-1.5">Offers</p>
          <h1 className="text-3xl sm:text-4xl font-black text-black leading-tight">{org.name}</h1>
          <p className="text-gray-500 text-sm mt-2">
            Programs and gear from {org.name}, with checkout by LearnHoops. Questions? Ask your coach.
          </p>
        </div>

        {sp.offer_purchased === '1' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <p className="text-sm font-black text-green-800">Thank you — your purchase is confirmed.</p>
            <p className="text-sm text-green-900/80 mt-1">
              A receipt is on its way to your email, and {org.name} has been notified.
            </p>
          </div>
        )}

        {cta.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-2xl text-center py-12 px-6">
            <p className="text-black font-bold">Nothing for sale right now</p>
            <p className="text-gray-500 text-sm mt-1">{org.name} hasn&apos;t opened any offers yet. Check back soon.</p>
          </div>
        ) : (
          <OfferCta token="" orgId={orgId} offers={cta} orgName={org.name} mode="strip" justPurchased={false} />
        )}
      </div>
      <SiteFooter />
    </main>
  )
}
