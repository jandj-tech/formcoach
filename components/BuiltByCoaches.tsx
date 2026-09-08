import Image from 'next/image'
import Link from 'next/link'

/**
 * The one credibility signal on /shop and /pricing.
 *
 * Both pages carried none: no faces, no names, nothing saying who is behind
 * either the ball or the 18 criteria — while a cold visitor from an ad is being
 * asked for $48.95 or a monthly plan. Going from zero to ONE authentic signal
 * is the biggest step available here.
 *
 * Everything below is first-party fact supplied by the founders. There are no
 * testimonials, star ratings or counts, because no genuine ones exist yet —
 * inventing them would be both a lie and a Merchant Center manual-action risk
 * (see the deliberate absence of aggregateRating in app/shop/page.tsx).
 */
export default function BuiltByCoaches({ className = '' }: { className?: string }) {
  return (
    <section className={`px-4 py-12 sm:py-16 ${className}`}>
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6 sm:gap-8 items-center">
        <div className="relative aspect-[4/3] sm:aspect-square w-full rounded-2xl overflow-hidden border border-courtline">
          <Image
            src="/mission/coach-and-player.jpg"
            alt="A LearnHoops coach on the court with a young player holding a LearnHoops training basketball"
            fill
            className="object-cover"
            sizes="(min-width: 640px) 220px, 100vw"
          />
        </div>

        <div className="space-y-3">
          <p className="eyebrow text-ember-400 select-none">Who makes this</p>
          <h2 className="font-display font-black uppercase text-[clamp(1.4rem,3vw,2rem)] text-chalk leading-[0.95]">
            Built by two coaches
          </h2>
          <p className="text-chalk-dim text-sm leading-relaxed max-w-xl">
            LearnHoops is <span className="text-chalk font-semibold">Joseph Moskoske</span> and{' '}
            <span className="text-chalk font-semibold">Megh Gandhi</span> — the two of us. We
            designed the ball, we wrote the 18 criteria the AI grades against, we pack the orders,
            and we answer the support email. The grip lines are on the ball because they are what
            we correct most often on the floor, and players at Maple Basketball in Vaughan train
            with it every week.
          </p>
          <p className="text-chalk-dim text-sm leading-relaxed max-w-xl">
            Not sure about sizing, or whether this suits your player?{' '}
            <Link href="/support" className="text-ember-400 underline hover:text-ember-300">
              Ask us
            </Link>{' '}
            — you will get one of us, not a help desk.
          </p>
        </div>
      </div>
    </section>
  )
}
