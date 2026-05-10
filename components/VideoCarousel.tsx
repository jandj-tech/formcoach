'use client'

import useEmblaCarousel from 'embla-carousel-react'
import { useCallback, useEffect, useState } from 'react'
import type { YouTubeVideo } from '@/lib/youtube'

export default function VideoCarousel({ videos }: { videos: YouTubeVideo[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
  })
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

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

  if (videos.length === 0) return null

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4 px-4 sm:px-6">
          {videos.map((v) => (
            <div
              key={v.id}
              className="shrink-0 basis-[85%] sm:basis-[55%] lg:basis-[40%]"
            >
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="aspect-video bg-black">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${v.id}`}
                    title={v.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-black font-semibold text-sm line-clamp-2">{v.title}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-label="Previous video"
        onClick={() => emblaApi?.scrollPrev()}
        disabled={!canPrev}
        className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-orange-500 hover:bg-red-600 disabled:opacity-30 text-white items-center justify-center transition-colors text-xl font-bold"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next video"
        onClick={() => emblaApi?.scrollNext()}
        disabled={!canNext}
        className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-orange-500 hover:bg-red-600 disabled:opacity-30 text-white items-center justify-center transition-colors text-xl font-bold"
      >
        ›
      </button>
    </div>
  )
}
