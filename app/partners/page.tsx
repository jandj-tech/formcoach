import Image from 'next/image'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'Partners — LearnHoops.com',
  description: 'Teams, academies, and programs using LearnHoops.com to train smarter.',
}

const organizations = [
  {
    name: 'Maple Basketball',
    type: 'Training Academy',
    location: 'Vaughan, ON',
    logo: '/maple-basketball-logo.png',
    description: 'Uses LearnHoops.com to give every player in their development program instant AI shot feedback after each session.',
  },
]

export default function PartnersPage() {
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />

      <section className="hero-glow grain relative flex flex-col items-center text-center px-4 pt-16 pb-10">
        <p className="eyebrow text-ember-400 select-none mb-4">Who uses LearnHoops</p>
        <h1 className="font-display font-black uppercase text-[clamp(2.2rem,6vw,4rem)] leading-[0.95] max-w-2xl">
          Teams training <span className="text-ember-400">smarter</span>
        </h1>
        <p className="text-chalk-dim text-base sm:text-lg mt-4 max-w-lg leading-relaxed px-2">
          Teams, academies, and programs using LearnHoops.com to give every player AI-powered shot feedback.
        </p>
      </section>

      <section className="flex-1 flex flex-col items-center px-4 pb-16 gap-5">
        {organizations.map((org) => (
          <div
            key={org.name}
            className="w-full max-w-2xl bg-ink-900 rounded-2xl border border-courtline p-8 sm:p-10 flex flex-col gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                <Image
                  src={org.logo}
                  alt={`${org.name} logo`}
                  width={128}
                  height={128}
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-lg font-black text-chalk leading-tight">{org.name}</h2>
                <p className="text-xs text-chalk-dim">{org.type} · {org.location}</p>
              </div>
            </div>
            <p className="text-chalk-dim text-sm sm:text-base leading-relaxed">
              {org.description}
            </p>
          </div>
        ))}
      </section>

      <SiteFooter />
    </main>
  )
}
