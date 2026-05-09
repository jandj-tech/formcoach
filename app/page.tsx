import Image from 'next/image'
import VideoUploader from '@/components/VideoUploader'

export default function HomePage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-900">
      {/* Nav */}
      <nav className="flex items-center px-4 border-b border-slate-800">
        <Image src="/logo.png" alt="FormCoach" width={1024} height={1024} style={{ height: '160px', width: 'auto' }} priority />
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-4 pt-10 pb-8">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
          <span className="text-orange-400 text-xs font-semibold tracking-wider uppercase">AI Shot Analysis</span>
        </div>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white leading-tight max-w-2xl">
          Get your shot<br />
          <span className="text-orange-500">professionally analyzed</span>
        </h1>
        <p className="text-slate-400 text-base sm:text-lg mt-4 max-w-lg leading-relaxed px-2">
          Upload a video of your shot. Our AI studies 12 frames and scores 18 key form criteria — instantly.
        </p>
      </section>

      {/* Steps */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-4 pb-8 max-w-3xl mx-auto w-full">
        {[
          { num: '1', title: 'Upload Your Video', desc: 'Any angle, any device. MP4 or MOV.' },
          { num: '2', title: 'AI Analyzes Your Form', desc: '12 frames studied across 18 coaching criteria.' },
          { num: '3', title: 'Get Your Results', desc: 'We email you a private breakdown with scores & tips.' },
        ].map((step) => (
          <div key={step.num} className="bg-slate-800 rounded-xl p-5 text-center border border-slate-700">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white font-bold text-sm flex items-center justify-center mx-auto mb-3">
              {step.num}
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">{step.title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </section>

      {/* Upload Zone */}
      <section className="flex-1 flex flex-col items-center px-4 pb-16">
        <VideoUploader />
        <p className="text-slate-500 text-xs mt-4 text-center max-w-sm px-4">
          Your video is never stored long-term. Frames are analyzed and then used only to generate your report.
        </p>
      </section>

      <footer className="py-5 border-t border-slate-800 text-center text-slate-600 text-xs">
        © {new Date().getFullYear()} FormCoach. All rights reserved.
      </footer>
    </main>
  )
}
