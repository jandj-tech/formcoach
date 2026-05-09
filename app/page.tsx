import Image from 'next/image'
import VideoUploader from '@/components/VideoUploader'

export default function HomePage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-900">
      {/* Nav */}
      <nav className="flex items-center px-6 py-4 border-b border-slate-800">
        <Image src="/logo.svg" alt="FormCoach" width={180} height={40} priority />
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-20 pb-12">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-6">
          <span className="text-orange-400 text-xs font-semibold tracking-wider uppercase">AI Shot Analysis</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black text-white leading-tight max-w-2xl">
          Get your shot<br />
          <span className="text-orange-500">professionally analyzed</span>
        </h1>
        <p className="text-slate-400 text-lg mt-6 max-w-lg leading-relaxed">
          Upload a video of your shot. Our AI studies 10–15 frames from your motion and scores 10 key form criteria — instantly.
        </p>
      </section>

      {/* Steps */}
      <section className="flex flex-col sm:flex-row items-center justify-center gap-6 px-6 pb-12 max-w-3xl mx-auto w-full">
        {[
          { num: '1', title: 'Upload Your Video', desc: 'Any angle, any device. MP4 or MOV.' },
          { num: '2', title: 'AI Analyzes Your Form', desc: '12 frames studied across 10 coaching criteria.' },
          { num: '3', title: 'Get Your Results', desc: 'We email you a private breakdown with scores & tips.' },
        ].map((step) => (
          <div key={step.num} className="flex-1 bg-slate-800 rounded-xl p-6 text-center border border-slate-700">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white font-bold text-sm flex items-center justify-center mx-auto mb-3">
              {step.num}
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">{step.title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </section>

      {/* Upload Zone */}
      <section className="flex-1 flex flex-col items-center px-6 pb-20">
        <VideoUploader />
        <p className="text-slate-500 text-xs mt-6 text-center max-w-sm">
          Your video is never stored long-term. Frames are analyzed and then used only to generate your report.
        </p>
      </section>

      <footer className="py-6 border-t border-slate-800 text-center text-slate-600 text-xs">
        © {new Date().getFullYear()} FormCoach. All rights reserved.
      </footer>
    </main>
  )
}
