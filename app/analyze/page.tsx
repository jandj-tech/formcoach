import TopNav from '@/components/TopNav'
import VideoUploader from '@/components/VideoUploader'

export default function AnalyzePage() {
  return (
    <main className="flex flex-col min-h-screen bg-white">
      <TopNav />

      <section className="flex flex-col items-center text-center px-4 pt-10 pb-6">
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight max-w-2xl">
          Analyze your <span className="text-orange-500">shot</span>
        </h1>
        <p className="text-gray-500 text-sm sm:text-base mt-3 max-w-md">
          Upload a video and our AI will score your form across 17 coaching criteria.
        </p>
      </section>

      <section className="flex-1 flex flex-col items-center px-4 pb-16">
        <VideoUploader />
        <p className="text-gray-400 text-xs mt-4 text-center max-w-sm px-4">
          Your video is never stored long-term. Frames are analyzed and then used only to generate your report.
        </p>
      </section>

      <footer className="py-5 border-t border-gray-200 text-center text-gray-400 text-xs">
        © {new Date().getFullYear()} LearnHoops. All rights reserved.
      </footer>
    </main>
  )
}
