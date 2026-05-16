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

      {/* White top section */}
      <div className="flex flex-col items-center px-6 pt-20 pb-16 space-y-6">
        <div className="w-full max-w-md text-center space-y-6">
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
        </div>
      </div>

      {/* Grey FAQ section — fills the rest of the page */}
      <div className="flex-1 bg-gray-50 border-t border-gray-200">
        <div className="flex flex-col items-center px-6 py-12 space-y-6">
          <div className="w-full max-w-3xl space-y-4">
            <h2 className="text-xl font-black text-black text-center">Frequently Asked Questions</h2>
            <details className="bg-white border border-gray-200 rounded-2xl group" open>
              <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none font-bold text-black">
                What angle should I film from to get the best results?
                <span className="text-gray-400 text-lg group-open:rotate-180 transition-transform">›</span>
              </summary>
              <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed">
                For the most accurate analysis, film from under or near the net — either directly behind the basket or slightly to the side at an angle where the shooter&apos;s elbow, arms, and hands are all clearly visible throughout the shot. This gives the AI a clear view of arm mechanics, elbow alignment, and release. If you also want arc to be evaluated, choose an angle where the ball&apos;s flight path is visible. Avoid filming directly face-on, as key form details are hidden from that perspective. Video examples for each angle are coming soon.
              </div>
            </details>
          </div>

          <Link href="/" className="text-sm font-semibold text-orange-500 hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
