import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'Our Mission | LearnHoops',
  description:
    'Building better shooters, developing smarter players. Why LearnHoops exists: helping young basketball players understand their shot, not just take more of them.',
  alternates: { canonical: '/mission' },
  openGraph: {
    title: 'Our Mission | LearnHoops',
    description:
      'Building better shooters, developing smarter players. We don’t just learn to hoop — we hoop to learn.',
    url: '/mission',
    images: ['/mission/coach-and-player.jpg'],
  },
}

// The three lines of the philosophy, kept as data so the markup below stays
// one map instead of three near-identical blocks.
const PHILOSOPHY = [
  { lead: 'Every shot', rest: 'is an opportunity to improve.' },
  { lead: 'Every mistake', rest: 'is an opportunity to understand.' },
  { lead: 'Every player', rest: 'has the ability to get better.' },
]

export default function MissionPage() {
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />

      {/* Hero — the headline and the photo share the fold, so the mission
          reads as something people do rather than a page of copy. */}
      <section className="px-4 pt-14 pb-12 sm:pt-20 sm:pb-16">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-center">
          <div>
            <p className="eyebrow text-ember-400 mb-4 select-none">Our mission</p>
            <h1 className="font-display font-black uppercase text-[clamp(2.1rem,5.5vw,4rem)] leading-[0.95]">
              Building better shooters.
              <br />
              <span className="text-gradient-ember">Developing smarter players.</span>
            </h1>
            <p className="text-chalk-dim text-base sm:text-lg leading-relaxed mt-6 max-w-xl">
              At LearnHoops, our mission is simple: help the next generation of basketball
              players become better shooters by helping them understand their shot.
            </p>
          </div>

          {/* Shown whole, capped by WIDTH. A height cap plus object-cover
              crops a 1322x2048 portrait to a letterbox and cuts the two
              people out of their own photo — heads at narrow widths, both
              faces at desktop. Constrain the width and let the height follow. */}
          <div className="mx-auto w-full max-w-[20rem] sm:max-w-[22rem]">
            <Image
              src="/mission/coach-and-player.jpg"
              alt="A LearnHoops coach on the court with a young player holding a LearnHoops training basketball"
              width={1322}
              height={2048}
              // Above the fold on this page, so it should not lazy-load.
              priority
              sizes="(max-width: 640px) 20rem, 22rem"
              className="w-full h-auto rounded-3xl border border-courtline"
            />
          </div>
        </div>
      </section>

      {/* The body of the mission. */}
      <section className="px-4 py-14 sm:py-20 border-t border-courtline">
        <div className="max-w-3xl mx-auto space-y-6">
          <p className="text-chalk-dim text-base sm:text-lg leading-relaxed">
            We built LearnHoops because young players are often told to &ldquo;shoot
            more,&rdquo; but rarely shown exactly what they need to improve and why.
          </p>

          <p className="font-display font-black uppercase text-[clamp(1.4rem,3.5vw,2.1rem)] leading-tight">
            Our goal is to <span className="text-gradient-ember">change that</span>.
          </p>

          <p className="text-chalk-dim text-base sm:text-lg leading-relaxed">
            By combining basketball knowledge with modern technology, LearnHoops gives players
            meaningful feedback they can actually use. We help athletes recognize the small
            details in their shooting form, understand their strengths and weaknesses, and learn
            how to make adjustments with purpose.
          </p>

          {/* The turn of the argument — pulled out of the prose so it lands. */}
          <div className="border-l-2 border-ember-500 pl-5 sm:pl-6 py-1 space-y-2">
            <p className="text-chalk-dim text-base sm:text-lg leading-relaxed">
              Because becoming a great shooter isn&rsquo;t only about taking thousands of shots.
            </p>
            <p className="text-chalk text-lg sm:text-xl font-bold leading-relaxed">
              It&rsquo;s about learning from every shot.
            </p>
          </div>

          <p className="text-chalk-dim text-base sm:text-lg leading-relaxed">
            We want young athletes to become more confident, more knowledgeable, and more
            independent in their development &mdash; giving every player access to the type of
            feedback and understanding that can help unlock their potential.
          </p>
        </div>
      </section>

      {/* Philosophy */}
      <section className="px-4 py-14 sm:py-20 border-t border-courtline bg-ink-900">
        <div className="max-w-3xl mx-auto">
          <p className="eyebrow text-hardwood mb-4 select-none">Our philosophy</p>
          <h2 className="font-display font-black uppercase text-[clamp(1.7rem,4.5vw,3rem)] leading-[0.95]">
            We don&rsquo;t just learn to hoop.
            <br />
            <span className="text-gradient-ember">We hoop to learn.</span>
          </h2>

          <ul className="mt-9 space-y-4">
            {PHILOSOPHY.map(line => (
              <li key={line.lead} className="flex items-baseline gap-3">
                <span aria-hidden className="text-ember-500 font-black shrink-0">
                  &mdash;
                </span>
                <p className="text-base sm:text-lg leading-relaxed">
                  <span className="font-bold text-chalk">{line.lead}</span>{' '}
                  <span className="text-chalk-dim">{line.rest}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing line + the one action the page should lead to. */}
      <section className="grain relative text-center px-4 py-20 sm:py-28 bg-ember-500 text-ink-950">
        <p className="font-display font-black uppercase text-[clamp(1.6rem,4.5vw,3rem)] leading-[0.95] max-w-3xl mx-auto">
          Understand your shot.
          <br />
          Unlock your potential.
        </p>
        <Link
          href="/analyze"
          className="inline-block mt-9 bg-ink-950 hover:bg-ink-800 active:scale-[0.98] text-chalk font-bold px-8 py-4 rounded-full text-base transition-all"
        >
          Analyze your shot &rarr;
        </Link>
      </section>

      <SiteFooter />
    </main>
  )
}
