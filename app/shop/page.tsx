import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import ShopProduct from './ShopProduct'
import { isInAppRequest } from '@/lib/in-app'

export const metadata = {
  title: 'Basketball Shooting Training Ball with Finger Placement Guides | LearnHoops',
  description:
    'The LearnHoops Training Basketball teaches correct shooting form with printed finger-placement guides. Left and right-handed editions, three sizes, 5 free AI shot analyses included. $39.99.',
  alternates: { canonical: '/shop' },
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const params = await searchParams
  // The ?app=ios param is lost on in-page navigation, so also check the
  // app WebView's User-Agent marker.
  const isInApp = params.app === 'ios' || (await isInAppRequest())
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      {/* Product structured data — feeds Google Shopping / rich results. Keep
          the price in sync with PRICE in ShopProduct.tsx. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'LearnHoops Training Basketball',
            image: 'https://www.learnhoops.com/training-ball.png',
            description:
              'Basketball with printed finger-placement guides that teach correct shooting form on every rep. Left and right-handed editions in three sizes. Includes 5 free AI shot analyses.',
            brand: { '@type': 'Brand', name: 'LearnHoops' },
            offers: {
              '@type': 'Offer',
              url: 'https://www.learnhoops.com/shop',
              price: '39.99',
              priceCurrency: 'USD',
              availability: 'https://schema.org/InStock',
            },
          }),
        }}
      />
      <TopNav />

      <ShopProduct isInApp={isInApp} />

      <SiteFooter />
    </main>
  )
}
