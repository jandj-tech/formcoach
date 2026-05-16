import TopNav from '@/components/TopNav'
import Link from 'next/link'

export default function TeamLandingPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center space-y-10">
        <div className="space-y-4 max-w-xl">
          <h1 className="text-4xl font-black text-black leading-tight">
            LearnHoops for Organizations
          </h1>
          <p className="text-gray-500 text-lg">
            Register your organization, add your teams, and invite your coaches. AI grades every player&apos;s form — track who&apos;s improving across every team.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full text-left">
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl font-black text-orange-500">Step 1</div>
            <div className="font-semibold text-black">Register your organization</div>
            <div className="text-gray-500 text-sm">Create your org account and get your organization code.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl font-black text-orange-500">Step 2</div>
            <div className="font-semibold text-black">Add your teams</div>
            <div className="text-gray-500 text-sm">Add each team with its age group and coach email — your coaches get an invite link automatically.</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-2">
            <div className="text-2xl font-black text-orange-500">Step 3</div>
            <div className="font-semibold text-black">Buy tokens for players</div>
            <div className="text-gray-500 text-sm">Purchase analysis tokens for any player or entire teams. Coaches manage uploads, you manage the budget.</div>
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
