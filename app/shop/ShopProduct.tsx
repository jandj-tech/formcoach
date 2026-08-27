'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import useEmblaCarousel from 'embla-carousel-react'
import { useCart } from '@/lib/cart'
import type { Variant, Size } from '@/lib/cart'
import QuantityStepper from '@/components/QuantityStepper'
import TokenPacks from './TokenPacks'
import SectionBreak from '@/components/SectionBreak'

const SIZES: { value: Size; inches: string; label: string }[] = [
  { value: '5', inches: '27.5"', label: 'Youth' },
  { value: '6', inches: '28.5"', label: "Women's" },
  { value: '7', inches: '29.5"', label: "Men's" },
]

const PRICE = 39.99
// Bundle: ball 1 full price + ball 2 at 50% off = $39.99 + $20.00 = $59.99
const BUNDLE_PRICE = PRICE + Math.round(PRICE * 50) / 100
// Free shot analyses granted per single training ball.
const FREE_ANALYSES_PER_BALL = 5

// The product description reformatted as feature tiles — same facts as the
// paragraph and the selectors in the buy box, no new claims.
const FEATURES = [
  { num: '01', title: 'Grip lines', desc: 'Printed lines show exactly where each finger belongs — no more guessing your placement.' },
  { num: '02', title: 'Groove your release', desc: 'Land on the lines every rep and proper hand placement becomes your release.' },
  { num: '03', title: 'Two editions', desc: 'Left and right-handed editions put the lines under your shooting hand, so the right fingers hit the right spots.' },
  { num: '04', title: 'Three sizes', desc: `27.5" youth, 28.5" women's, 29.5" men's — the right fit keeps your fingers on the lines every shot.` },
]

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

/** `hasGear` comes from the page rather than being read here: which gear shelf
 *  a visitor sees depends on their country, and a Client Component cannot read
 *  request headers. */
export default function ShopProduct({
  isInApp = false,
  hasGear = false,
}: {
  isInApp?: boolean
  hasGear?: boolean
}) {
  const { addBall } = useCart()
  const [variant, setVariant] = useState<Variant>('right')
  const [size, setSize] = useState<Size>('7')
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const lineTotal = Math.round(PRICE * quantity * 100) / 100
  const displayUnit = formatPrice(PRICE)
  const displayLineTotal = formatPrice(lineTotal)

  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(false), 2500)
    return () => clearTimeout(t)
  }, [added])

  function handleAdd() {
    addBall(variant, size, quantity)
    setAdded(true)
  }

  return (
    <div className="flex-1">
      {/* Shop header — names every product up front with jump links, so
          nothing further down the page gets missed */}
      <section className="px-4 pt-10 pb-12 sm:pt-14 sm:pb-14">
        <div className="max-w-6xl mx-auto">
          <p className="eyebrow text-ember-400 mb-3 select-none">The LearnHoops shop</p>
          <h1 className="font-display font-black uppercase text-[clamp(2rem,5vw,3.5rem)] text-chalk leading-[0.95]">
            Gear that fixes your shot
          </h1>
          <nav aria-label="Shop sections" className="flex gap-2 mt-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
            <a
              href="#training-ball"
              className="shrink-0 bg-ink-900 border border-courtline hover:border-ember-500/60 text-chalk text-sm font-bold px-5 py-2.5 rounded-full transition-colors"
            >
              Training Ball
            </a>
            <a
              href="#shot-analysis"
              className="shrink-0 bg-ink-900 border border-courtline hover:border-ember-500/60 text-chalk text-sm font-bold px-5 py-2.5 rounded-full transition-colors"
            >
              Shot Analysis
            </a>
            {hasGear && (
              <a
                href="#gear-we-like"
                className="shrink-0 bg-ink-900 border border-courtline hover:border-ember-500/60 text-chalk text-sm font-bold px-5 py-2.5 rounded-full transition-colors"
              >
                Gear We Like
              </a>
            )}
          </nav>
        </div>
      </section>

      {/* Analysis tokens — the shop's top seller leads the page. Dark like
          the rest of the store; the ball hero follows immediately below. */}
      <SectionBreak label="Analysis tokens" />
      <section id="analysis-tokens" className="px-4 pt-6 pb-20 sm:pb-28 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display font-black uppercase text-[clamp(1.6rem,3.5vw,2.4rem)] text-chalk leading-[0.95]">
            Get your shot <span className="text-gradient-ember">analyzed</span>
          </h2>
          <p className="text-chalk-dim text-sm mt-2 mb-6 max-w-xl">
            1 token = 1 AI shot analysis with your full breakdown across all 18 coaching
            criteria. Tokens never expire.
          </p>
          <TokenPacks dark />
        </div>
      </section>

      {/* Product hero: sticky gallery left, buy box card right */}
      <SectionBreak label="The training ball" />
      <section id="training-ball" className="hero-glow grain relative px-4 pt-6 pb-20 sm:pb-28 scroll-mt-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Media gallery — product photo plus the two demo clips in one
              even-sized carousel; sticky so it stays in view while the buy
              box scrolls */}
          <div className="lg:col-span-7 lg:sticky lg:top-24">
            <MediaGallery />
          </div>

          {/* Buy box */}
          <div className="lg:col-span-5 flex flex-col gap-5 bg-ink-900/60 border border-courtline rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-1.5">
                <span className="text-green-500 text-xs font-semibold tracking-wider uppercase">In Stock</span>
              </div>
              {/* Product-inclusion facts about a physical good — shown in the
                  app too; the ball itself is legitimately sold via Stripe. */}
              <span className="inline-flex items-center bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold px-3 py-1.5 rounded-full">
                {FREE_ANALYSES_PER_BALL * quantity} Shot Analyses Included Free
                {quantity > 1 ? ` (${FREE_ANALYSES_PER_BALL} per ball)` : ''}
              </span>
              <span className="inline-flex items-center bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black tracking-wider uppercase px-3 py-1.5 rounded-full">
                Best Value
              </span>
            </div>

            <h2 className="font-display font-black uppercase text-[clamp(1.7rem,3vw,2.4rem)] text-chalk leading-[0.95] break-words">
              The LearnHoops <span className="text-gradient-ember">Training Ball</span>
            </h2>

            <p className="text-white text-base leading-relaxed">
              A training ball built to fix your shooting form. Pick the edition for your shooting hand —
              the grip lines mark exactly where your fingers belong, so every rep grooves proper hand
              placement and release.
            </p>

            <div className="font-numeric text-3xl font-medium text-chalk">
              {displayUnit}
            </div>

            {/* Variant selector */}
            <div className="space-y-2">
              <label className="block text-white text-xs font-semibold tracking-wider uppercase">Edition</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setVariant('right')}
                  className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                    variant === 'right'
                      ? 'border-ember-500 bg-ember-500/10'
                      : 'border-courtline hover:border-chalk-dim/60'
                  }`}
                >
                  <div className="text-white font-bold text-base">Right-handed</div>
                  <div className="text-white text-xs mt-1">For right-hand shooters</div>
                </button>
                <button
                  onClick={() => setVariant('left')}
                  className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                    variant === 'left'
                      ? 'border-ember-500 bg-ember-500/10'
                      : 'border-courtline hover:border-chalk-dim/60'
                  }`}
                >
                  <div className="text-white font-bold text-base">Left-handed</div>
                  <div className="text-white text-xs mt-1">For left-hand shooters</div>
                </button>
              </div>
            </div>

            {/* Size selector */}
            <div className="space-y-2">
              <label className="block text-white text-xs font-semibold tracking-wider uppercase">Size</label>
              <div className="grid grid-cols-3 gap-3">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSize(s.value)}
                    className={`rounded-xl border-2 px-3 py-4 text-center transition-colors ${
                      size === s.value
                        ? 'border-ember-500 bg-ember-500/10'
                        : 'border-courtline hover:border-chalk-dim/60'
                    }`}
                  >
                    <div className="text-white font-bold text-base">Size {s.value}</div>
                    <div className="text-white text-xs mt-1">{s.inches}</div>
                    <div className="text-white text-xs">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <label className="block text-white text-xs font-semibold tracking-wider uppercase">Quantity</label>
              <QuantityStepper value={quantity} onChange={setQuantity} />
            </div>

            <button
              onClick={handleAdd}
              className="bg-ember-500 hover:bg-ember-400 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full text-base transition-all w-full shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
            >
              Add to cart — {displayLineTotal}
            </button>

            {added && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3"
              >
                <span className="text-green-400 text-sm font-semibold">
                  Added to cart
                </span>
                <Link
                  href="/cart"
                  className="text-ember-400 hover:text-ember-500 text-sm font-semibold underline"
                >
                  View cart →
                </Link>
              </div>
            )}

            <p className="text-white text-xs">
              Secure checkout powered by Stripe. See your shipping cost in the
              cart — Canada Post in Canada, USPS in the US.
            </p>

            {/* Product details — collapsible so the buy box stays compact */}
            <div className="space-y-2 pt-1">
              <ShopAccordion title="What's included" dark>
                One training ball in your chosen size and edition, plus{' '}
                <strong className="text-chalk">{FREE_ANALYSES_PER_BALL} free AI shot analyses</strong> added
                to your account after purchase. The printed grip lines mark exactly where your fingers belong.
              </ShopAccordion>
              <ShopAccordion title="Sizing guide" dark>
                Size 5 (27.5&quot;) fits youth players, size 6 (28.5&quot;) is the
                women&apos;s standard, and size 7 (29.5&quot;) is the men&apos;s
                standard. When in doubt, pick the size used in your league.
              </ShopAccordion>
              <ShopAccordion title="Shipping" dark>
                Enter your state or postal code in the cart to see your shipping
                cost before you pay — orders ship Canada Post within Canada and
                USPS within the US. You&apos;ll get a receipt by email right
                away and another email when your order ships.
              </ShopAccordion>
            </div>
          </div>
        </div>
      </section>

      {/* 2-Ball Bundle — directly under the single ball so the upsell is
          the next thing a shopper sees */}
      <BundleSection isInApp={isInApp} />

      {/* Feature band */}
      <section className="border-y border-courtline bg-ink-900/50">
        <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.num}
              className="fade-up card-lift bg-ink-800/60 border border-courtline rounded-2xl p-6"
            >
              <div className="font-numeric text-ember-400 text-lg mb-5 select-none">{f.num}</div>
              <h3 className="font-display font-bold uppercase text-lg text-chalk mb-2 leading-tight">
                {f.title}
              </h3>
              <p className="text-chalk-dim text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI shot analysis — light band so the product sections read as
          distinct blocks instead of one long black page. Shown in-app too:
          TokenPacks renders IAP-bridged packs there, never web checkout. */}
      {(
        <section id="shot-analysis" className="bg-chalk text-ink-950 px-4 py-16 sm:py-20 scroll-mt-20">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-start">
            <div className="space-y-5">
              <p className="eyebrow text-ember-700 select-none">AI shot analysis</p>
              <h2 className="font-display font-black uppercase text-[clamp(1.9rem,4vw,3rem)] leading-[0.95]">
                One shot.
                <br />
                <span className="text-gradient-ember">Eighteen criteria.</span>
              </h2>
              <p className="text-ink-950/60 leading-relaxed">
                Upload a video of your shot and our AI studies 12 frames of it,
                scoring the same 18 fundamentals real coaches teach — then tells
                you exactly what to fix.
              </p>
              <div className="space-y-2">
                <ShopAccordion title="What do I get?">
                  A full private breakdown: your overall score, a score and
                  coaching tip for each of the 18 criteria, and the frames the
                  AI studied. Your results link is emailed to you and stays
                  private — bookmark it, it always works.
                </ShopAccordion>
                <ShopAccordion title="How does it work?">
                  Film your shot from the front, standing near the basket so the
                  elbow, hands and feet are visible, upload the clip on the
                  Analyze page, and your results arrive by email within minutes.
                  Any phone camera works — MP4 or MOV.
                </ShopAccordion>
                <ShopAccordion title="Can I get analyses for free?">
                  Yes — the training ball includes 5 free analyses and the
                  2-ball bundle includes 10. Players on team or organization
                  rosters can also receive analysis tokens from their coach.
                </ShopAccordion>
              </div>
            </div>

            <div className="space-y-4 lg:pt-16">
              <a
                href="#analysis-tokens"
                className="block text-center bg-ember-500 hover:bg-ember-400 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full text-base transition-all"
              >
                Get analysis tokens ↑
              </a>
              <Link
                href="/analyze"
                className="block text-center bg-ink-950 hover:bg-ink-800 active:scale-[0.98] text-chalk font-bold px-8 py-4 rounded-full text-base transition-all"
              >
                Analyze your shot →
              </Link>
              <p className="text-ink-950/80 text-xs text-center">
                Have a token already? Head straight to the analyzer.
              </p>
            </div>
          </div>
        </section>
      )}

    </div>
  )
}

// Collapsible description row. `dark` renders it for the ink sections;
// otherwise it's styled for the light chalk band.
function ShopAccordion({
  title,
  dark = false,
  children,
}: {
  title: string
  dark?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      className={`group rounded-xl border ${
        dark ? 'border-courtline bg-ink-950/60' : 'border-ink-950/10 bg-white shadow-sm'
      }`}
    >
      <summary
        className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-sm font-bold ${
          dark ? 'text-chalk' : 'text-ink-950'
        }`}
      >
        {title}
        <span
          aria-hidden
          className={`shrink-0 transition-transform group-open:rotate-180 ${
            dark ? 'text-chalk-dim' : 'text-ink-950/40'
          }`}
        >
          ▾
        </span>
      </summary>
      <div
        className={`px-4 pb-4 text-sm leading-relaxed ${
          dark ? 'text-chalk-dim' : 'text-ink-950/60'
        }`}
      >
        {children}
      </div>
    </details>
  )
}

// The gallery media, in display order: hero product shot first, demo clips
// after. All slides share one frame so the gallery reads as one even unit.
/**
 * `label` is the short name on the carousel buttons; `description` is the
 * accessible name for the media itself.
 *
 * Both clips are silent, so WCAG 1.2.2 (Captions) does not apply — but SC 1.2.1
 * still wants a text alternative for video-only content, and the <video>
 * elements previously had no accessible name at all. A screen reader announced
 * an unlabelled media player, and "Demo video 1" would have been no better.
 */
const GALLERY_MEDIA: Array<{
  type: 'image' | 'video'
  src: string
  label: string
  description: string
}> = [
  {
    type: 'image',
    src: '/training-ball.png',
    label: 'Product photo',
    description:
      'The LearnHoops training basketball: black with white seams and the LearnHoops.com wordmark across one panel.',
  },
  {
    type: 'video',
    src: '/ball-video-1.mp4',
    label: 'Ball rotating, logo side',
    description:
      'Silent clip. The black training ball turns slowly on a white stand, showing the LearnHoops.com wordmark and the edge of the red printed hand-placement guide above it.',
  },
  {
    type: 'video',
    src: '/ball-video-2.mp4',
    label: 'Ball rotating, guide side',
    description:
      'Silent clip. The same ball keeps turning to show the printed shooting guide in full: a red hand outline with grey pads marking where each finger sits on the ball.',
  },
]

function MediaGallery() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'start' })
  const [selected, setSelected] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelected(emblaApi.selectedScrollSnap())
    // Pause any playing clip when it slides out of view.
    wrapRef.current?.querySelectorAll('video').forEach((v) => v.pause())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
  }, [emblaApi, onSelect])

  return (
    <div ref={wrapRef} className="relative">
      <div className="overflow-hidden rounded-3xl border border-courtline" ref={emblaRef}>
        <div className="flex">
          {GALLERY_MEDIA.map((m) => (
            <div key={m.src} className="shrink-0 basis-full min-w-0">
              <div className="aspect-[3/4] bg-ink-950">
                {m.type === 'image' ? (
                  <div className="relative w-full h-full bg-white">
                    <Image
                      src={m.src}
                      alt="The LearnHoops Training Ball — grip lines show where your fingers belong"
                      fill
                      className="object-contain"
                      sizes="(min-width: 1024px) 55vw, 100vw"
                      priority
                    />
                  </div>
                ) : (
                  <video
                    className="w-full h-full object-contain"
                    controls
                    preload="metadata"
                    playsInline
                    aria-label={m.description}
                  >
                    <source src={`${m.src}#t=0.001`} type="video/mp4" />
                  </video>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-label="Previous media"
        onClick={() => emblaApi?.scrollPrev()}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-ink-900/80 backdrop-blur border border-courtline hover:border-ember-500/60 text-chalk flex items-center justify-center transition-colors text-xl font-bold"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next media"
        onClick={() => emblaApi?.scrollNext()}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-ink-900/80 backdrop-blur border border-courtline hover:border-ember-500/60 text-chalk flex items-center justify-center transition-colors text-xl font-bold"
      >
        ›
      </button>

      <div className="flex items-center justify-center gap-2 mt-4">
        {GALLERY_MEDIA.map((m, i) => (
          // The dot used to BE the button, at 8x8 — failing WCAG 2.2 SC 2.5.8
          // (Target Size, 24x24). The dot keeps its size; the button grows
          // around it as an invisible 24px hit area, so the design is unchanged
          // but the target is reachable. aria-current also tells a screen
          // reader which slide is showing, which colour alone did not.
          <button
            key={m.src}
            type="button"
            aria-label={`Show ${m.label}`}
            aria-current={selected === i ? 'true' : undefined}
            onClick={() => emblaApi?.scrollTo(i)}
            className="min-h-6 min-w-6 flex items-center justify-center"
          >
            <span
              aria-hidden="true"
              className={`block h-2 rounded-full transition-all ${
                selected === i ? 'w-6 bg-ember-500' : 'w-2 bg-chalk-dim/40 hover:bg-chalk-dim/70'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function BundleSection({ isInApp = false }: { isInApp?: boolean }) {
  const { addBundle } = useCart()
  const [v1, setV1] = useState<Variant>('right')
  const [s1, setS1] = useState<Size>('7')
  const [v2, setV2] = useState<Variant>('right')
  const [s2, setS2] = useState<Size>('7')
  const [added, setAdded] = useState(false)

  const originalPrice = Math.round(PRICE * 2 * 100) / 100
  const savings = Math.round((originalPrice - BUNDLE_PRICE) * 100) / 100

  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(false), 2500)
    return () => clearTimeout(t)
  }, [added])

  function handleAdd() {
    addBundle(v1, s1, v2, s2)
    setAdded(true)
  }

  return (
    <section id="bundle" className="bg-ink-900 border-b border-courtline scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20 space-y-8">
        <div className="flex flex-wrap items-end gap-6 justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center bg-ember-500 text-ink-950 text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full select-none">
                Best Value
              </span>
              <span className="inline-flex items-center bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold px-3 py-1 rounded-full">
                10 Shot Analyses Included Free
              </span>
            </div>
            <h2 className="font-display font-black uppercase text-[clamp(1.9rem,4.5vw,3rem)] text-chalk leading-[0.95] mt-3">
              2-Ball Bundle
            </h2>
            <p className="text-chalk-dim text-sm max-w-md">
              Get 2 training balls + 10 free AI shot analyses. Second ball 50% off.
            </p>
          </div>
          <div className="text-right">
            <div className="font-numeric text-4xl font-medium text-chalk">
              {formatPrice(BUNDLE_PRICE)}
            </div>
            <div className="text-sm text-chalk-dim line-through">
              {formatPrice(originalPrice)}
            </div>
            <div className="text-sm text-green-400 font-semibold">
              Save {formatPrice(savings)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BallPicker
            label="Ball 1"
            variant={v1}
            size={s1}
            onVariant={setV1}
            onSize={setS1}
          />
          <BallPicker
            label="Ball 2"
            badge="50% off"
            variant={v2}
            size={s2}
            onVariant={setV2}
            onSize={setS2}
          />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button
            onClick={handleAdd}
            className="bg-ember-500 hover:bg-ember-400 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full text-base transition-all w-full sm:w-auto shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
          >
            Add Bundle to Cart — {formatPrice(BUNDLE_PRICE)}
          </button>

          {added && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3"
            >
              <span className="text-green-400 text-sm font-semibold">Added to cart</span>
              <Link
                href="/cart"
                className="text-ember-400 hover:text-ember-500 text-sm font-semibold underline"
              >
                View cart →
              </Link>
            </div>
          )}
        </div>

        {!isInApp && (
          <p className="text-chalk-dim text-xs">
            10 shot analysis credits will be added to your account automatically after purchase.
          </p>
        )}
      </div>
    </section>
  )
}

function BallPicker({
  label,
  badge,
  variant,
  size,
  onVariant,
  onSize,
}: {
  label: string
  badge?: string
  variant: Variant
  size: Size
  onVariant: (v: Variant) => void
  onSize: (s: Size) => void
}) {
  return (
    <div className="space-y-3 bg-ink-950 border border-courtline rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="text-white text-sm font-bold">{label}</span>
        {badge && (
          <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>

      <div>
        <label className="block text-zinc-400 text-xs font-semibold tracking-wider uppercase mb-1.5">Edition</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onVariant('right')}
            className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
              variant === 'right'
                ? 'border-ember-500 bg-ember-500/10'
                : 'border-courtline hover:border-chalk-dim/60'
            }`}
          >
            <div className="text-white font-semibold text-sm">Right</div>
            <div className="text-zinc-400 text-xs">Right-hand</div>
          </button>
          <button
            onClick={() => onVariant('left')}
            className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
              variant === 'left'
                ? 'border-ember-500 bg-ember-500/10'
                : 'border-courtline hover:border-chalk-dim/60'
            }`}
          >
            <div className="text-white font-semibold text-sm">Left</div>
            <div className="text-zinc-400 text-xs">Left-hand</div>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-zinc-400 text-xs font-semibold tracking-wider uppercase mb-1.5">Size</label>
        <div className="grid grid-cols-3 gap-2">
          {SIZES.map((s) => (
            <button
              key={s.value}
              onClick={() => onSize(s.value)}
              className={`rounded-lg border-2 px-2 py-2 text-center transition-colors ${
                size === s.value
                  ? 'border-ember-500 bg-ember-500/10'
                  : 'border-courtline hover:border-chalk-dim/60'
              }`}
            >
              <div className="text-white font-semibold text-sm">Size {s.value}</div>
              <div className="text-zinc-400 text-xs">{s.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
