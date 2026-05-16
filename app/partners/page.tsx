import TopNav from '@/components/TopNav'

export const metadata = {
  title: 'Teams — LearnHoops.com',
  description: 'Teams, academies, and programs using LearnHoops.com to train smarter.',
}

const organizations = [
  {
    name: 'Maple Basketball',
    type: 'Training Academy',
    location: 'Vaughan, ON',
    description: 'Uses LearnHoops.com to give every player in their development program instant AI shot feedback after each session.',
  },
]

export default function TeamsPage() {
  return (
    <main className="flex flex-col min-h-screen bg-white">
      <TopNav />

      <section className="flex flex-col items-center text-center px-4 pt-12 pb-8">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
          <span className="text-orange-500 text-xs font-semibold tracking-wider uppercase">Who Uses LearnHoops</span>
        </div>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-black leading-tight max-w-2xl">
          Teams <span className="text-orange-500">training smarter</span>
        </h1>
        <p className="text-black text-base sm:text-lg mt-4 max-w-lg leading-relaxed px-2">
          Teams, academies, and programs using LearnHoops.com to give every player AI-powered shot feedback.
        </p>
      </section>

      <section className="flex-1 flex flex-col items-center px-4 pb-16 gap-5">
        {organizations.map((org) => (
          <div
            key={org.name}
            className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 p-8 sm:p-10 flex flex-col gap-3 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-black text-lg shrink-0">
                {org.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-lg font-black text-black leading-tight">{org.name}</h2>
                <p className="text-xs text-gray-400">{org.type} · {org.location}</p>
              </div>
            </div>
            <p className="text-black text-sm sm:text-base leading-relaxed">
              {org.description}
            </p>
          </div>
        ))}
      </section>

      <footer className="py-5 border-t border-gray-200 text-center text-black text-xs">
        © {new Date().getFullYear()} LearnHoops.com. All rights reserved.
      </footer>
    </main>
  )
}
