'use client'

import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'

/**
 * Shown in place of a coach/organization signup form inside the iOS app.
 *
 * Team and organization accounts are set up on the website only: they are
 * billed surfaces with rosters, credit pools and invoices behind them, and the
 * app is a player tool. Rather than hide these pages in-app and leave a coach
 * wondering whether the product supports them, the page still explains what a
 * team account is and says plainly where to create one.
 *
 * No link is rendered: opening learnhoops.com from inside the app is exactly
 * the "link out to buy" pattern App Review rejects. The address is text the
 * reader can type into a browser themselves.
 */
export default function WebOnlySignup({
  kind,
}: {
  kind: 'team' | 'organization' | 'coach'
}) {
  const title =
    kind === 'organization'
      ? 'Organization accounts are set up on the web'
      : kind === 'coach'
        ? 'Coach accounts are set up on the web'
        : 'Team accounts are set up on the web'

  const body =
    kind === 'organization'
      ? 'Registering an organization involves your teams, coaches and billing, so it lives on the full site where there is room to do it properly.'
      : kind === 'coach'
        ? 'Coaching tools — your roster, credits and player uploads — are managed on the full site, so coach accounts are created there.'
        : 'Running a team means a roster, credits and invoices, so team accounts are created on the full site where all of that lives.'

  return (
    <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-black text-black dark:text-chalk mb-3">{title}</h1>
          <p className="text-gray-600 dark:text-chalk-dim text-sm leading-relaxed mb-6">{body}</p>

          <div className="rounded-2xl border border-gray-200 dark:border-courtline bg-gray-50 dark:bg-ink-900 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-chalk-dim mb-1">
              Visit on a browser
            </p>
            <p className="text-base font-black text-black dark:text-chalk">learnhoops.com</p>
          </div>

          <p className="text-gray-500 dark:text-chalk-dim text-xs mt-6 leading-relaxed">
            Already have a {kind === 'organization' ? 'organization' : 'coach'} account? You can sign
            in with it right here in the app.
          </p>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
