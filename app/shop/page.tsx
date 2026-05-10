import Link from 'next/link'
import TopNav from '@/components/TopNav'

export default function ShopPage() {
  return (
    <main className="flex flex-col min-h-screen bg-black">
      <TopNav />

      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16">
        <div className="text-7xl mb-6">🏀</div>
        <div className="inline-flex items-center gap-2 bg-red-600/10 border border-red-600/30 rounded-full px-4 py-1.5 mb-5">
          <span className="text-red-500 text-xs font-semibold tracking-wider uppercase">Coming Soon</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight max-w-2xl">
          The LearnHoops <span className="text-orange-500">basketball</span>
        </h1>
        <p className="text-white text-base sm:text-lg mt-4 max-w-md leading-relaxed">
          We&apos;re building a shop. Check back soon — or head to Analyze and try the AI tool now.
        </p>

        <Link
          href="/analyze"
          className="mt-8 bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-base transition-colors"
        >
          Analyze your shot →
        </Link>
      </section>

      <footer className="py-5 border-t border-zinc-900 text-center text-white text-xs">
        © {new Date().getFullYear()} LearnHoops. All rights reserved.
      </footer>
    </main>
  )
}
