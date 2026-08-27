import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'Accessibility | LearnHoops',
  description:
    'How LearnHoops approaches accessibility, what has been tested, what is still outstanding, and how to report a barrier.',
  alternates: { canonical: '/accessibility' },
}

/**
 * Accessibility statement.
 *
 * Deliberately does NOT claim ADA or full WCAG conformance. The testing behind
 * it so far is an automated pass plus a code review, and automated tools catch
 * only a minority of real barriers — claiming compliance on that basis would be
 * false, and a false claim is worse than an honest gap. Update the "last
 * reviewed" date and the outstanding list whenever that changes.
 */
export default function AccessibilityPage() {
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />

      <section className="px-4 py-14 sm:py-20">
        <div className="max-w-2xl mx-auto">
          <p className="eyebrow text-ember-400 mb-3 select-none">Accessibility</p>
          <h1 className="font-display font-black uppercase text-[clamp(2rem,5vw,3.2rem)] leading-[0.95]">
            Accessibility at <span className="text-gradient-ember">LearnHoops</span>
          </h1>

          <p className="text-chalk-dim mt-6 leading-relaxed">
            We want every player to be able to upload a shot and read their report,
            including people who use a screen reader, navigate by keyboard, rely on
            captions, or need larger text and stronger contrast. This page is an honest
            account of where we actually are.
          </p>

          <h2 className="font-display font-black uppercase text-xl mt-10 mb-3">
            What we aim for
          </h2>
          <p className="text-chalk-dim leading-relaxed">
            We work towards the{' '}
            <a
              href="https://www.w3.org/TR/WCAG22/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ember-400 underline"
            >
              Web Content Accessibility Guidelines (WCAG) 2.2, Level AA
            </a>
            . That is the target we are working to, not a finished achievement.
          </p>

          <h2 className="font-display font-black uppercase text-xl mt-10 mb-3">
            What we have actually tested
          </h2>
          <p className="text-chalk-dim leading-relaxed">
            As of <strong className="text-chalk">27 August 2026</strong>, this site has had an
            automated accessibility scan and a code review covering colour contrast,
            heading structure, image alternative text, form labelling and keyboard focus.
            Fixes from that review are live: a visible keyboard focus indicator, a
            &ldquo;skip to main content&rdquo; link, corrected contrast on text that was too
            faint, and correct handling of the upload panel for screen readers.
          </p>

          <h2 className="font-display font-black uppercase text-xl mt-10 mb-3">
            What we have <em>not</em> done yet
          </h2>
          <p className="text-chalk-dim leading-relaxed">
            We have not completed manual testing with real assistive technology. Automated
            tools detect only a minority of accessibility barriers, so we are not claiming
            conformance with any standard or law. Still outstanding:
          </p>
          <ul className="text-chalk-dim leading-relaxed list-disc pl-5 mt-3 space-y-1.5">
            <li>End-to-end testing with screen readers (VoiceOver, NVDA, TalkBack).</li>
            <li>A keyboard-only walkthrough of upload, checkout and the coach dashboards.</li>
            <li>Text alternatives for our instructional videos, which have no soundtrack.</li>
            <li>Testing at 200% zoom and 400% reflow on small screens.</li>
            <li>Review of the iOS app, which is separate from this website.</li>
          </ul>

          <h2 className="font-display font-black uppercase text-xl mt-10 mb-3">
            Known limitations
          </h2>
          <p className="text-chalk-dim leading-relaxed">
            Shot analysis is inherently visual: the report describes what a camera saw. We
            write every criterion&rsquo;s reasoning as plain text so it can be read aloud,
            but a player still needs someone to film them. Uploads are also capped at
            1&nbsp;GB, which can be limiting on phones that record large files.
          </p>

          <h2 className="font-display font-black uppercase text-xl mt-10 mb-3">
            Found a barrier? Tell us
          </h2>
          <p className="text-chalk-dim leading-relaxed">
            If something here blocked you, we want to know — that is more useful to us than
            any audit. Email{' '}
            <a href="mailto:support@learnhoops.com" className="text-ember-400 underline">
              support@learnhoops.com
            </a>{' '}
            with the page, what you were trying to do, and the assistive technology or
            browser you were using. We aim to reply within five business days, and we will
            tell you plainly whether we can fix it and when.
          </p>

          <p className="text-chalk-dim text-sm mt-10 pt-6 border-t border-courtline">
            Last reviewed 27 August 2026. This statement covers the learnhoops.com website.
            We update it when we test or fix something, rather than on a fixed schedule.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
