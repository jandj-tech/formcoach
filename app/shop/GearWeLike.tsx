import Image from 'next/image'
import { regionFromServerHeaders } from '@/lib/region'
import { readyGear, amazonUrl } from './gear'

/**
 * Horizontally scrolling shelf of Amazon recommendations, sitting below the
 * LearnHoops products so it never competes with them for the sale.
 *
 * Deliberately a Server Component: it is static markup and native CSS
 * scroll-snap, so it ships no JavaScript. Renders nothing at all when no item
 * in gear.ts is finished, which keeps an in-progress list off production.
 *
 * The store is chosen from the visitor's country, because an Amazon tracking
 * ID only earns in its own store — a US visitor sent to amazon.ca, or a .ca
 * tag on an amazon.com link, silently earns nothing. Reading the country here
 * makes this route dynamic, which it already is.
 */
export default async function GearWeLike() {
  const region = await regionFromServerHeaders()
  const gear = readyGear(region)
  if (gear.length === 0) return null

  return (
    <section id="gear-we-like" className="px-4 pt-4 pb-16 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <p className="eyebrow text-ember-400 mb-2 select-none">Gear we like</p>
        <h2 className="font-display font-black uppercase text-[clamp(1.6rem,3.5vw,2.4rem)] text-chalk leading-[0.95]">
          The rest of the <span className="text-gradient-ember">kit bag</span>
        </h2>
        <p className="text-chalk-dim text-sm mt-2 max-w-xl">
          Things we actually use that we do not make. These are Amazon links, not
          LearnHoops products — Amazon handles the price, the shipping and the returns.
        </p>

        {/* Disclosure. Amazon requires this near the links, not in the footer. */}
        <p className="text-chalk-dim/70 text-xs mt-3 max-w-xl">
          As an Amazon Associate, LearnHoops earns from qualifying purchases. It costs
          you nothing extra and it helps keep the analysis cheap.
        </p>

        {/* Full-bleed on mobile so the shelf visibly runs off the edge and
            reads as scrollable without a hint arrow. */}
        <ul
          className="flex gap-4 mt-6 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 sm:mx-0 sm:px-0"
          style={{ scrollbarWidth: 'thin' }}
        >
          {gear.map((item) => (
            <li
              key={item.asin}
              className="snap-start shrink-0 w-[78%] sm:w-[320px] flex"
            >
              <a
                href={amazonUrl(item.asin, region)}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                className="group flex flex-col gap-3 w-full bg-ink-900/60 border border-courtline hover:border-ember-500/60 rounded-2xl p-5 transition-colors"
              >
                {/* Product shots come on white, so the tile is white on
                    purpose — an off-white would show a seam. Fixed aspect and
                    object-contain so an uncropped portrait photo cannot make
                    one card taller than its neighbours on the shelf. */}
                {/* The tile widens instead of subdividing when there are two
                    photos, which keeps every CELL square. The files are square
                    too, so each fills its cell exactly: nothing is cropped and
                    no tile colour shows through — the images do not share a
                    background, so any letterboxing would read as a seam. */}
                {item.images && item.images.length > 0 && (
                  <span
                    className={`grid gap-1 w-full rounded-xl overflow-hidden ${
                      item.images.length > 1
                        ? 'grid-cols-2 aspect-[2/1]'
                        : 'grid-cols-1 aspect-square'
                    }`}
                  >
                    {item.images.slice(0, 2).map((img) => (
                      <span key={img.src} className="relative block h-full w-full">
                        <Image
                          src={img.src}
                          alt={img.alt}
                          fill
                          loading="lazy"
                          sizes="(min-width: 640px) 160px, 39vw"
                          className="object-cover"
                        />
                      </span>
                    ))}
                  </span>
                )}
                <span className="text-zinc-400 text-xs font-semibold tracking-wider uppercase">
                  {item.kind}
                </span>
                <span className="text-white font-bold text-lg leading-tight">
                  {item.name}
                </span>
                <span className="text-chalk-dim text-sm leading-relaxed flex-1">
                  {item.blurb}
                </span>
                <span className="inline-flex items-center gap-1.5 text-ember-400 text-sm font-bold mt-1">
                  View on Amazon
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                    &rarr;
                  </span>
                </span>
                <span className="text-chalk-dim/60 text-xs">
                  Price and availability on Amazon
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
