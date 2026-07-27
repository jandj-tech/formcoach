import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import Link from 'next/link'

export default function TeamLandingPage() {
  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />

      {/* Hero */}
      <div className="hero-glow grain relative flex flex-col items-center text-center px-6 pt-16 pb-14 space-y-10">
        <div className="space-y-5 max-w-2xl">
          <p className="eyebrow text-ember-400 select-none">For clubs, schools &amp; academies</p>
          <h1 className="font-display font-black uppercase text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.95]">
            LearnHoops <span className="text-gradient-ember">Team Plan</span>
          </h1>
          <p className="text-chalk-dim text-lg">
            Get your whole team analyzed. AI grades every player&apos;s shot form — see who&apos;s ranked best and who&apos;s improving the most.
          </p>
          <div className="pt-2">
            <Link
              href="/org/signup"
              className="inline-block bg-ember-500 hover:bg-ember-600 active:scale-[0.98] text-white font-bold px-8 py-4 rounded-full transition-all shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
            >
              Register Organization
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full text-left">
          <div className="card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="font-numeric text-3xl text-ember-500">$1.49</div>
            <div className="font-display font-bold uppercase text-chalk">Per upload</div>
            <div className="text-chalk-dim text-sm">Buy credits and use them when you need them.</div>
          </div>
          <div className="card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="text-2xl select-none">🏆</div>
            <div className="font-display font-bold uppercase text-chalk">Player rankings</div>
            <div className="text-chalk-dim text-sm">Every player ranked by their best shot score so you always know where everyone stands.</div>
          </div>
          <div className="card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="text-2xl select-none">📈</div>
            <div className="font-display font-bold uppercase text-chalk">Most improved</div>
            <div className="text-chalk-dim text-sm">Track who&apos;s putting in the work with automatic improvement tracking.</div>
          </div>
        </div>
      </div>

      {/* CTA band */}
      <div className="bg-ink-900 border-y border-courtline w-full py-10 flex flex-col items-center gap-6 text-center px-6">
        <p className="font-display font-black uppercase text-xl sm:text-2xl max-w-md leading-tight">
          Ready to take your organization to the next level?
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md sm:w-auto">
          <Link
            href="/org/signup"
            className="bg-ember-500 hover:bg-ember-600 active:scale-[0.98] text-white font-bold px-8 py-4 rounded-full transition-all shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
          >
            Register Organization
          </Link>
          <Link
            href="/login"
            className="border border-courtline hover:border-chalk-dim active:scale-[0.98] text-chalk font-bold px-8 py-4 rounded-full transition-all"
          >
            Log In
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div className="flex flex-col px-6 pt-16 pb-20 max-w-5xl mx-auto w-full space-y-10">
        <div>
          <p className="eyebrow text-ember-400 mb-3 select-none">How it works</p>
          <h2 className="font-display font-black uppercase text-[clamp(1.7rem,4vw,3rem)] leading-[0.95]">
            Three steps to launch
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
          <div className="fade-up card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="font-numeric text-ember-500 text-lg select-none">01</div>
            <div className="font-display font-bold uppercase text-chalk">Register your organization</div>
            <div className="text-chalk-dim text-sm">Create your org account. Get your organization code to link all your teams together.</div>
          </div>
          <div className="fade-up card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="font-numeric text-ember-500 text-lg select-none">02</div>
            <div className="font-display font-bold uppercase text-chalk">Add teams &amp; invite coaches</div>
            <div className="text-chalk-dim text-sm">Add each team with its age group and coach email. Coaches get a setup link automatically.</div>
          </div>
          <div className="fade-up card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="font-numeric text-ember-500 text-lg select-none">03</div>
            <div className="font-display font-bold uppercase text-chalk">Players upload, you track everything</div>
            <div className="text-chalk-dim text-sm">Buy credits for players, watch the leaderboard fill up, and see who&apos;s improving across every team.</div>
          </div>
        </div>

        <Link
          href="/org/signup"
          className="card-lift w-full bg-ember-500 hover:bg-ember-600 rounded-2xl px-6 py-5 flex items-center gap-4 text-white transition-colors"
        >
          <span className="text-3xl shrink-0 select-none">🎓</span>
          <div className="text-left flex-1">
            <p className="font-display font-black uppercase text-base leading-tight">10-Week Shooting Class — for organizations</p>
            <p className="text-orange-100 text-sm mt-1">Each player gets a ball, 2 shot analyses, and a certificate of completion that shows their improvement. Starting at $40/player.</p>
          </div>
          <span className="shrink-0 font-bold text-lg select-none" aria-hidden>→</span>
        </Link>
      </div>

      <div className="flex-1" />
      <SiteFooter />
    </main>
  )
}
