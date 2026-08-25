import type { Metadata, Viewport } from 'next'
import { Archivo, Geist, Geist_Mono, Space_Grotesk } from 'next/font/google'
import { ViewTransition } from 'react'
import './globals.css'
import { CartProvider } from '@/lib/cart'
import MetaPixel from '@/components/MetaPixel'
import CopyToast from '@/components/CopyToast'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
// Display face for headlines — variable width axis gives the expanded, broadcast look.
const archivo = Archivo({ variable: '--font-archivo', subsets: ['latin'], axes: ['wdth'] })
// Numerals for scores, prices, and stats.
const spaceGrotesk = Space_Grotesk({ variable: '--font-space-grotesk', subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://www.learnhoops.com'),
  title: 'AI Basketball Shot Analysis & Shooting Form Coach | LearnHoops',
  description:
    'AI basketball shot analysis that fixes your shooting form. Upload a video of your jump shot and get graded on 18 coaching criteria — elbow, stance, arc, follow-through — with drills to improve, in minutes.',
  keywords: [
    'basketball shot analysis',
    'AI basketball',
    'basketball shooting form',
    'jump shot analyzer',
    'basketball form coach',
    'shooting form trainer',
    'basketball training app',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    title: 'AI Basketball Shot Analysis & Shooting Form Coach | LearnHoops',
    description: 'Upload a video of your jump shot, get graded on 18 shooting-form criteria with drills to improve.',
    siteName: 'LearnHoops',
    url: 'https://www.learnhoops.com',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  verification: {
    google: [
      'Iok757H3x4dbsU-C1vIkVgSCcTwArojeOPpUoL9fBGo',
      'C8bH1Na1x-sQwjH6YK29dhGv7vdv1kF5rLy3ENh1cAs',
    ],
  },
}

// viewport-fit=cover lets the dark chrome extend under the iPhone notch inside
// the app WebView; themeColor keeps the status bar blended with the ink canvas.
export const viewport: Viewport = {
  themeColor: '#0a0a0b',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-black flex flex-col">
        {/* Structured data: tells search engines who we are and what the site
            does — feeds rich results for brand and product searches. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': 'https://www.learnhoops.com/#org',
                  name: 'LearnHoops',
                  url: 'https://www.learnhoops.com',
                  logo: 'https://www.learnhoops.com/icon.png',
                  sameAs: ['https://www.youtube.com/@LearnHoopsbasketball'],
                },
                {
                  '@type': 'WebSite',
                  name: 'LearnHoops',
                  url: 'https://www.learnhoops.com',
                  publisher: { '@id': 'https://www.learnhoops.com/#org' },
                },
                {
                  '@type': 'SoftwareApplication',
                  name: 'LearnHoops AI Basketball Shot Analysis',
                  applicationCategory: 'SportsApplication',
                  operatingSystem: 'Web, iOS',
                  url: 'https://www.learnhoops.com/analyze',
                  description:
                    'Upload a video of your basketball jump shot and AI grades your shooting form on 18 coaching criteria — elbow alignment, stance, arc, follow-through — with personalized drills to improve.',
                  offers: {
                    '@type': 'Offer',
                    price: '3.49',
                    priceCurrency: 'USD',
                    description: 'Per shot analysis.',
                  },
                },
              ],
            }),
          }}
        />
        <CartProvider>
          <MetaPixel />
          <CopyToast />
          <ViewTransition default="page-fade">{children}</ViewTransition>
        </CartProvider>
      </body>
    </html>
  )
}
