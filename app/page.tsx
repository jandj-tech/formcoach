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
    desc: '12 frames studied across 17 coaching criteria, the same fundamentals real coaches teach.',
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
          Upload a video of your shot. Our AI studies 12 frames and scores 17 key form criteria —
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

        {/* Stat strip */}
        <div className="flex items-center justify-center gap-8 sm:gap-14 mt-14 select-none">
          {[
            { value: '17', label: 'coaching criteria' },
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

      {/* Closing CTA — solid ember band for a hard color break before the footer */}
      <section className="grain relative text-center px-4 py-20 sm:py-28 bg-ember-500 text-white">
        <p className="eyebrow text-ink-950 mb-4 select-none">04 — Your move</p>
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
      </section>

      <div className="flex-1" />

      <SiteFooter />
    </main>
  )
}
