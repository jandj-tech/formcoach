import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import { PRICE } from '@/app/shop/product'

export const metadata: Metadata = {
  title: '30-Day Money-Back Guarantee — LearnHoops',
  description:
    'Try the LearnHoops Training Ball for 30 days. If it is not right for your player, email us for a refund of the ball price. Shipping costs are not refunded and return postage is the buyer&apos;s.',
  alternates: { canonical: '/returns' },
}

export default function ReturnsPage() {
  return (
    <main className="min-h-screen bg-ink-950 flex flex-col">
      <TopNav />
      <div className="flex-1 max-w-3xl mx-auto px-6 py-16 text-white">
        <h1 className="text-3xl font-bold mb-2">30-Day Money-Back Guarantee</h1>
        <p className="text-gray-400 mb-10 text-sm">Last updated: September 8, 2026</p>

        <p className="text-gray-200 leading-relaxed mb-10 text-lg">
          Try the training ball for 30 days. If it isn&apos;t right for your player, email us and
          we&apos;ll refund what you paid for the ball. Shipping costs aren&apos;t refunded, and
          sending it back is at your expense.
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">What&apos;s covered</h2>
          <p className="text-gray-300 leading-relaxed">
            The LearnHoops Training Ball, bought on learnhoops.com — a single ball or the 2-ball
            bundle. You have 30 days from the day your order arrives to decide.
          </p>
          <p className="text-gray-300 leading-relaxed mt-4">
            Use it in the meantime. Shooting with it is the only way to know whether the grip lines
            work for your player, so a ball that has been played with is still covered.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">What you get back</h2>
          <p className="text-gray-300 leading-relaxed">
            The price you paid for the ball — ${PRICE.toFixed(2)} for a single ball, or the bundle
            price if you bought two. Refunds go back to the card you paid with, usually within a few
            business days of the ball reaching us.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">What isn&apos;t covered: shipping</h2>
          <p className="text-gray-300 leading-relaxed">
            We don&apos;t refund the shipping you paid on the original order, and return postage is
            yours to pay. Practically: you keep the cost of getting it to you and back, and we
            return the price of the ball itself.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Your free shot analyses</h2>
          <p className="text-gray-300 leading-relaxed">
            Yours to keep. The analyses that came with your ball stay in your account whether you
            keep the ball or not — we don&apos;t take back feedback you&apos;ve already received, or
            credits already sitting in your balance.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">How to start a return</h2>
          <p className="text-gray-300 leading-relaxed">
            Email{' '}
            <a href="mailto:support@learnhoops.com" className="text-ember-400 underline hover:text-ember-300">
              support@learnhoops.com
            </a>{' '}
            from the address you ordered with, and tell us what wasn&apos;t right. We&apos;ll reply
            with the return address and confirm what you&apos;ll get back before you post anything.
            If the ball arrived damaged or we sent the wrong size or edition, say so — that&apos;s
            our mistake to fix, not a return, and we cover it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Analyses and memberships</h2>
          <p className="text-gray-300 leading-relaxed">
            This guarantee covers the physical ball. Analysis tokens are used as soon as a shot is
            graded, so they aren&apos;t refundable — and a membership can be cancelled any time from
            your{' '}
            <Link href="/dashboard" className="text-ember-400 underline hover:text-ember-300">
              dashboard
            </Link>
            , which stops the next payment and keeps your plan running to the end of the period you
            already paid for.
          </p>
        </section>

        <p className="text-gray-400 text-sm">
          Questions before you buy?{' '}
          <Link href="/support" className="text-ember-400 underline hover:text-ember-300">
            Contact support
          </Link>{' '}
          — we&apos;d rather answer a sizing question now than process a return later.
        </p>
      </div>
      <SiteFooter />
    </main>
  )
}
