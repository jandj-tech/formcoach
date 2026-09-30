import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { userTier } from '@/lib/team-features'
import { getPlayerSubscription, subscriptionEntitled } from '@/lib/player-subscription'
import { effectivePlan } from '@/lib/player-entitlement'
import { applyEmailEntitlement, hasPendingEntitlement } from '@/lib/email-entitlements'

export async function GET(req: NextRequest) {
  // 1. Player session — also returns token/subscription info used elsewhere.
  // getSessionFromRequest checks the cookie first (web unchanged) and falls
  // back to the mobile app's Bearer JWT so native screens see login state.
  const session = await getSessionFromRequest(req)
  if (session) {
    type UserRow = {
      id: string
      email: string
      subscription_type: string | null
      subscription_expires_at: string | null
      analysis_tokens?: number
      free_analysis_used?: boolean | null
      first_name?: string | null
      last_initial?: string | null
      nickname?: string | null
      email_verified_at?: string | null
    }

    // The analysis_tokens column may not exist yet if the DB migration
    // hasn't been applied — fall back to the legacy column set. The name
    // columns ride along for the app's native Settings screen.
    let user: UserRow | undefined
    try {
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at, analysis_tokens, free_analysis_used, first_name, last_initial, nickname, email_verified_at
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/(analysis_tokens|free_analysis_used|first_name|last_initial|nickname|email_verified_at).*does not exist/i.test(msg)) throw err
      console.warn('users.analysis_tokens column missing — run `npm run migrate`.')
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    }

    if (user) {
      let isSubscribed =
        !!user.subscription_type &&
        !!user.subscription_expires_at &&
        new Date(user.subscription_expires_at) > new Date()

      // Admin complimentary grants land in email_list, keyed on an address.
      // A grant made after the account existed is synced here — but ONLY onto
      // an account that has proven it owns that inbox (email_verified_at).
      // Anyone can sign up with any address, so syncing on the address alone
      // handed the comp to whoever registered it first. An unverified account
      // with a comp waiting is told so (pendingEntitlement) and activates it
      // from the emailed confirmation link.
      let pendingEntitlement = false
      if (!isSubscribed) {
        if (user.email_verified_at) {
          isSubscribed = await applyEmailEntitlement(user.id)
        } else {
          pendingEntitlement = await hasPendingEntitlement(user.id)
        }
      }

      // The Player/Pro plan (2026 pricing) — legacy subscription_type holders
      // above stay grandfathered-unlimited and never carry a plan.
      const [playerSub, eff] = await Promise.all([
        getPlayerSubscription(user.id),
        effectivePlan(user.id),
      ])
      const planEntitled = subscriptionEntitled(playerSub)
      // An org-sponsored seat (lib/player-entitlement.ts) that is the ACTIVE
      // source. `plan` below is the EFFECTIVE plan on purpose: shipped iOS
      // builds hide their Apple paywall whenever user.plan is set, so a
      // club-covered player never sees a purchase prompt — no new build needed.
      const orgSeat = eff.source === 'org' && eff.plan && eff.orgName ? eff : null

      const tokens = user.analysis_tokens ?? 0
      // `subscribed` is a shipped wire field older app builds gate Analyze on:
      // "this account can reach the analyze flow". An entitled plan counts —
      // if they're at their cap the analyze POST returns the structured 402.
      const subscribed = isSubscribed || planEntitled || !!orgSeat || tokens > 0

      // Whether the player is on a team — drives the "ask your coach" option.
      let onTeam = false
      try {
        const rows = (await db`
          SELECT 1 FROM team_memberships WHERE user_id = ${user.id} LIMIT 1
        `) as unknown as unknown[]
        onTeam = rows.length > 0
      } catch {
        // team_memberships table may not exist yet
      }

      // Being on an ENTITLED team is the test: no roster minimum, but a team
      // whose organization has lapsed no longer earns the team rate. Kept under
      // the name `onInitiatedTeam` on purpose — it is a wire field that
      // already-shipped iOS builds and lib/useAnalysisPrice.ts read. Change
      // what it means, never what it is called.
      const tier = onTeam ? await userTier(user.id) : 'none'
      const onInitiatedTeam = tier !== 'none'

      // The free signup analysis has been discontinued — no account gets a
      // free upload, so this is always false.
      const freeUpload = false

      // App builds ≤14 gate the Analyze tab on tokens > 0 and predate the
      // freeUpload flag, so the free analysis is presented to them as a
      // token. Build 15+ label the free analysis distinctly and must see
      // real numbers (a virtual token would show a bogus "1 TOKEN" badge on
      // Home). iOS native UAs look like "LearnHoops/<build> CFNetwork/…";
      // if the format ever differs, no inflation — new builds stay correct
      // and old builds just fall back to their pre-existing paywall.
      const buildMatch = (req.headers.get('user-agent') ?? '').match(/\bLearnHoops\/(\d+)\b/)
      const legacyAppBuild = !!buildMatch && parseInt(buildMatch[1], 10) <= 14
      const appTokens = legacyAppBuild && freeUpload ? tokens + 1 : tokens

      return NextResponse.json({
        // orgTier is the web client's field; onInitiatedTeam stays a boolean
        // for already-shipped iOS builds that read it.
        user: {
          id: user.id,
          email: user.email,
          subscribed,
          tokens: appTokens,
          onTeam,
          onInitiatedTeam,
          orgTier: tier,
          freeUpload,
          firstName: user.first_name ?? null,
          lastInitial: user.last_initial ?? null,
          nickname: user.nickname ?? null,
          // New fields (additive — old builds ignore them): the Player/Pro
          // plan when one is entitled, for the app's Home/Settings surfaces.
          plan: orgSeat ? orgSeat.plan : planEntitled ? playerSub.plan : null,
          planStatus: orgSeat ? 'active' : playerSub?.status ?? null,
          // Org-sponsored membership (additive): who covers the plan and until
          // when, and who bills the active entitlement. Display only — the app
          // never sells or assigns seats.
          sponsor: orgSeat
            ? { orgName: orgSeat.orgName!, plan: orgSeat.plan!, endsAt: orgSeat.endsAt ? orgSeat.endsAt.toISOString() : null }
            : null,
          billedVia: orgSeat ? 'org' : eff.billedVia,
          // A comp is waiting on this address until the inbox is confirmed.
          ...(pendingEntitlement ? { pendingEntitlement: true } : {}),
        },
        account: { type: 'player', dashboard: '/dashboard' },
      })
    }
  }

  // 2. Coach / organization sessions. The mobile app authenticates these over
  // Bearer (the FromRequest getters read cookie first, then Authorization), and
  // it drives its own screens off `account` — so it needs the display name and
  // the spendable balance that funds in-app "analyze my own shot" uploads
  // (coach_credits for a coach, organizations.token_balance for an org).
  const teamSession = await getTeamSessionFromRequest(req)
  if (teamSession) {
    let name: string | null = null
    let credits = 0
    try {
      const [team] = (await db`
        SELECT name FROM teams WHERE id = ${teamSession.teamId}
      `) as unknown as [{ name: string | null } | undefined]
      name = team?.name ?? null
      const [cc] = (await db`
        SELECT COALESCE(credits, 0)::int AS credits
        FROM coach_credits WHERE LOWER(email) = ${teamSession.adminEmail.toLowerCase()}
      `) as unknown as [{ credits: number } | undefined]
      credits = cc?.credits ?? 0
    } catch {
      // coach_credits may not exist in old environments — report zero balance.
    }
    return NextResponse.json({
      user: null,
      account: { type: 'team', dashboard: '/team/dashboard', teamId: teamSession.teamId, email: teamSession.adminEmail, name, credits },
    })
  }

  const orgSession = await getOrgSessionFromRequest(req)
  if (orgSession) {
    let name: string | null = null
    let credits = 0
    try {
      const [org] = (await db`
        SELECT name, COALESCE(token_balance, 0)::int AS token_balance
        FROM organizations WHERE id = ${orgSession.orgId}
      `) as unknown as [{ name: string | null; token_balance: number } | undefined]
      name = org?.name ?? null
      credits = org?.token_balance ?? 0
    } catch {
      // Defensive: report zero balance rather than failing the session check.
    }
    return NextResponse.json({
      user: null,
      account: { type: 'org', dashboard: '/org/dashboard', orgId: orgSession.orgId, email: orgSession.adminEmail, name, credits },
    })
  }

  return NextResponse.json({ user: null, account: null })
}
