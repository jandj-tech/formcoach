import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import TopNav from '@/components/TopNav'

export const metadata: Metadata = {
  title: 'Support — LearnHoops',
  description: 'Contact LearnHoops support.',
}

const SUPPORT_EMAIL = 'learnhoops8@gmail.com'

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md text-center space-y-6">
          {/* Logo — on a dark panel so it stays visible on the white page */}
          <div className="inline-flex items-center justify-center bg-black rounded-2xl px-8 py-6">
            <Image
              src="/learnhoops-logo.png"
              alt="LearnHoops.com"
              width={578}
              height={113}
              style={{ height: '56px', width: 'auto' }}
              priority
            />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-black text-black">Support</h1>
            <p className="text-gray-500">
              Need help with your account, an analysis, or an order? Reach out and we&apos;ll help.
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact us</p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="block text-xl font-black text-orange-600 hover:text-orange-500 break-all transition-colors"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>

          <Link href="/" className="inline-block text-sm font-semibold text-orange-500 hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
