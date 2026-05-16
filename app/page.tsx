import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CriteriaShowcase, { type Criterion } from '@/components/CriteriaShowcase'
import { db } from '@/lib/db'
import { getCriteriaVideoMap } from '@/lib/youtube'
import { getSession } from '@/lib/auth'

export default async function HomePage() {
  const session = await getSession()

  const criteria = (await db`
    SELECT id, name, description
    FROM criteria
    WHERE active = true
    ORDER BY order_index
  `) as unknown as Criterion[]

  const videoMap = await getCriteriaVideoMap(criteria.map((c) => c.name))

  return (
    <main className="flex flex-col min-h-screen bg-white">
      <TopNav />

      {session && (
        <div className="bg-orange-500 text-white text-center text-sm font-semibold py-2 px-4">
          Welcome: {session.email}
        </div>
      )}

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-4 pt-12 pb-8">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
          <span className="text-orange-500 text-xs font-semibold tracking-wider uppercase">AI Shot Analysis</span>
        </div>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-black leading-tight max-w-2xl">
          Get your shot<br />
          <span className="text-orange-500">professionally analyzed</span>
        </h1>
        <p className="text-black text-base sm:text-lg mt-4 max-w-lg leading-relaxed px-2">
          Upload a video of your shot. Our AI studies 12 frames and scores 17 key form criteria — instantly.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8 w-full max-w-md sm:w-auto px-2">
          <Link
            href="/analyze"
            className="bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-base transition-colors text-center"
          >
            Analyze your shot →
          </Link>
          <Link
            href="/shop"
            className="bg-black hover:bg-zinc-800 text-white font-bold px-8 py-3 rounded-xl text-base transition-colors text-center"
          >
            Shop the ball →
          </Link>
        </div>
      </section>

      {/* Steps */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-4 py-8 max-w-3xl mx-auto w-full">
        {[
          { num: '1', title: 'Upload Your Video', desc: 'Any angle, any device. MP4 or MOV.' },
          { num: '2', title: 'AI Analyzes Your Form', desc: '12 frames studied across 17 coaching criteria.' },
          { num: '3', title: 'Get Your Results', desc: 'We email you a private breakdown with scores & tips.' },
        ].map((step) => (
          <div key={step.num} className="bg-gray-50 rounded-xl p-5 text-center border border-gray-200">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white font-bold text-sm flex items-center justify-center mx-auto mb-3">
              {step.num}
            </div>
            <h3 className="text-black font-semibold text-sm mb-1">{step.title}</h3>
            <p className="text-black text-xs leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </section>

      {/* Teams using the software */}
      <section className="px-4 py-10 max-w-3xl mx-auto w-full">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider text-center mb-6">Used by teams &amp; academies</p>
        <div className="flex flex-wrap justify-center gap-4">
          {[
            { name: 'Maple Basketball', location: 'Vaughan, ON', logo: '/maple-basketball-logo.png' },
          ].map((org) => (
            <div key={org.name} className="flex items-center gap-4 bg-white border border-gray-200 rounded-2xl px-6 py-4 shadow-sm">
              <img src={org.logo} alt={org.name + ' logo'} className="w-14 h-14 object-contain rounded-xl" />
              <div>
                <p className="text-black text-base font-black leading-tight">{org.name}</p>
                <p className="text-gray-400 text-sm">{org.location}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <CriteriaShowcase criteria={criteria} videoMap={videoMap} />

      <div className="flex-1" />

      <footer className="py-5 border-t border-gray-200 text-center text-black text-xs">
        © {new Date().getFullYear()} LearnHoops.com. All rights reserved.
      </footer>
    </main>
  )
}
