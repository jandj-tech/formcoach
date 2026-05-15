import TopNav from '@/components/TopNav'
import Link from 'next/link'

export default function TeamLandingPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center space-y-10">
        <div className="space-y-4 max-w-xl">
          <div className="text-5xl">🏀</div>
          <h1 className="text-4xl font-black text-black leading-tight">
            LearnHoops Team Plan
          </h1>
          <p className="text-gray-500 text-lg">
            Get your whole team analyzed. Coaches upload shots, AI grades the form — see who&apos;s improving.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full text-left">
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl font-black text-orange-500">$2.50</div>
            <div className="font-semibold text-black">Per upload</div>
            <div className="text-gray-500 text-sm">No monthly fee. Buy credits and use them when you need them.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl">📊</div>
            <div className="font-semibold text-black">Team leaderboard</div>
            <div className="text-gray-500 text-sm">See every player ranked by their best shot score.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl">📈</div>
            <div className="font-semibold text-black">Most improved</div>
            <div className="text-gray-500 text-sm">Track who&apos;s putting in the work with automatic improvement tracking.</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/team/signup"
            className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Create Team Account
          </Link>
          <Link
            href="/team/login"
            className="bg-white border border-gray-300 hover:border-orange-400 text-black font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Coach Login
          </Link>
        </div>
      </div>
    </main>
  )
}
