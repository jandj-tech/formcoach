import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'Unsubscribed',
  robots: { index: false, follow: false },
}

// ?scope=marketing: an old unsigned link, which only stops marketing mail
// (see app/api/unsubscribe/route.ts). The copy must not claim more.
export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const q = await searchParams
  const marketingOnly = (Array.isArray(q.scope) ? q.scope[0] : q.scope) === 'marketing'
  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm text-center space-y-3">
          <Image src="/icon.png" alt="" width={48} height={48} className="mx-auto rounded-2xl select-none" aria-hidden />
          <h1 className="font-display font-black uppercase text-2xl leading-tight">
            {marketingOnly ? 'Marketing emails stopped' : <>You&apos;re unsubscribed</>}
          </h1>
          {marketingOnly ? (
            <p className="text-chalk-dim text-sm">
              We won&apos;t send you any more LearnHoops offers or product news. Emails from your team or coach,
              results, password resets and receipts still arrive. To stop team emails too, use the unsubscribe link
              at the bottom of one of those emails.
            </p>
          ) : (
            <p className="text-chalk-dim text-sm">
              We won&apos;t send you any more offers, tips, team announcements or results emails. Password resets and
              receipts still arrive, and any results link you already have keeps working.
            </p>
          )}
          <p className="text-chalk-dim text-xs">
            Unsubscribed by mistake?{' '}
            <Link href="/support" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">Contact us</Link>.
          </p>
          <Link href="/" className="inline-block text-ember-400 hover:text-ember-500 font-medium text-sm transition-colors py-1">
            Back to LearnHoops.com
          </Link>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
