import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — LearnHoops',
}

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-white">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-gray-400 mb-10 text-sm">Last updated: May 16, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What we collect</h2>
        <p className="text-gray-300 leading-relaxed">
          When you create an account, we collect your email address and a password (stored as a secure hash). When you submit a video for analysis, we store that video and the AI-generated results associated with your account.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How we use it</h2>
        <p className="text-gray-300 leading-relaxed">
          We use your email to authenticate your account and send you your analysis results. We use your video solely to run the shot analysis — we do not sell, share, or use your video for any other purpose.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Data storage</h2>
        <p className="text-gray-300 leading-relaxed">
          Your data is stored securely on servers in the United States. Videos and results are retained as long as your account is active. You can request deletion of your data at any time by contacting us.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Third parties</h2>
        <p className="text-gray-300 leading-relaxed">
          We use Stripe for payment processing. Stripe may collect payment information directly — we do not store your credit card details. We use OpenAI to process video analysis. Video frames are sent to OpenAI solely for the purpose of generating your shot analysis.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Cookies</h2>
        <p className="text-gray-300 leading-relaxed">
          We use a session cookie to keep you logged in. We do not use tracking or advertising cookies.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Children</h2>
        <p className="text-gray-300 leading-relaxed">
          LearnHoops is not directed at children under 13. We do not knowingly collect personal information from children under 13.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Contact</h2>
        <p className="text-gray-300 leading-relaxed">
          Questions about this policy? Email us at{' '}
          <a href="mailto:argomosko@gmail.com" className="text-orange-400 underline">
            argomosko@gmail.com
          </a>
        </p>
      </section>
    </main>
  )
}
