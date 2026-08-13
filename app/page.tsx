import Link from 'next/link'
import Image from 'next/image'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import CriteriaShowcase, { type Criterion } from '@/components/CriteriaShowcase'
import { db } from '@/lib/db'
import { getCriteriaVideoMap } from '@/lib/youtube'
import { getSession } from '@/lib/auth'

const MARQUEE_TERMS = [
  'Form analysis',
  'Release',
  'Shot arc',
  'Follow-through',
  'Balance',
  'Guide hand',
  'Backspin',
  'Footwork',
  'Elbow alignment',
  'Shot pocket',
]

const STEPS = [
  {
    num: '01',
    title: 'Upload your video',
    desc: 'Any angle, any device. MP4 or MOV — straight from your phone.',
  },
  {
    num: '02',
    title: 'AI analyzes your form',
    desc: '12 frames studied across 18 coaching criteria, the same fundamentals real coaches teach.',
  },
  {
    num: '03',
    title: 'Get your results',
    desc: 'A private breakdown lands in your email with scores and tips for every criterion.',
  },
]

export default async function HomePage() {
  const session = await getSession()

  // The welcome banner shows the user's nickname, falling back to their email.
  let welcomeName = session?.email ?? ''
  if (session) {
    try {
      const [u] = (await db`
        SELECT nickname FROM users WHERE id = ${session.userId}
      `) as unknown as [{ nickname: string | null } | undefined]
      if (u?.nickname) welcomeName = u.nickname
    } catch {
      // nickname column may not exist yet — keep the email fallback
    }
  }

  const criteria = (await db`
    SELECT id, name, description
    FROM criteria
    WHERE active = true
    ORDER BY order_index
  `) as unknown as Criterion[]

  const videoMap = await getCriteriaVideoMap(criteria.map((c) => c.name))

  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />

      {session && (
        <div className="bg-ember-500 text-ink-950 text-center text-sm font-bold py-2 px-4">
          Welcome: {welcomeName}
        </div>
      )}

      {/* Hero */}
      <section className="hero-glow grain relative flex flex-col items-center justify-center text-center px-4 pt-20 pb-16 sm:pt-28 sm:pb-24 min-h-[72svh]">
        <div className="inline-flex items-center gap-2 bg-ember-500/10 border border-ember-500/30 rounded-full px-4 py-1.5 mb-7 select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-ember-500 animate-pulse" aria-hidden />
          <span className="text-ember-400 eyebrow">AI Shot Analysis</span>
        </div>
        <h1 className="font-display font-black uppercase text-[clamp(2rem,7.5vw,5.5rem)] leading-[0.95] max-w-5xl">
          Get your shot
          <br />
          <span className="text-gradient-ember">professionally analyzed</span>
        </h1>
        <p className="text-chalk-dim text-base sm:text-xl mt-6 max-w-xl leading-relaxed px-2">
          Upload a video of your shot. Our AI studies 12 frames and scores 18 key form criteria —
          instantly.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-10 w-full max-w-md sm:w-auto px-2">
          <Link
            href="/analyze"
            className="bg-ember-500 hover:bg-ember-400 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full text-base transition-all text-center shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
          >
            Analyze your shot →
          </Link>
          <Link
            href="/shop"
            className="border border-courtline hover:border-chalk-dim active:scale-[0.98] text-chalk font-bold px-8 py-4 rounded-full text-base transition-all text-center"
          >
            Shop the ball →
          </Link>
        </div>

        {!session && (
          <p className="text-ember-400 text-sm font-bold mt-5">
            Your first shot analysis is free — sign up and upload your video.
          </p>
        )}

        {/* Stat strip */}
        <div className="flex items-center justify-center gap-8 sm:gap-14 mt-14 select-none">
          {[
            { value: '18', label: 'coaching criteria' },
            { value: '12', label: 'frames per shot' },
            { value: '100%', label: 'private results' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-numeric text-3xl sm:text-4xl font-medium text-chalk">
                {stat.value}
              </div>
              <div className="w-8 h-0.5 bg-hardwood mx-auto mt-2" aria-hidden />
              <div className="eyebrow text-chalk-dim mt-2">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Marquee strip */}
      <div className="marquee border-y border-courtline py-3.5 select-none" aria-hidden>
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0">
              {MARQUEE_TERMS.map((term) => (
                <span
                  key={`${copy}-${term}`}
                  className="eyebrow text-chalk-dim whitespace-nowrap px-6 flex items-center gap-6"
                >
                  {term}
                  <span className="text-ember-500">●</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Steps — warm chalk band so the section rhythm reads dark → light → dark */}
      <section className="bg-chalk text-ink-950">
        <div className="px-4 py-20 sm:py-28 max-w-6xl mx-auto w-full">
          <div className="mb-12">
            <p className="eyebrow text-ember-700 mb-3 select-none">01 — How it works</p>
            <h2 className="font-display font-black uppercase text-[clamp(1.9rem,4.5vw,3.5rem)] leading-[0.95]">
              Three steps to
              <br />a better shot
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="fade-up card-lift bg-white rounded-2xl p-6 sm:p-8 border border-ink-950/10 shadow-sm"
              >
                <div className="font-numeric text-ember-700 text-lg mb-6 select-none">{step.num}</div>
                <h3 className="font-display font-bold uppercase text-lg mb-2 leading-tight">
                  {step.title}
                </h3>
                <p className="text-ink-950/60 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Teams using the software */}
      <section className="px-4 py-16 sm:py-20 bg-ink-900 border-b border-courtline">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-10">
            <p className="eyebrow text-hardwood mb-3 select-none">02 — Trusted on the court</p>
            <h2 className="font-display font-black uppercase text-[clamp(1.9rem,4.5vw,3.5rem)] leading-[0.95]">
              Used by teams &amp; academies
            </h2>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            {[
              { name: 'Maple Basketball', location: 'Vaughan, ON', logo: '/maple-basketball-logo.png' },
            ].map((org) => (
              <div
                key={org.name}
                className="card-lift flex items-center gap-4 bg-ink-800 border border-courtline rounded-2xl px-6 py-4"
              >
                <Image
                  src={org.logo}
                  alt={org.name + ' logo'}
                  width={56}
                  height={56}
                  className="object-contain rounded-xl"
                />
                <div>
                  <p className="text-chalk text-base font-bold leading-tight">{org.name}</p>
                  <p className="text-chalk-dim text-sm">{org.location}</p>
                </div>
              </div>
            ))}
            <Link
              href="/team"
              className="text-sm font-semibold text-ember-400 hover:text-ember-500 transition-colors px-2 py-3 inline-flex items-center"
            >
              Bring LearnHoops to your organization →
            </Link>
          </div>
        </div>
      </section>

      <CriteriaShowcase criteria={criteria} videoMap={videoMap} />

      {/* Shop teaser — surfaces the gear so visitors know the shop exists */}
      <section className="px-4 py-16 sm:py-24 border-t border-courtline">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-hardwood mb-3 select-none">04 — The gear</p>
              <h2 className="font-display font-black uppercase text-[clamp(1.9rem,4.5vw,3.5rem)] leading-[0.95]">
                Train with gear that
                <br />
                teaches your hands
              </h2>
            </div>
            <Link
              href="/shop"
              className="text-sm font-semibold text-ember-400 hover:text-ember-500 transition-colors py-2"
            >
              Visit the shop →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Training ball */}
            <Link
              href="/shop"
              className="card-lift group bg-ink-900 border border-courtline rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="relative aspect-[4/3] bg-white">
                <Image
                  src="/training-ball.png"
                  alt="The LearnHoops Training Ball"
                  fill
                  className="object-contain p-4"
                  sizes="(min-width: 640px) 50vw, 100vw"
                />
              </div>
              <div className="p-6 flex items-start justify-between gap-4 flex-1">
                <div>
                  <h3 className="font-display font-bold uppercase text-lg text-chalk leading-tight">
                    The Training Ball
                  </h3>
                  <p className="text-chalk-dim text-sm mt-1.5 leading-relaxed">
                    Grip lines mark where your fingers belong — every rep grooves your release.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-numeric text-xl text-chalk">$39.99</div>
                  <span className="text-ember-400 group-hover:text-ember-500 text-sm font-bold transition-colors">
                    Shop →
                  </span>
                </div>
              </div>
            </Link>

            {/* Portable net — coming soon */}
            <Link
              href="/shop#portable-net"
              className="card-lift group bg-ink-900 border border-courtline rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="grain relative aspect-[4/3] flex flex-col items-center justify-center gap-3 select-none">
                <span className="inline-flex items-center gap-2 bg-ember-500/10 border border-ember-500/30 rounded-full px-4 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-ember-500 animate-pulse" aria-hidden />
                  <span className="text-ember-400 eyebrow">Coming soon</span>
                </span>
                <p className="wordmark-outline font-display font-black uppercase leading-none text-[clamp(2.2rem,6vw,3.5rem)]">
                  The Net
                </p>
              </div>
              <div className="p-6 flex items-start justify-between gap-4 flex-1">
                <div>
                  <h3 className="font-display font-bold uppercase text-lg text-chalk leading-tight">
                    Throw-On Portable Net
                  </h3>
                  <p className="text-chalk-dim text-sm mt-1.5 leading-relaxed">
                    All-weather mesh that throws onto any rim in seconds — no tools, no ladder.
                  </p>
                </div>
                <span className="text-ember-400 group-hover:text-ember-500 text-sm font-bold shrink-0 transition-colors">
                  Preview →
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* What LearnHoops is, in the words people search for it. Real copy for
          visitors who scrolled this far — and the keyword coverage search
          engines index the page by. */}
      <section className="px-4 py-16 sm:py-20 border-t border-courtline">
        <div className="max-w-3xl mx-auto space-y-5">
          <h2 className="font-display font-black uppercase text-[clamp(1.6rem,4vw,2.5rem)] leading-tight">
            AI basketball shot analysis for real players
          </h2>
          <p className="text-chalk-dim text-sm sm:text-base leading-relaxed">
            LearnHoops is an AI basketball coach that analyzes your shooting form from a single
            video. Film one jump shot on your phone, upload it, and in minutes the AI grades your
            shot against 18 coaching criteria — stance, elbow alignment, shot pocket, release,
            follow-through, arc, and more — then tells you exactly what to fix and the drill that
            fixes it. It&apos;s the feedback of a private shooting coach, on demand, for less than
            two dollars a shot — and your first analysis is free.
          </p>
          <p className="text-chalk-dim text-sm sm:text-base leading-relaxed">
            It works for everyone who wants a better jump shot: youth players building form from
            scratch, high-school shooters breaking bad habits, and coaches running whole teams —
            with rosters, shared credits, and team pricing built in. Pair it with the LearnHoops
            Training Basketball, whose printed finger-placement guides groove correct hand position
            on every rep between analyses.
          </p>
        </div>
      </section>

      {/* Closing CTA — solid ember band for a hard color break before the footer */}
      <section className="grain relative text-center px-4 py-20 sm:py-28 bg-ember-500 text-white">
        <p className="eyebrow text-ink-950 mb-4 select-none">05 — Your move</p>
        <h2 className="font-display font-black uppercase text-[clamp(2.2rem,6vw,5rem)] leading-[0.95] max-w-3xl mx-auto">
          Ready to fix
          <br />
          <span className="text-ink-950">your shot?</span>
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 mt-10 justify-center items-center">
          <Link
            href="/analyze"
            className="bg-ink-950 hover:bg-ink-800 active:scale-[0.98] text-chalk font-bold px-8 py-4 rounded-full text-base transition-all text-center w-full max-w-xs sm:w-auto"
          >
            Analyze your shot →
          </Link>
          <Link
            href="/team"
            className="border border-ink-950/50 hover:border-ink-950 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full text-base transition-all text-center w-full max-w-xs sm:w-auto"
          >
            For teams &amp; organizations
          </Link>
        </div>
        {!session && (
          <p className="mt-6 text-ink-950 font-bold text-sm">
            New here? Your first analysis is free.
          </p>
        )}
        <p className="mt-8 text-sm">
          <Link
            href="/support#faq"
            className="font-semibold text-ink-950 underline underline-offset-4 hover:text-ink-800 transition-colors"
          >
            Questions? Read the FAQ →
          </Link>
        </p>
      </section>

      <div className="flex-1" />

      <SiteFooter />
    </main>
  )
}
