import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import ShopProduct from './ShopProduct'
import GearWeLike from './GearWeLike'
import { isInAppRequest } from '@/lib/in-app'
import { regionFromServerHeaders } from '@/lib/region'
import { readyGear } from './gear'
import {
  BALL_SKUS,
  BASE_URL,
  BUNDLE_PRICE,
  BUNDLE_SKU,
  CURRENCY,
  PRICE,
  PRODUCT_DESCRIPTION,
  PRODUCT_IMAGES,
  PRODUCT_NAME,
  priceValidUntil,
} from './product'
import { SHOP_FAQ } from './faq'

export const metadata = {
  title: 'Basketball Shooting Training Ball with Finger Placement Guides | LearnHoops',
  description:
    'The LearnHoops Training Basketball teaches correct shooting form with printed finger-placement guides. Left and right-handed editions, three sizes, 5 free AI shot analyses included. $48.95.',
  alternates: { canonical: '/shop' },
  keywords: [
    'basketball shooting training ball',
    'training basketball finger placement',
    'basketball to improve shooting form',
    'shooting form trainer ball',
    'basketball hand placement guide',
    'youth basketball training ball',
  ],
  // Next merges metadata shallowly, so without its own openGraph this page was
  // serving the ROOT one — homepage title, homepage url — on every share and
  // every link preview of the product.
  openGraph: {
    title: 'LearnHoops Training Basketball — finger-placement guides that fix your form',
    description:
      'Printed grip lines show exactly where every finger belongs, so correct hand placement grooves itself on every rep. Left and right-handed editions, three sizes, 5 free AI shot analyses.',
    url: `${BASE_URL}/shop`,
    siteName: 'LearnHoops',
    type: 'website',
    images: PRODUCT_IMAGES,
  },
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const params = await searchParams
  // The ?app=ios param is lost on in-page navigation, so also check the
  // app WebView's User-Agent marker.
  const isInApp = params.app === 'ios' || (await isInAppRequest())
  // The gear shelf is region-specific, so whether there is anything to jump to
  // is too. ShopProduct is a Client Component and cannot read headers itself.
  const hasGear = readyGear(await regionFromServerHeaders()).length > 0
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      {/* Product structured data — feeds Google Shopping and the Product rich
          result. Every value comes from ./product.ts, which the buy box and the
          Merchant Center feed also read, so the three cannot disagree. A feed
          price that contradicts the page price is a Merchant Center suspension.

          Modelled as ProductGroup + hasVariant because there are six real SKUs
          (2 handedness editions x 3 sizes), not one product. A single Product
          node made the other five invisible to Shopping.

          No aggregateRating / review: there are no real reviews yet, and
          inventing them is a manual-action risk. Add them here when genuine
          ones exist — that is what puts stars under the result. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ProductGroup',
            '@id': `${BASE_URL}/shop#product`,
            name: PRODUCT_NAME,
            description: PRODUCT_DESCRIPTION,
            image: PRODUCT_IMAGES,
            // Reference the Organization already declared in the root @graph
            // rather than minting a loose Brand node Google has to guess at.
            brand: { '@id': `${BASE_URL}/#org` },
            productGroupID: 'LH-BALL',
            variesBy: ['https://schema.org/size', 'Handedness'],
            hasVariant: BALL_SKUS.map(v => ({
              '@type': 'Product',
              sku: v.sku,
              mpn: v.sku,
              name: v.title,
              description: v.description,
              image: PRODUCT_IMAGES,
              size: `${v.size} (${v.inches})`,
              additionalProperty: {
                '@type': 'PropertyValue',
                name: 'Handedness',
                value: v.variant === 'right' ? 'Right-handed' : 'Left-handed',
              },
              offers: {
                '@type': 'Offer',
                url: `${BASE_URL}/shop#training-ball`,
                price: PRICE.toFixed(2),
                priceCurrency: CURRENCY,
                priceValidUntil: priceValidUntil(),
                availability: 'https://schema.org/InStock',
                itemCondition: 'https://schema.org/NewCondition',
                seller: { '@id': `${BASE_URL}/#org` },
              },
            })),
            // The 2-ball bundle is a real thing you can buy and was absent from
            // structured data entirely.
            isRelatedTo: {
              '@type': 'Product',
              sku: BUNDLE_SKU,
              name: 'LearnHoops Training Basketball — 2-Ball Bundle',
              description:
                'Two LearnHoops Training Basketballs — the second at half price. Mix editions and sizes.',
              image: PRODUCT_IMAGES,
              brand: { '@id': `${BASE_URL}/#org` },
              offers: {
                '@type': 'Offer',
                url: `${BASE_URL}/shop#bundle`,
                price: BUNDLE_PRICE.toFixed(2),
                priceCurrency: CURRENCY,
                priceValidUntil: priceValidUntil(),
                availability: 'https://schema.org/InStock',
                itemCondition: 'https://schema.org/NewCondition',
                seller: { '@id': `${BASE_URL}/#org` },
              },
            },
          }),
        }}
      />
      {/* FAQPage from the same array the accordions render (./faq.ts), so the
          two cannot disagree. Six real questions were already sitting on this
          page unmarked — the cheapest structured data available here. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: SHOP_FAQ.map(f => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a.join(' ') },
            })),
          }),
        }}
      />
      <TopNav />

      <ShopProduct isInApp={isInApp} hasGear={hasGear} />

      {/* Affiliate recommendations. Deliberately below every LearnHoops
          product so an outbound link never intercepts our own sale, and
          outside ShopProduct so it stays a Server Component. */}
      <GearWeLike />

      <SiteFooter />
    </main>
  )
}
