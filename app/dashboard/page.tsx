import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import Link from 'next/link'
import LogoutButton from './LogoutButton'
import BuyTokenButton from './BuyTokenButton'
import DeleteSubmissionButton from './DeleteSubmissionButton'
import JoinTeamForm from './JoinTeamForm'
import LeaveTeamButton from './LeaveTeamButton'
import NicknameForm from './NicknameForm'
import JoinTeamPopup from './JoinTeamPopup'

type UserRow = {
  id: string
  email: string
  subscription_type: string | null
  subscription_expires_at: string | null
  analysis_tokens?: number
  nickname?: string | null
}

type SubmissionRow = {
  id: string
  created_at: string
  token: string
  // Postgres returns DECIMAL columns as strings, so this can be either.
  overall_score: string | number | null
  frame_urls: string[] | null
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  let user: UserRow | undefined
  let submissions: SubmissionRow[] = []
  let loadError: string | null = null

  try {
    // The analysis_tokens / nickname columns may not exist yet if the DB
    // migration hasn't been applied — fall back to the base column set.
    try {
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at, analysis_tokens, nickname
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/column .* does not exist/i.test(msg)) throw err
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

  // Team the player has joined (if any). Falls back to null if the
  // team_memberships table doesn't exist yet.
  let team: { id: string; name: string; access_code: string; admin_email: string } | null = null
  let coaches: string[] = []
  try {
    const [row] = (await db`
      SELECT t.id, t.name, t.access_code, t.admin_email
      FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${user.id}
      ORDER BY tm.joined_at DESC
      LIMIT 1
    `) as unknown as [{ id: string; name: string; access_code: string; admin_email: string } | undefined]
    team = row ?? null
  } catch (err) {
    console.error('[dashboard] team membership query failed:', err)
  }

  // Coaches for the player's team, shown by nickname (falling back to email):
  // the founding coach plus any added coaches.
  if (team) {
    let headCoachNickname: string | null = null
    try {
      const [r] = (await db`
        SELECT coach_nickname FROM teams WHERE id = ${team.id}
      `) as unknown as [{ coach_nickname: string | null } | undefined]
      headCoachNickname = r?.coach_nickname ?? null
    } catch (err) {
      // coach_nickname column may not exist on older DBs.
      console.error('[dashboard] head coach nickname query failed:', err)
    }
    coaches = [headCoachNickname || team.admin_email]
    try {
      const extra = (await db`
        SELECT email, nickname FROM team_coaches WHERE team_id = ${team.id} ORDER BY created_at ASC
      `) as unknown as Array<{ email: string; nickname: string | null }>
      coaches.push(...extra.map(c => c.nickname || c.email))
    } catch (err) {
      // team_coaches may not exist on older DBs — just show the founding coach.
      console.error('[dashboard] team coaches query failed:', err)
    }
  }

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
      <JoinTeamPopup hasTeam={!!team} />

      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-black">Your Shot History</h1>
            <p className="text-gray-500 text-sm mt-1">
              {user.nickname ? `${user.nickname} · ${user.email}` : user.email}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full">
              {isSubscribed ? 'Unlimited analyses' : `${tokens} analysis token${tokens !== 1 ? 's' : ''}`}
            </span>
            {!isSubscribed && <BuyTokenButton />}
            <LogoutButton />
          </div>
        </div>

        {/* Nickname — collapsible to keep the shot history in view */}
        <details className="group border border-gray-200 rounded-lg">
          <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none list-none">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nickname</span>
            <span className="flex items-center gap-2 text-sm text-gray-700">
              <span className="truncate max-w-[10rem]">{user.nickname || 'Not set'}</span>
              <span className="text-gray-400 text-xs transition-transform group-open:rotate-180">▾</span>
            </span>
          </summary>
          <div className="px-3 pb-3">
            <NicknameForm current={user.nickname ?? null} />
          </div>
        </details>

        {/* Your Team — collapsible to keep the shot history in view */}
        <details className="group border border-gray-200 rounded-lg">
          <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none list-none">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</span>
            <span className="flex items-center gap-2 text-sm text-gray-700">
              <span className="truncate max-w-[10rem]">{team ? team.name : 'Not on a team'}</span>
              <span className="text-gray-400 text-xs transition-transform group-open:rotate-180">▾</span>
            </span>
          </summary>
          <div className="px-3 pb-3">
            {team ? (
              <div className="space-y-3">
                <p className="text-gray-500 text-sm">
                  Team code:{' '}
                  <span className="font-mono font-semibold text-gray-700">{team.access_code}</span>
                </p>
                {coaches.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {coaches.length === 1 ? 'Coach' : 'Coaches'}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {coaches.map((c, i) => (
                        <li key={i} className="text-sm text-gray-700">{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <Link
                    href="/dashboard/leaderboard"
                    className="inline-block bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
                  >
                    View Team Leaderboard
                  </Link>
                </div>
                <LeaveTeamButton teamName={team.name} />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Have a team code? Enter it to join your team.</p>
                <JoinTeamForm />
              </div>
            )}
          </div>
        </details>

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
              // Postgres returns DECIMAL as a string — coerce before formatting.
              const score = sub.overall_score == null ? null : Number(sub.overall_score)
              return (
                <div key={sub.id} className="flex items-center gap-2">
                  <Link
                    href={`/results/${sub.token}`}
                    className="flex-1 min-w-0 flex items-center gap-4 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-xl p-4 transition-colors group"
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
                    {score !== null && !Number.isNaN(score) ? (
                      <div className={`text-2xl font-black shrink-0 ${scoreColor(score)}`}>
                        {score.toFixed(1)}
                      </div>
                    ) : (
                      <div className="text-gray-300 text-sm shrink-0">—</div>
                    )}
                  </Link>
                  <DeleteSubmissionButton id={sub.id} />
                </div>
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
