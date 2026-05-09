import Link from 'next/link'
import TopNav from '@/components/TopNav'

export default function ShopPage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-900">
      <TopNav />

      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16">
        <div className="text-7xl mb-6">🏀</div>
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
          <span className="text-orange-400 text-xs font-semibold tracking-wider uppercase">Coming Soon</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight max-w-2xl">
          The FormCoach <span className="text-orange-500">basketball</span>
        </h1>
        <p className="text-slate-400 text-base sm:text-lg mt-4 max-w-md leading-relaxed">
          We're building a shop. Check back soon — or head to Analyze and try the AI tool now.
        </p>

        <Link
          href="/analyze"
          className="mt-8 bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-xl text-base transition-colors"
        >
          Analyze your shot →
        </Link>
      </section>

      <footer className="py-5 border-t border-slate-800 text-center text-slate-600 text-xs">
        © {new Date().getFullYear()} FormCoach. All rights reserved.
      </footer>
    </main>
  )
}
