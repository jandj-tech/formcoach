'use client'

import useEmblaCarousel from 'embla-carousel-react'
import { useCallback, useEffect, useState } from 'react'

export type Criterion = {
  id: number
  name: string
  description: string | null
}

const CHANNEL_URL = 'https://www.youtube.com/@LearnHoopsbasketball'

function videoSearchUrl(criterionName: string) {
  return `${CHANNEL_URL}/search?query=${encodeURIComponent(criterionName)}`
}

export default function CriteriaShowcase({
  criteria,
  videoMap = {},
}: {
  criteria: Criterion[]
  videoMap?: Record<string, string>
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
    slidesToScroll: 1,
  })
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setCanPrev(emblaApi.canScrollPrev())
    setCanNext(emblaApi.canScrollNext())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
  }, [emblaApi, onSelect])

  // Re-measure carousel when a card expands/collapses so heights stay aligned.
  useEffect(() => {
    emblaApi?.reInit()
  }, [openIds, emblaApi])

  function toggle(id: number) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (criteria.length === 0) return null

  return (
    <section className="bg-black py-14 sm:py-20">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col items-center text-center mb-8 px-4">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
            <span className="text-orange-500 text-xs font-semibold tracking-wider uppercase">{criteria.length} Coaching Criteria</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight">
            The fundamentals of <span className="text-orange-500">a great shot</span>
          </h2>
          <p className="text-white text-base mt-4 max-w-xl leading-relaxed">
            Every shot you upload is scored against these criteria. Tap any one to watch a video that breaks it down.
          </p>
        </div>

      <div className="relative">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-4 px-4 sm:px-6 items-stretch">
            {criteria.map((c, i) => {
              const isOpen = openIds.has(c.id)
              const videoId = videoMap[c.name]
              return (
                <div
                  key={c.id}
                  className="shrink-0 basis-[85%] sm:basis-[48%] lg:basis-[32%]"
                >
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 flex flex-col gap-3 h-full">
                    <div className="w-8 h-8 rounded-full bg-orange-500 text-white font-bold text-sm flex items-center justify-center">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <h3 className="text-white font-bold text-base leading-tight">{c.name}</h3>
                    {c.description && (
                      <p className="text-white text-xs leading-relaxed line-clamp-3 flex-1">{c.description}</p>
                    )}

                    {videoId ? (
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        aria-expanded={isOpen}
                        className="text-orange-500 hover:text-red-600 text-xs font-bold transition-colors mt-auto inline-flex items-center gap-1.5 self-start"
                      >
                        {isOpen ? 'Hide video' : 'Watch video'}
                        <span
                          aria-hidden
                          className={`inline-block transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        >
                          ▾
                        </span>
                      </button>
                    ) : (
                      <a
                        href={videoSearchUrl(c.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-500 hover:text-red-600 text-xs font-bold transition-colors mt-auto inline-flex items-center gap-1 self-start"
                      >
                        Watch on YouTube →
                      </a>
                    )}

                    {videoId && (
                      <div
                        className={`grid transition-all duration-300 ease-out ${
                          isOpen ? 'grid-rows-[1fr] mt-1' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="overflow-hidden">
                          {isOpen && (
                            <div className="aspect-video bg-black rounded-lg overflow-hidden">
                              <iframe
                                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
                                title={c.name}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                className="w-full h-full"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          aria-label="Previous criterion"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={!canPrev}
          className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-orange-500 hover:bg-red-600 disabled:opacity-30 text-white items-center justify-center transition-colors text-xl font-bold"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next criterion"
          onClick={() => emblaApi?.scrollNext()}
          disabled={!canNext}
          className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-orange-500 hover:bg-red-600 disabled:opacity-30 text-white items-center justify-center transition-colors text-xl font-bold"
        >
          ›
        </button>
      </div>

        <div className="flex justify-center mt-10 px-4">
          <a
            href={CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-base transition-colors"
          >
            Check out our channel →
          </a>
        </div>
      </div>
    </section>
  )
}
