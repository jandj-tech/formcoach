import TopNav from '@/components/TopNav'
import Link from 'next/link'

export default function TeamLandingPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center space-y-14">

        {/* Hero */}
        <div className="space-y-4 max-w-2xl">
          <h1 className="text-4xl font-black text-black leading-tight">
            AI Shot Analysis for Your Entire Organization
          </h1>
          <p className="text-gray-500 text-lg">
            Register your organization, add your teams, invite your coaches. Every player gets AI-graded shot analysis — see who&apos;s ranked best and who&apos;s improving the most.
          </p>
        </div>

        {/* Pricing + Features */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl w-full text-left">
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-3xl font-black text-orange-500">$4.99</div>
            <div className="font-semibold text-black">Per analysis</div>
            <div className="text-gray-500 text-sm">No monthly fee. Buy tokens for players when you need them.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl font-black text-black">🏆</div>
            <div className="font-semibold text-black">Player rankings</div>
            <div className="text-gray-500 text-sm">Every player ranked by their best shot score so you always know where everyone stands.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl font-black text-black">📈</div>
            <div className="font-semibold text-black">Most improved</div>
            <div className="text-gray-500 text-sm">Track who&apos;s putting in the work — automatic improvement tracking from first to latest upload.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl font-black text-black">🏀</div>
            <div className="font-semibold text-black">17 criteria graded</div>
            <div className="text-gray-500 text-sm">Elbow alignment, release point, follow-through and 14 more — scored by AI on every shot.</div>
          </div>
        </div>

        {/* How it works */}
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
              <div className="text-gray-500 text-sm">Add each team with its age group and coach email. Coaches get a setup link automatically — no extra steps.</div>
            </div>
            <div className="border border-gray-200 rounded-2xl p-5 space-y-2">
              <div className="text-orange-500 font-black text-lg">Step 3</div>
              <div className="font-semibold text-black">Players upload, you track everything</div>
              <div className="text-gray-500 text-sm">Buy tokens for players, watch the leaderboard fill up, and see exactly who&apos;s improving across every team.</div>
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/org/signup"
            className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Register Organization
          </Link>
          <Link
            href="/org/login"
            className="bg-white border border-gray-300 hover:border-orange-400 text-black font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Organization Login
          </Link>
          <Link
            href="/team/login"
            className="bg-white border border-gray-300 hover:border-gray-400 text-black font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Coach Login
          </Link>
        </div>

      </div>
    </main>
  )
}
