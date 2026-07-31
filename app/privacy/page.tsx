import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — LearnHoops',
}

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-white">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-gray-400 mb-10 text-sm">Last updated: July 27, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What we collect</h2>
        <p className="text-gray-300 leading-relaxed">
          When you create an account, we collect your email address and a password (stored as a secure hash), and optionally a display name or nickname. When you submit a shot for analysis, we store still frames extracted from your video (and, for uploads made on the website, the video itself) together with the AI-generated results, linked to your account. Coaches and organizations may also enter player names and team names. If you order a physical product, Stripe collects your name, shipping address, and phone number at checkout so we can fulfill and ship your order.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How we use it</h2>
        <p className="text-gray-300 leading-relaxed">
          We use your email to authenticate your account, deliver your analysis results, and — unless you unsubscribe — send occasional product updates and offers. Every marketing email includes an unsubscribe link, and deleting your account stops all email. Your video frames are used to run the shot analysis and to display your results back to you. We may use anonymized scoring data to improve the accuracy of our analysis. We do not sell your personal information.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Data storage and deletion</h2>
        <p className="text-gray-300 leading-relaxed">
          Your data is stored securely on servers in the United States. Frames and results are retained as long as your account is active so you can review your shot history. You can delete individual submissions, or delete your entire account, at any time from your dashboard — deleting your account removes your account details, your shot history including stored frames and videos, and your email from our mailing list. You can also request deletion by emailing us.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Service providers</h2>
        <p className="text-gray-300 leading-relaxed">
          We share data with service providers only as needed to run LearnHoops: <strong>Anthropic</strong> processes video frames to generate your shot analysis; <strong>Vercel</strong> hosts our application, database, and file storage (including uploaded frames and videos); <strong>Stripe</strong> processes website payments (we never store your card details); <strong>Apple</strong> and <strong>RevenueCat</strong> process purchases made in our iOS app (RevenueCat receives your account ID and purchase history to deliver what you bought); <strong>Resend</strong> sends our transactional and marketing email; and <strong>Twilio</strong> may be used to send order-related text messages for physical orders. On our <em>website</em> we also use Meta (Facebook) advertising tools — see Cookies and advertising below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Cookies and advertising</h2>
        <p className="text-gray-300 leading-relaxed">
          We use a session cookie to keep you logged in. On our website, we use the Meta Pixel and Meta Conversions API to measure our advertising — these set advertising cookies and share limited information (such as pages visited and, for signups, a hashed email address) with Meta. These advertising tools are <strong>not used inside our iOS app</strong>: the app does not track you across other companies&apos; apps or websites.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Children and youth players</h2>
        <p className="text-gray-300 leading-relaxed">
          LearnHoops accounts are not directed at children under 13, and we do not knowingly let children under 13 create accounts. Coaches and organizations may upload shot videos of youth players on their teams; by doing so, the coach or organization confirms they have the necessary permission (including parental consent where required) for those players. Parents or guardians can contact us at any time to have a player&apos;s videos and data removed.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Contact</h2>
        <p className="text-gray-300 leading-relaxed">
          Questions about this policy, or a removal request? Email us at{' '}
          <a href="mailto:support@learnhoops.com" className="text-orange-400 underline">
            support@learnhoops.com
          </a>
        </p>
      </section>
    </main>
  )
}
