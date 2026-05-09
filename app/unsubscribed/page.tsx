import Image from 'next/image'
import Link from 'next/link'

export default function UnsubscribedPage() {
  return (
    <main className="min-h-screen bg-slate-900 flex flex-col">
      <nav className="flex items-center px-4 border-b border-slate-800">
        <Image src="/logo.png" alt="FormCoach" width={1024} height={1024} style={{ height: '160px', width: 'auto' }} />
      </nav>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">👋</div>
          <h1 className="text-2xl font-bold text-white">You&apos;ve been unsubscribed</h1>
          <p className="text-slate-400">You won&apos;t receive any more marketing emails from FormCoach. Your results link will still work.</p>
          <Link href="/" className="inline-block text-orange-400 hover:text-orange-300 text-sm">
            ← Back to FormCoach
          </Link>
        </div>
      </div>
    </main>
  )
}
