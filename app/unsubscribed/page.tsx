import Link from 'next/link'
import TopNav from '@/components/TopNav'

export default function UnsubscribedPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">👋</div>
          <h1 className="text-2xl font-bold text-gray-900">You&apos;ve been unsubscribed</h1>
          <p className="text-gray-500">You won&apos;t receive any more marketing emails from FormCoach. Your results link will still work.</p>
          <Link href="/" className="inline-block text-orange-500 hover:text-orange-400 text-sm">
            ← Back to FormCoach
          </Link>
        </div>
      </div>
    </main>
  )
}
