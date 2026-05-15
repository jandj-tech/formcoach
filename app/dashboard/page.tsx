import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import Link from 'next/link'
import LogoutButton from './LogoutButton'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [user] = await db`
    SELECT id, email, subscription_type, subscription_expires_at
    FROM users WHERE id = ${session.userId}
  ` as unknown as [{ id: string; email: string; subscription_type: string | null; subscription_expires_at: string | null } | undefined]

  if (!user) redirect('/login')

  const isSubscribed =
    !!user.subscription_type &&
    !!user.subscription_expires_at &&
    new Date(user.subscription_expires_at) > new Date()

  const submissions = await db`
    SELECT s.id, s.created_at, s.token, a.overall_score, a.frame_urls
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    WHERE s.user_id = ${user.id} OR s.email = ${user.email}
    ORDER BY s.created_at DESC
    LIMIT 100
  ` as unknown as Array<{
    id: string
    created_at: string
    token: string
    overall_score: number | null
    frame_urls: string[] | null
  }>

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
                {user.subscription_type === 'annual' ? 'Annual' : 'Monthly'} Pro
              </span>
            )}
            <LogoutButton />
          </div>
        </div>

        {/* Subscription banner if expired */}
        {!isSubscribed && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-black text-sm">Your subscription has expired</p>
              <p className="text-gray-500 text-xs mt-0.5">Renew to get unlimited analyses</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <a
                href="/api/subscribe"
                onClick={(e) => {
                  e.preventDefault()
                  fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'monthly' }) })
                    .then(r => r.json()).then(({ url }) => { if (url) window.location.href = url })
                }}
                className="bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Renew
              </a>
            </div>
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
