import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import Link from 'next/link'
import LogoutButton from './LogoutButton'
import BuyTokenButton from './BuyTokenButton'

type UserRow = {
  id: string
  email: string
  subscription_type: string | null
  subscription_expires_at: string | null
  analysis_tokens?: number
}

type SubmissionRow = {
  id: string
  created_at: string
  token: string
  overall_score: number | null
  frame_urls: string[] | null
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  let user: UserRow | undefined
  let submissions: SubmissionRow[] = []
  let loadError: string | null = null

  try {
    // The analysis_tokens column may not exist yet if the DB migration
    // hasn't been applied — fall back to the legacy column set.
    try {
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at, analysis_tokens
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/analysis_tokens.*does not exist/i.test(msg)) throw err
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    }

    if (user) {
      submissions = (await db`
        SELECT s.id, s.created_at, s.token, a.overall_score, a.frame_urls
        FROM submissions s
        LEFT JOIN analyses a ON a.submission_id = s.id
        WHERE s.user_id = ${user.id} OR s.email = ${user.email}
        ORDER BY s.created_at DESC
        LIMIT 100
      `) as unknown as SubmissionRow[]
    }
  } catch (err) {
    // Don't crash with a 500 — surface the real reason so it can be fixed.
    loadError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error('[dashboard] load error:', err)
  }

  // Couldn't load data — show the actual error instead of a blank server error.
  if (loadError) {
    return (
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="max-w-3xl mx-auto w-full px-6 py-20 space-y-4 text-center">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-black text-black">Couldn&apos;t load your dashboard</h1>
          <p className="text-gray-500 text-sm">
            Something went wrong reading your data. Technical detail:
          </p>
          <pre className="text-left text-xs bg-gray-100 border border-gray-200 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap text-red-600">
            {loadError}
          </pre>
          <div className="pt-2">
            <LogoutButton />
          </div>
        </div>
      </main>
    )
  }

  if (!user) redirect('/login')

  const isSubscribed =
    !!user.subscription_type &&
    !!user.subscription_expires_at &&
    new Date(user.subscription_expires_at) > new Date()

  const tokens = user.analysis_tokens ?? 0

  function scoreColor(score: number) {
    if (score >= 8) return 'text-green-600'
    if (score >= 6) return 'text-orange-500'
    return 'text-red-500'
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />

      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-black">Your Shot History</h1>
            <p className="text-gray-500 text-sm mt-1">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            {isSubscribed && (
              <span className="bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full">
                {user.subscription_type === 'complimentary' ? 'Complimentary' : user.subscription_type === 'annual' ? 'Annual Pro' : 'Monthly Pro'}
              </span>
            )}
            {!isSubscribed && (
              <span className="bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1 rounded-full">
                {tokens} token{tokens !== 1 ? 's' : ''}
              </span>
            )}
            <LogoutButton />
          </div>
        </div>

        {/* Token balance / buy CTA */}
        {!isSubscribed && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-black text-sm">
                {tokens > 0 ? `${tokens} analysis token${tokens !== 1 ? 's' : ''} remaining` : 'No analysis tokens'}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">
                {tokens > 0 ? 'Each token gives you one full shot analysis' : 'Buy a token to analyze your next shot'}
              </p>
            </div>
            <BuyTokenButton />
          </div>
        )}

        {/* Shots list */}
        {submissions.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="text-5xl">🏀</div>
            <p className="text-black font-semibold">No shots analyzed yet</p>
            <Link
              href="/analyze"
              className="inline-block bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-3 rounded-xl transition-colors"
            >
              Analyze Your Shot
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const thumb = sub.frame_urls?.[Math.floor((sub.frame_urls.length || 1) / 2)]
              const date = new Date(sub.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })
              return (
                <Link
                  key={sub.id}
                  href={`/results/${sub.token}`}
                  className="flex items-center gap-4 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-xl p-4 transition-colors group"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt="Shot frame"
                      className="w-16 h-16 object-cover rounded-lg shrink-0 bg-gray-200"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded-lg shrink-0 flex items-center justify-center text-2xl">🏀</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-500">{date}</p>
                    <p className="text-black font-semibold text-sm mt-0.5 group-hover:text-orange-600 transition-colors">
                      View Shot Breakdown →
                    </p>
                  </div>
                  {sub.overall_score !== null ? (
                    <div className={`text-2xl font-black shrink-0 ${scoreColor(sub.overall_score)}`}>
                      {sub.overall_score.toFixed(1)}
                    </div>
                  ) : (
                    <div className="text-gray-300 text-sm shrink-0">—</div>
                  )}
                </Link>
              )
            })}
          </div>
        )}

        <div className="text-center pt-4">
          <Link
            href="/analyze"
            className="inline-block bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-xl transition-colors"
          >
            + Analyze Another Shot
          </Link>
        </div>
      </div>
    </main>
  )
}
