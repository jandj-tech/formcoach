import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FormCoach — AI Basketball Shot Analysis',
  description:
    'Upload a video of your basketball shot and get an AI-powered breakdown of your form, scored across 10 key criteria.',
  openGraph: {
    title: 'FormCoach',
    description: 'Your shot. Perfected by AI.',
    siteName: 'FormCoach',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-900 text-white flex flex-col">{children}</body>
    </html>
  )
}
