import AppearanceSection from '@/components/account/AppearanceSection'

// Admin settings. Only Appearance for now — admin was dark-only until the
// theme switch landed, so this is the page that lets you leave it that way or
// not. It reuses the same card every other account type shows.
export default function AdminSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-black dark:text-white">Settings</h1>
        <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">
          Applies to the admin pages on this device.
        </p>
      </div>

      <AppearanceSection />
    </div>
  )
}
