import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ClearCart from './ClearCart'
import { getStripe } from '@/lib/stripe'
import { grantBallCreditsOnce } from '@/lib/grant-ball-credits'

export const metadata = {
  title: 'Order Confirmed — LearnHoops.com',
}

// Server-side grant: runs as soon as Stripe redirects the buyer here.
// Idempotent via processed_stripe_sessions, so the webhook (if it fires)
// won't double-credit. This runs without JS so a flaky client can't
// strand the buyer's credits.
async function grantCreditsForSession(sessionId: string | undefined): Promise<{ ok: boolean; tokens: number; reason: string; updatedRows?: number }> {
  if (!sessionId) return { ok: false, tokens: 0, reason: 'no_session_id' }
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return { ok: false, tokens: 0, reason: 'not_paid' }
    }
    const tokensToGrant = parseInt(session.metadata?.analysis_tokens ?? '0', 10)
    const recipient = session.metadata?.token_recipient ?? ''
    const email = session.customer_details?.email ?? null
    const result = await grantBallCreditsOnce({ sessionId, recipient, tokensToGrant, email })
    console.log('[shop/success] server-side grant', { sessionId, tokensToGrant, recipient, ...result })
    // Honest reporting: only "ok" if a row was actually updated. Trusting
    // 'already_processed' would lie when the webhook claimed the session
    // but couldn't credit anyone.
    const ok = result.granted && (result.updatedRows ?? 0) > 0
    return { ok, tokens: tokensToGrant, reason: result.reason, updatedRows: result.updatedRows }
  } catch (err) {
    console.error('[shop/success] grant retrieval failed:', err)
    return { ok: false, tokens: 0, reason: 'retrieve_failed' }
  }
}

export default async function ShopSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const params = await searchParams
  const sessionId = params.session_id
  const grant = await grantCreditsForSession(sessionId)

  return (
    <main className="min-h-screen bg-black flex flex-col">
      <ClearCart sessionId={sessionId} />
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-6xl">🏀</div>
          <h1 className="text-3xl font-black text-white">Order confirmed!</h1>
          <p className="text-white">
            Thanks for ordering The LearnHoops Training Ball. We&apos;ll email you a receipt and let you know
            when your order ships.
          </p>
          {grant.tokens > 0 && grant.ok && (
            <p className="text-orange-400 font-bold">
              {grant.tokens} free shot analyses credited to your account.
            </p>
          )}
          {grant.tokens > 0 && !grant.ok && (
            <div className="space-y-1">
              <p className="text-yellow-300 font-bold">
                {grant.tokens} free shot analyses pending.
              </p>
              <p className="text-gray-400 text-xs">
                Refresh in a minute — if they still don&apos;t show, email{' '}
                <a href="mailto:support@learnhoops.com" className="underline">support@learnhoops.com</a>
                {sessionId ? ` with order ${sessionId.slice(0, 18)}…` : ''} and we&apos;ll fix it.
              </p>
            </div>
          )}
          <Link
            href="/dashboard"
            className="inline-block mt-4 bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
