import Image from 'next/image'
import TopNav from '@/components/TopNav'

export const metadata = {
  title: 'Partners — LearnHoops.com',
  description: 'Brands and teams we work with at LearnHoops.com.',
}

export default function PartnersPage() {
  return (
    <main className="flex flex-col min-h-screen bg-white">
      <TopNav />

      <section className="flex flex-col items-center text-center px-4 pt-12 pb-8">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
          <span className="text-orange-500 text-xs font-semibold tracking-wider uppercase">Our Partners</span>
        </div>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-black leading-tight max-w-2xl">
          The people we&apos;re <span className="text-orange-500">building with</span>
        </h1>
        <p className="text-black text-base sm:text-lg mt-4 max-w-lg leading-relaxed px-2">
          LearnHoops.com partners with serious basketball brands to help players train smarter.
        </p>
      </section>

      <section className="flex-1 flex flex-col items-center px-4 pb-16">
        <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 p-8 sm:p-12 flex flex-col items-center text-center gap-6 shadow-sm">
          <Image
            src="/maple-basketball-logo.png"
            alt="Maple Basketball"
            width={500}
            height={500}
            style={{ height: 'auto', width: '100%', maxWidth: '280px' }}
            priority
          />
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-black text-black">Maple Basketball</h2>
            <p className="text-black text-sm sm:text-base leading-relaxed max-w-md">
              Maple Basketball makes premium training equipment built for players who take their game seriously.
              The LearnHoops.com Training Ball is co-designed with their team.
            </p>
          </div>
        </div>
      </section>

      <footer className="py-5 border-t border-gray-200 text-center text-black text-xs">
        © {new Date().getFullYear()} LearnHoops.com. All rights reserved.
      </footer>
    </main>
  )
}
