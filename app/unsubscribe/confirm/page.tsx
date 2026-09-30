import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import { maskEmail, normalizeUnsubscribeEmail, verifyUnsubscribeSig } from '@/lib/unsubscribe'

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
}

const ERRORS: Record<string, string> = {
  limit: 'Too many unsubscribe requests from this connection. Please try again in an hour.',
  origin: 'We couldn’t confirm that request. Please press the button again.',
  failed: 'Something went wrong on our side. Please try again in a moment.',
}

// Where every unsubscribe link lands. Opening it changes nothing — link
// scanners and mail-client prefetchers follow links too — and the button
// below is what actually unsubscribes (it posts back to /unsubscribe).
//
// A signed link (every email we send now) offers the full unsubscribe. An
// old unsigned link can only stop marketing — anyone can type one, so it
// must not be able to cut a family off from their team's emails — and the
// copy says exactly that.
export default async function UnsubscribeConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const q = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const email = normalizeUnsubscribeEmail(one(q.email))
  const sig = one(q.sig)?.slice(0, 64) ?? ''
  const error = ERRORS[one(q.error) ?? '']
  const signed = !!email && verifyUnsubscribeSig(email, sig)

  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <Image src="/icon.png" alt="" width={48} height={48} className="mx-auto rounded-2xl select-none" aria-hidden />
            <h1 className="font-display font-black uppercase text-2xl leading-tight">
              {!email ? 'This link is incomplete' : signed ? 'Unsubscribe from emails?' : 'Stop marketing emails?'}
            </h1>
            {email ? (
              <p className="text-chalk-dim text-sm">
                {signed ? 'Stop LearnHoops.com emails to ' : 'Stop LearnHoops marketing emails to '}
                <span className="text-ember-400 [overflow-wrap:anywhere]">{maskEmail(email)}</span>.
              </p>
            ) : (
              <p className="text-chalk-dim text-sm">
                Open the unsubscribe link from the email again, or{' '}
                <Link href="/support" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">contact us</Link>{' '}
                and we&apos;ll take care of it.
              </p>
            )}
          </div>

          {email && (
            <form method="post" action="/unsubscribe" className="space-y-4 bg-ink-900 border border-courtline rounded-2xl p-5">
              <input type="hidden" name="email" value={email} />
              {sig && <input type="hidden" name="sig" value={sig} />}
              <input type="hidden" name="confirm" value="1" />
              {signed ? (
                <ul className="text-chalk-dim text-sm space-y-1.5 list-disc pl-5">
                  <li>No more offers, tips or product news.</li>
                  <li>No more team announcements or results emails sent through LearnHoops.</li>
                  <li>Password resets and receipts still arrive.</li>
                </ul>
              ) : (
                <ul className="text-chalk-dim text-sm space-y-1.5 list-disc pl-5">
                  <li>No more LearnHoops offers or product news.</li>
                  <li>Emails from your team or coach, results, password resets and receipts still arrive.</li>
                  <li>To stop team emails too, use the unsubscribe link at the bottom of one of those emails.</li>
                </ul>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="w-full bg-ember-500 hover:bg-ember-400 active:scale-[0.99] text-ink-950 font-bold py-3.5 rounded-full transition-all"
              >
                {signed ? 'Unsubscribe' : 'Stop marketing emails'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-chalk-dim">
            <Link href="/" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">
              {email ? 'Keep my emails' : 'Back to LearnHoops.com'}
            </Link>
          </p>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
