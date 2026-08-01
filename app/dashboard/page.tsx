import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isInAppRequest } from '@/lib/in-app'
import { db } from '@/lib/db'
import { userHasInitiatedTeam } from '@/lib/team-tokens'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import InfoTip from '@/components/InfoTip'
import Link from 'next/link'
import LogoutButton from './LogoutButton'
import BuyTokenButton from './BuyTokenButton'
import DeleteSubmissionButton from './DeleteSubmissionButton'
import DeleteAccountButton from './DeleteAccountButton'
import JoinTeamForm from './JoinTeamForm'
import LeaveTeamButton from './LeaveTeamButton'
import NicknameForm from './NicknameForm'
import NameForm from './NameForm'
import JoinTeamPopup from './JoinTeamPopup'

type UserRow = {
  id: string
  email: string
  subscription_type: string | null
  subscription_expires_at: string | null
  analysis_tokens?: number
  nickname?: string | null
  first_name?: string | null
  last_initial?: string | null
}

type SubmissionRow = {
  id: string
  created_at: string
  token: string
  // Postgres returns DECIMAL columns as strings, so this can be either.
  overall_score: string | number | null
  frame_urls: string[] | null
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  // The ?app=ios param is lost on in-page navigation, so also check the
  // app WebView's User-Agent marker.
  const isInApp = params.app === 'ios' || (await isInAppRequest())

  let user: UserRow | undefined
  let submissions: SubmissionRow[] = []
  let loadError: string | null = null

  try {
    // The analysis_tokens / nickname columns may not exist yet if the DB
    // migration hasn't been applied — fall back to the base column set.
    try {
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at,
               analysis_tokens, nickname, first_name, last_initial
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/column .* does not exist/i.test(msg)) throw err
      // first_name / last_initial migration not yet run — fall back without them.
      try {
        ;[user] = (await db`
          SELECT id, email, subscription_type, subscription_expires_at, analysis_tokens, nickname
          FROM users WHERE id = ${session.userId}
        `) as unknown as [UserRow | undefined]
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2)
        if (!/column .* does not exist/i.test(msg2)) throw err2
        ;[user] = (await db`
          SELECT id, email, subscription_type, subscription_expires_at
          FROM users WHERE id = ${session.userId}
        `) as unknown as [UserRow | undefined]
      }
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
      <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
        <TopNav />
        <div className="max-w-3xl mx-auto w-full px-6 py-20 space-y-4 text-center">
          <div className="text-5xl">⚠️</div>
          <h1 className="font-display font-black uppercase text-2xl">Couldn&apos;t load your account</h1>
          <p className="text-chalk-dim text-sm">
            Something went wrong reading your data. Technical detail:
          </p>
          <pre className="text-left text-xs bg-ink-900 border border-courtline rounded-xl p-4 overflow-x-auto whitespace-pre-wrap text-red-400">
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

  // Teams the player has joined — a player can be on more than one (e.g. a
  // house league team and a summer league team).
  let teams: Array<{ id: string; name: string; access_code: string; admin_email: string }> = []
  try {
    teams = (await db`
      SELECT t.id, t.name, t.access_code, t.admin_email
      FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${user.id}
      ORDER BY tm.joined_at DESC
    `) as unknown as typeof teams
  } catch (err) {
    console.error('[dashboard] team membership query failed:', err)
  }

  // Coaches for each team, shown by nickname (falling back to email): the
  // founding coach plus any added coaches.
  const coachesByTeam: Record<string, string[]> = {}
  for (const t of teams) {
    let headCoachNickname: string | null = null
    try {
      const [r] = (await db`
        SELECT coach_nickname FROM teams WHERE id = ${t.id}
      `) as unknown as [{ coach_nickname: string | null } | undefined]
      headCoachNickname = r?.coach_nickname ?? null
    } catch (err) {
      // coach_nickname column may not exist on older DBs.
      console.error('[dashboard] head coach nickname query failed:', err)
    }
    const list = [headCoachNickname || t.admin_email]
    try {
      const extra = (await db`
        SELECT email, nickname FROM team_coaches WHERE team_id = ${t.id} ORDER BY created_at ASC
      `) as unknown as Array<{ email: string; nickname: string | null }>
      list.push(...extra.map(c => c.nickname || c.email))
    } catch (err) {
      // team_coaches may not exist on older DBs — just show the founding coach.
      console.error('[dashboard] team coaches query failed:', err)
    }
    coachesByTeam[t.id] = list
  }

  const isSubscribed =
    !!user.subscription_type &&
    !!user.subscription_expires_at &&
    new Date(user.subscription_expires_at) > new Date()

  const tokens = user.analysis_tokens ?? 0
  const onInitiatedTeam = await userHasInitiatedTeam(user.id)

  function scoreColor(score: number) {
    if (score >= 8) return 'text-green-400'
    if (score >= 6) return 'text-ember-400'
    return 'text-red-400'
  }

  const fullName = user.first_name && user.last_initial
    ? `${user.first_name} ${user.last_initial}`
    : null
  const hasName = !!fullName
  const tokenPrice = onInitiatedTeam ? '1.49' : '2.79'

  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <JoinTeamPopup hasTeam={teams.length > 0} hasName={hasName} />

      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-8 flex-1">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow text-ember-400">Player Account</p>
            <h1 className="font-display font-black uppercase text-3xl leading-tight mt-1">
              {fullName || user.nickname || 'Your Account'}
            </h1>
            <p className="text-chalk-dim text-sm mt-1 truncate">{user.email}</p>
          </div>
          <LogoutButton />
        </header>

        {/* ── Shot tokens ────────────────────────────────────────── */}
        <section className="bg-ink-900 border border-courtline rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <h2 className="eyebrow text-chalk-dim">Shot Tokens</h2>
            <InfoTip label="What are shot tokens?" align="left">
              1 token = 1 AI shot analysis. Every training ball from the shop
              includes 5 free tokens, or you can buy single tokens here for
              ${tokenPrice} each.
            </InfoTip>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-2">
              {isSubscribed ? (
                <span className="font-display font-black text-3xl text-gradient-ember">Unlimited</span>
              ) : (
                <>
                  <span className="font-numeric font-black text-4xl">{tokens}</span>
                  <span className="text-chalk-dim text-sm">token{tokens !== 1 ? 's' : ''} left</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {!isSubscribed && <BuyTokenButton isInApp={isInApp} initiated={onInitiatedTeam} />}
              <Link
                href="/analyze"
                className="bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold text-sm px-5 py-2.5 rounded-full transition-colors"
              >
                Analyze a Shot
              </Link>
            </div>
          </div>
          {!isSubscribed && !isInApp && (
            <p className="text-chalk-dim text-xs mt-3">
              Tip: every{' '}
              <Link href="/shop" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">
                training ball
              </Link>{' '}
              comes with 5 free analyses.
            </p>
          )}
        </section>

        {/* ── Profile ────────────────────────────────────────────── */}
        <section className="bg-ink-900 border border-courtline rounded-2xl p-5 space-y-5">
          <h2 className="eyebrow text-chalk-dim">Profile</h2>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Display name</h3>
              <InfoTip label="What is my display name used for?" align="left">
                Shown on team rosters, leaderboards, and any certificates you
                earn. Just your first name and last initial — never your full
                name.
              </InfoTip>
              {!hasName && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-ember-400 bg-ember-500/10 border border-ember-500/30 rounded-full px-2 py-0.5">
                  Not set
                </span>
              )}
            </div>
            <NameForm
              currentFirstName={user.first_name ?? null}
              currentLastInitial={user.last_initial ?? null}
            />
          </div>

          <div className="border-t border-courtline" />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Nickname</h3>
              <InfoTip label="What is my nickname used for?" align="left">
                Optional handle (like &ldquo;Buckets&rdquo;). It&apos;s shown on your
                account instead of your email if you haven&apos;t set a display
                name.
              </InfoTip>
            </div>
            <NicknameForm current={user.nickname ?? null} />
          </div>
        </section>

        {/* ── Teams ──────────────────────────────────────────────── */}
        <section className="bg-ink-900 border border-courtline rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="eyebrow text-chalk-dim">{teams.length === 1 ? 'My Team' : 'My Teams'}</h2>
            <InfoTip label="How do teams work?" align="left">
              Joining a team puts you on its leaderboard and lets your coach
              follow your progress. Ask your coach for the team code — you can
              be on more than one team.
            </InfoTip>
          </div>

          {teams.map((t) => {
            const teamCoaches = coachesByTeam[t.id] ?? []
            return (
              <div key={t.id} className="bg-ink-800 border border-courtline rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-chalk">{t.name}</p>
                    <p className="text-chalk-dim text-xs mt-0.5">
                      Team code:{' '}
                      <span className="font-mono font-semibold text-chalk">{t.access_code}</span>
                    </p>
                  </div>
                  <LeaveTeamButton teamId={t.id} teamName={t.name} />
                </div>
                {teamCoaches.length > 0 && (
                  <p className="text-xs text-chalk-dim">
                    <span className="font-semibold uppercase tracking-wide">
                      {teamCoaches.length === 1 ? 'Coach' : 'Coaches'}:
                    </span>{' '}
                    <span className="text-chalk">{teamCoaches.join(', ')}</span>
                  </p>
                )}
                <Link
                  href={`/dashboard/leaderboard?team=${t.id}`}
                  className="inline-block text-sm font-semibold text-ember-400 hover:text-ember-500 transition-colors"
                >
                  View Team Leaderboard →
                </Link>
              </div>
            )
          })}

          <div className="space-y-2 pt-1">
            <p className="text-sm text-chalk-dim">
              {teams.length === 0
                ? 'Have a team code? Enter it to join your team.'
                : 'Have another team code? Join another team — handy for house or summer league.'}
            </p>
            <JoinTeamForm hasName={hasName} />
          </div>
        </section>

        {/* ── Shot history ───────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="eyebrow text-chalk-dim">Shot History</h2>
            <InfoTip label="How do shot scores work?" align="left">
              Every shot you&apos;ve analyzed, newest first. Scores are out of
              10 — tap a shot to see its full breakdown.
            </InfoTip>
          </div>

          {submissions.length === 0 ? (
            <div className="text-center py-16 space-y-4 bg-ink-900 border border-courtline rounded-2xl">
              <div className="text-5xl">🏀</div>
              <p className="text-chalk font-semibold">No shots analyzed yet</p>
              <Link
                href="/analyze"
                className="inline-block bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-6 py-3 rounded-full transition-colors"
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
                      className="flex-1 min-w-0 flex items-center gap-4 bg-ink-900 border border-courtline hover:border-ember-500/60 rounded-xl p-4 transition-colors group"
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt="Shot frame"
                          className="w-16 h-16 object-cover rounded-lg shrink-0 bg-ink-800"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-ink-800 rounded-lg shrink-0 flex items-center justify-center text-2xl">🏀</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-chalk-dim">{date}</p>
                        <p className="text-chalk font-semibold text-sm mt-0.5 group-hover:text-ember-400 transition-colors">
                          View Shot Breakdown →
                        </p>
                      </div>
                      {score !== null && !Number.isNaN(score) ? (
                        <div className={`font-numeric text-2xl font-black shrink-0 ${scoreColor(score)}`}>
                          {score.toFixed(1)}
                        </div>
                      ) : (
                        <div className="text-chalk-dim/50 text-sm shrink-0">—</div>
                      )}
                    </Link>
                    <DeleteSubmissionButton id={sub.id} />
                  </div>
                )
              })}
              <div className="text-center pt-2">
                <Link
                  href="/analyze"
                  className="inline-block bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-8 py-3 rounded-full transition-colors"
                >
                  + Analyze Another Shot
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* ── Danger zone ────────────────────────────────────────── */}
        <section className="border border-red-500/20 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-chalk">Delete account</h2>
            <p className="text-chalk-dim text-xs mt-1">
              Permanently removes your account and all shot history. This cannot be undone.
            </p>
          </div>
          <DeleteAccountButton />
        </section>
      </div>
      <SiteFooter />
    </main>
  )
}
