import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import SupportForm from './SupportForm'

export const metadata: Metadata = {
  title: 'Basketball Shot Analysis Help & FAQ | LearnHoops',
  description:
    'How AI basketball shot analysis works, what it costs, how to film your jump shot for the best results, and how teams use LearnHoops. Contact support any time.',
  alternates: { canonical: '/support' },
}

// Rendered as visible FAQ items below AND emitted as FAQPage structured data,
// so the two can never drift apart. Google only allows FAQ rich results when
// the schema text matches what's on the page.
// Joseph's own clip, cropped out of the pillarbox his phone wrote it into and
// re-encoded (8.7MB -> 386KB). Hosted on Blob rather than /public so an
// unchanging file is not shipped with every deployment and every clone.
const FILMING_EXAMPLE_VIDEO =
  'https://x0swilm3wujbxncc.public.blob.vercel-storage.com/examples/filming-example.mp4'
const FILMING_EXAMPLE_POSTER =
  'https://x0swilm3wujbxncc.public.blob.vercel-storage.com/examples/filming-example-poster.jpg'

const FAQS: Array<{ id?: string; q: string; a: string[] }> = [
  {
    q: 'What is AI basketball shot analysis?',
    a: [
      'You upload a short video of one jump shot, and our AI studies it frame by frame against 18 shooting-form criteria — the same fundamentals real coaches teach: elbow alignment, stance width, shot pocket, release, follow-through, arc, and more. A few minutes later you get an overall score, a grade for every criterion, and plain-English coaching feedback with drills to fix what is holding your shot back.',
    ],
  },
  {
    q: 'How much does a shot analysis cost?',
    a: [
      'Your first analysis is free when you create an account. After that, each analysis is $1.79 — or $0.99 for players on an initiated team. Every LearnHoops Training Basketball from the shop includes 5 free analyses, and bulk orders get volume discounts automatically.',
    ],
  },
  {
    id: 'filming',
    q: 'What angle should I film from to get the best results?',
    a: [
      'Film from the front — camera under or just behind the basket, looking back at the shooter. That is the view that shows the AI what it grades hardest: whether the elbow flares out, whether the guide hand stays passive, whether both hands are heaving the ball into the shot, and whether the feet and shoulders are square. Straight head-on works, and so does standing a little off to one side, as long as you stay in front of the shooter. If you do angle it, go toward the side the guide hand is on. From there the shooting arm is seen slightly from the inside, which is what separates a proper L — forearm stacked under the ball — from a wide V, where the upper arm and forearm open out and the forearm folds back. Head-on, those two can look the same. Frame the whole body, head to feet, and keep it that way from the set-up through the release — the stance, the knee bend and which foot is forward are all graded, and a clip cropped at the waist loses them. Not so far away that the player is a small figure across the gym, though: from that distance the elbow and hands are too small to read. One shot per clip.',
      "Shot arc and ball rotation are the exception. Filmed head-on the ball flies straight at the camera, so its flight path is flattened and those two are usually left blank. If you want them graded, film a second clip from the side with the whole flight path and the rim in frame, close enough and in good enough light that the ball isn't a blur. We leave a criterion ungraded rather than guess at it — a made-up score would drag your overall number and your feedback off, so a blank is more honest than a bad estimate.",
    ],
  },
  {
    q: 'Can basketball teams and organizations use LearnHoops?',
    a: [
      'Yes. Coaches get a team dashboard with a roster, shared credits, schedules, and team chat — players join with a team code, and the coach can upload shots for any player on the roster. Organizations can run multiple teams and 10-week training classes with progress certificates. Team players pay the discounted $0.99 rate per analysis.',
    ],
  },
]

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      {/* FAQ structured data, generated from the same FAQS array the page
          renders — eligible for FAQ rich results in search. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a.join(' ') },
            })),
          }),
        }}
      />
      <TopNav />

      {/* Contact */}
      <div className="hero-glow grain relative flex flex-col items-center px-6 pt-16 pb-14">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="space-y-3">
            <p className="eyebrow text-ember-400 select-none">We&apos;ve got your back</p>
            <h1 className="font-display font-black uppercase text-[clamp(2.2rem,6vw,4rem)] leading-[0.95]">
              Support
            </h1>
            <p className="text-chalk-dim">
              Need help with your account, an analysis, or an order? Fill out the form and we&apos;ll get back to you.
            </p>
          </div>

          <SupportForm />

          <p className="text-gray-500 text-xs">
            To report inappropriate content (names, team names, or videos), choose
            &ldquo;Report inappropriate content&rdquo; above and include a link to the
            content — reports are reviewed and acted on within 24 hours.
          </p>
        </div>
      </div>

      {/* FAQ — linked directly from the home page and footer as /support#faq */}
      <div id="faq" className="flex-1 bg-ink-900 border-t border-courtline scroll-mt-20">
        <div className="flex flex-col items-center px-6 py-14 space-y-8">
          <div className="w-full max-w-3xl space-y-5">
            <h2 className="font-display font-black uppercase text-2xl text-center">
              Frequently asked questions
            </h2>
            {FAQS.map((f) => (
              <details
                key={f.q}
                id={f.id}
                className="bg-ink-800 border border-courtline rounded-2xl group scroll-mt-24"
                open={f.id === 'filming'}
              >
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none font-bold text-chalk select-none">
                  {f.q}
                  <span className="text-chalk-dim text-lg group-open:rotate-180 transition-transform select-none" aria-hidden>
                    ›
                  </span>
                </summary>
                <div className="px-5 pb-5 text-sm text-chalk-dim leading-relaxed space-y-3">
                  {f.a.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                  {f.id === 'filming' && (
                    <div className="pt-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-chalk mb-2">
                        A clip that grades well
                      </p>
                      <video
                        src={FILMING_EXAMPLE_VIDEO}
                        poster={FILMING_EXAMPLE_POSTER}
                        controls
                        playsInline
                        preload="none"
                        className="w-full max-w-[280px] rounded-xl border border-courtline bg-black"
                      />
                      <p className="text-xs text-chalk-dim/80 mt-2 max-w-md">
                        Filmed from the front, turned slightly off square, with the whole body in
                        frame from the set-up through the landing. Portrait, one shot, a few
                        seconds long.
                      </p>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>

          {/* Sits below the FAQ because it answers the question the filming
              entry above it raises: people read how to film, then want to see
              what they are meant to be filming. */}
          <div id="shot-example" className="w-full space-y-4 scroll-mt-24">
            <h2 className="font-display font-black uppercase text-[clamp(1.3rem,3vw,1.9rem)] leading-tight text-chalk">
              What should my shot look like?
            </h2>
            <p className="text-sm text-chalk-dim leading-relaxed">
              Klay Thompson&apos;s shooting form, broken down. It is a good picture of what the AI
              looks for: a base about shoulder width, the ball loaded around the forehead with one
              forearm under it, the guide hand along for the ride, and a held follow-through.
            </p>
            <div className="aspect-video w-full overflow-hidden rounded-2xl border border-courtline bg-black">
              <iframe
                src="https://www.youtube-nocookie.com/embed/8qkArgEq490?rel=0"
                title="What should my shot look like?"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="h-full w-full"
              />
            </div>
            <p className="text-sm text-chalk-dim leading-relaxed">
              Breakdown by{' '}
              <a
                href="https://www.youtube.com/@DZShooting24"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ember-400 hover:text-ember-500"
              >
                DZ Shooting
              </a>
              . Ready to see how yours compares?{' '}
              <Link href="/analyze" className="font-semibold text-ember-400 hover:text-ember-500">
                Upload a shot
              </Link>{' '}
              — your first analysis is free.
            </p>
          </div>

          <Link href="/" className="text-sm font-semibold text-ember-400 hover:text-ember-500 transition-colors py-2">
            ← Back to home
          </Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
