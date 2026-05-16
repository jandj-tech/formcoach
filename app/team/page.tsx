import TopNav from '@/components/TopNav'
import Link from 'next/link'

export default function TeamLandingPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center space-y-10">

        <div className="space-y-4 max-w-xl">
          <h1 className="text-4xl font-black text-black leading-tight">
            LearnHoops Team Plan
          </h1>
          <p className="text-gray-500 text-lg">
            Get your whole team analyzed. AI grades every player&apos;s shot form — see who&apos;s ranked best and who&apos;s improving the most.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full text-left">
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl font-black text-orange-500">$2.50</div>
            <div className="font-semibold text-black">Per upload</div>
            <div className="text-gray-500 text-sm">Buy credits and use them when you need them.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl">🏆</div>
            <div className="font-semibold text-black">Player rankings</div>
            <div className="text-gray-500 text-sm">Every player ranked by their best shot score so you always know where everyone stands.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl">📈</div>
            <div className="font-semibold text-black">Most improved</div>
            <div className="text-gray-500 text-sm">Track who&apos;s putting in the work with automatic improvement tracking.</div>
          </div>
        </div>

        <div className="max-w-2xl w-full bg-orange-500 rounded-2xl px-6 py-4 flex items-center gap-4 text-white">
          <span className="text-3xl shrink-0">🎓</span>
          <div className="text-left">
            <p className="font-black text-base leading-tight">10-Week Shooting Class — for organizations</p>
            <p className="text-orange-100 text-sm mt-0.5">Each player gets a ball, 2 shot analyses, and a completion certificate. Starting at $50/player.</p>
          </div>
        </div>

        <div className="max-w-3xl w-full space-y-4 text-left">
          <h2 className="text-2xl font-black text-black text-center">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-2xl p-5 space-y-2">
              <div className="text-orange-500 font-black text-lg">Step 1</div>
              <div className="font-semibold text-black">Register your organization</div>
              <div className="text-gray-500 text-sm">Create your org account. Get your organization code to link all your teams together.</div>
            </div>
            <div className="border border-gray-200 rounded-2xl p-5 space-y-2">
              <div className="text-orange-500 font-black text-lg">Step 2</div>
              <div className="font-semibold text-black">Add teams & invite coaches</div>
              <div className="text-gray-500 text-sm">Add each team with its age group and coach email. Coaches get a setup link automatically.</div>
            </div>
            <div className="border border-gray-200 rounded-2xl p-5 space-y-2">
              <div className="text-orange-500 font-black text-lg">Step 3</div>
              <div className="font-semibold text-black">Players upload, you track everything</div>
              <div className="text-gray-500 text-sm">Buy credits for players, watch the leaderboard fill up, and see who&apos;s improving across every team.</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/org/signup"
            className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Register Organization
          </Link>
          <Link
            href="/login"
            className="bg-white border border-gray-300 hover:border-orange-400 text-black font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Log In
          </Link>
        </div>

      </div>
    </main>
  )
}
