import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import CriteriaShowcase, { type Criterion } from '@/components/CriteriaShowcase'
import { getCriteriaVideoMap } from '@/lib/youtube'
import { db } from '@/lib/db'

export const metadata: Metadata = {
  title: 'How AI Basketball Shot Analysis Works | LearnHoops',
  description:
    'How LearnHoops analyzes your basketball shooting form: filming your jump shot, the 18 coaching criteria the AI grades, and how tokens and teams work.',
  alternates: { canonical: '/learn' },
}

export default async function LearnPage() {
  let criteria: Criterion[] = []
  let videoMap: Record<string, string> = {}
  try {
    criteria = (await db`
      SELECT id, name, description
      FROM criteria
      WHERE active = true
      ORDER BY order_index
    `) as unknown as Criterion[]
    videoMap = await getCriteriaVideoMap(criteria.map((c) => c.name))
  } catch {
    // Page still renders without the criteria cards if the DB is unreachable.
  }

  return (
    <main className="flex flex-col min-h-screen bg-black">
      <TopNav />

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-4 pt-14 pb-10">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
          <span className="text-orange-500 text-xs font-semibold tracking-wider uppercase">The LearnHoops Guide</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight max-w-2xl">
          Learn how it <span className="text-orange-500">works</span>
        </h1>
        <p className="text-gray-400 text-base sm:text-lg mt-4 max-w-lg leading-relaxed">
          Everything about filming your shot, what our AI looks for, and how to get the most out of every analysis.
        </p>
      </section>

      {/* Step 1: Film it right */}
      <section className="px-4 pb-12">
        <div className="max-w-3xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
          <p className="text-orange-500 font-black text-sm uppercase tracking-wider mb-2">Step 1</p>
          <h2 className="text-2xl font-black text-white mb-3">Film your shot the right way</h2>
          <ul className="text-zinc-300 text-sm leading-relaxed space-y-2 list-disc pl-5">
            <li><strong>Stand under or near the net</strong> — directly behind the basket or slightly to the side.</li>
            <li>Make sure the shooter&apos;s <strong>elbow, arms, and hands are visible</strong> for the whole shot.</li>
            <li>Want your arc scored too? Pick an angle where the <strong>ball&apos;s flight path stays in frame</strong>.</li>
            <li><strong>Avoid filming face-on</strong> — key form details are hidden from that angle.</li>
            <li>One shot per video works best. MP4 or MOV, up to 5 minutes.</li>
          </ul>
        </div>
      </section>

      {/* Step 2: What we score */}
      <section className="pb-4">
        <div className="max-w-3xl mx-auto text-center px-4 mb-2">
          <p className="text-orange-500 font-black text-sm uppercase tracking-wider mb-2">Step 2</p>
          <h2 className="text-2xl font-black text-white">What our AI scores</h2>
          <p className="text-gray-400 text-sm mt-2">
            Every analysis grades your form on each of these coaching criteria — tap through to see them all.
          </p>
        </div>
        {criteria.length > 0 && <CriteriaShowcase criteria={criteria} videoMap={videoMap} />}
      </section>

      {/* Step 3: Improve */}
      <section className="px-4 pb-14">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <p className="text-orange-500 font-black text-sm uppercase tracking-wider mb-2">Step 3</p>
            <h3 className="text-xl font-black text-white mb-2">Read your report, then re-test</h3>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Your report shows a score and coaching notes for every criterion. Pick one or two things to work on,
              put in the reps, then analyze again — your history tracks how each part of your form improves over time.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-xl font-black text-white mb-2">Tokens &amp; teams</h3>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Each analysis uses one token. Buy them one at a time, get them included with the{' '}
              <Link href="/shop" className="text-orange-500 underline">training ball</Link>, or join a team —
              coaches and organizations can send tokens straight to their players and track the whole roster from the{' '}
              <Link href="/team" className="text-orange-500 underline">team dashboard</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">Ready to see your score?</h2>
          <Link
            href="/analyze"
            className="inline-block bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-base transition-colors"
          >
            Analyze your shot →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
