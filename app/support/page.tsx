import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'Support — LearnHoops',
  description: 'Contact LearnHoops support.',
}

const SUPPORT_EMAIL = 'learnhoops8@gmail.com'

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />

      {/* Contact */}
      <div className="hero-glow grain relative flex flex-col items-center px-6 pt-16 pb-14">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="space-y-3">
            <p className="eyebrow text-ember-400 select-none">We&apos;ve got your back</p>
            <h1 className="font-display font-black uppercase text-[clamp(2.2rem,6vw,4rem)] leading-[0.95]">
              Support
            </h1>
            <p className="text-chalk-dim">
              Need help with your account, an analysis, or an order? Reach out and we&apos;ll help.
            </p>
          </div>

          <div className="bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <p className="eyebrow text-chalk-dim select-none">Contact us</p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="block text-xl font-bold text-ember-400 hover:text-ember-500 break-all transition-colors"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="flex-1 bg-ink-900 border-t border-courtline">
        <div className="flex flex-col items-center px-6 py-14 space-y-8">
          <div className="w-full max-w-3xl space-y-5">
            <h2 className="font-display font-black uppercase text-2xl text-center">
              Frequently asked questions
            </h2>
            <details id="filming" className="bg-ink-800 border border-courtline rounded-2xl group" open>
              <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none font-bold text-chalk select-none">
                What angle should I film from to get the best results?
                <span className="text-chalk-dim text-lg group-open:rotate-180 transition-transform select-none" aria-hidden>
                  ›
                </span>
              </summary>
              <div className="px-5 pb-5 text-sm text-chalk-dim leading-relaxed">
                For the most accurate analysis, film from under or near the net — either directly behind the basket or slightly to the side at an angle where the shooter&apos;s elbow, arms, and hands are all clearly visible throughout the shot. This gives the AI a clear view of arm mechanics, elbow alignment, and release. If you also want arc to be evaluated, choose an angle where the ball&apos;s flight path is visible. Avoid filming directly face-on, as key form details are hidden from that perspective. Video examples for each angle are coming soon.
              </div>
            </details>
          </div>

          <Link href="/" className="text-sm font-semibold text-ember-400 hover:text-ember-500 transition-colors py-2">
            ← Back to home
          </Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
